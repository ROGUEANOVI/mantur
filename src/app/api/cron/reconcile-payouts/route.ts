import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePayoutAccount, sendProviderPayout } from '@/lib/wompi/payouts'
import { STUCK_PAYOUT_HOURS, SENDING_ORPHAN_MINUTES } from '@/app/(app)/admin/pendingCounts'

// Vercel Cron (see vercel.json) hits this once a day (Hobby plan — no
// hourly granularity). Automatically re-drives provider_payouts rows an
// admin would otherwise have to notice and retry by hand in
// /admin/pagos-proveedores: 'failed' rows (any age — a transient failure
// should not wait for a human to click retry), 'pending' rows older than
// STUCK_PAYOUT_HOURS (48h — a fresh 'pending' row is probably just about to
// be sent by its own webhook/payout-loop caller, so only stale ones are
// candidates here), and 'sending' rows orphaned for longer than
// SENDING_ORPHAN_MINUTES (the claiming process crashed before recording a
// result — reset_stale_sending_provider_payouts() flips these to 'failed'
// first, so they fall straight into the same 'failed' candidate branch
// below; safe because sendProviderPayout()'s idempotency-key is the row's
// own id, so a reset-then-retried row can never cause Wompi to execute the
// same payout twice).
//
// Reuses exactly the claim -> resolvePayoutAccount -> sendProviderPayout ->
// mark_provider_payout_result sequence retryProviderPayout() already runs
// for a single admin-submitted id (same file) — this just runs it over every
// stale candidate, with p_admin_id omitted (defaults to NULL; no human is
// involved in an automatic run, same convention as
// enqueueAndSendProviderPayout()'s own claim call).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET is not configured; rejecting cron invocation')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    console.warn('Cron reconcile-payouts: invalid or missing bearer token')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: resetOrphans, error: resetError } = await admin.rpc('reset_stale_sending_provider_payouts', {
    p_orphan_minutes: SENDING_ORPHAN_MINUTES,
  })

  if (resetError) {
    // Non-fatal: still worth attempting the pending/failed reconciliation
    // below even if the orphan reset itself failed for some reason.
    console.error('Failed to reset orphaned sending provider payouts', resetError)
  }

  const stuckPendingCutoff = new Date(Date.now() - STUCK_PAYOUT_HOURS * 60 * 60 * 1000).toISOString()

  // Capped well above any realistic daily volume for this business — a
  // backlog larger than this would need attention beyond what a cron job
  // silently retrying can provide anyway; any leftover rows are simply
  // picked up on the next day's run.
  const { data: candidates, error: candidatesError } = await admin
    .from('provider_payouts')
    .select('id')
    .or(`status.eq.failed,and(status.eq.pending,created_at.lt.${stuckPendingCutoff})`)
    .limit(200)

  if (candidatesError) {
    console.error('Failed to query stuck provider payouts for reconciliation', candidatesError)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  let retried = 0
  let failed = 0

  for (const row of candidates ?? []) {
    const { data: claimed, error: claimError } = await admin
      .rpc('claim_provider_payout_for_send', { p_payout_id: row.id })
      .single<{ transaction_id: string; recipient_type: 'business' | 'guide'; recipient_id: string; amount_cents: number }>()

    if (claimError) {
      console.error('Failed to claim provider payout during reconciliation', claimError)
      continue
    }
    // No row claimed (claimed is falsy with no error) — a concurrent
    // claimant (an admin retry, or a fresh automatic attempt) already
    // claimed or resolved this payout since the candidate query ran.
    if (!claimed) continue

    try {
      const recipient = await resolvePayoutAccount(admin, claimed.recipient_type, claimed.recipient_id)

      if (!recipient) {
        await admin.rpc('mark_provider_payout_result', {
          p_payout_id: row.id,
          p_status: 'failed',
          p_error_message: `no payout account configured for ${claimed.recipient_type} ${claimed.recipient_id}`,
        })
        failed++
        continue
      }

      const result = await sendProviderPayout({
        idempotencyKey: row.id,
        amountCents: claimed.amount_cents,
        recipient,
      })

      if (result.ok) {
        await admin.rpc('mark_provider_payout_result', {
          p_payout_id: row.id,
          p_status: 'sent',
          p_wompi_payout_id: result.wompiPayoutId,
        })
        retried++
      } else {
        console.error('Wompi Payouts API call failed during reconciliation', result.error)
        await admin.rpc('mark_provider_payout_result', {
          p_payout_id: row.id,
          p_status: 'failed',
          p_error_message: result.error,
        })
        failed++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Unexpected error while reconciling a provider payout', error)
      await admin.rpc('mark_provider_payout_result', {
        p_payout_id: row.id,
        p_status: 'failed',
        p_error_message: `unexpected error during reconciliation: ${message}`,
      })
      failed++
    }
  }

  return NextResponse.json({
    ok: true,
    resetOrphans: resetOrphans?.length ?? 0,
    candidates: candidates?.length ?? 0,
    retried,
    failed,
  })
}
