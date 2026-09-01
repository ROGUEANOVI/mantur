'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePayoutAccount, sendProviderPayout } from '@/lib/wompi/payouts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthenticatedAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return { admin: createAdminClient(), adminId: user.id }
}

// Re-attempts the actual Wompi Payouts call for a stuck ('pending' or
// 'failed') provider_payouts row — the exact same claim/send/resolve
// sequence enqueueAndSendPayout() runs in the webhook route (both now share
// claim_provider_payout_for_send, see that function's migration comment),
// just entered from an already-claimed row instead of a fresh enqueue.
// Fixes transient failures; a structural failure (e.g. no payout account
// configured) will fail again with the same error, which is the correct
// outcome — see resolveProviderPayoutManually for that case.
//
// Wrapped in try/catch: once the row is claimed (moved to 'sending'), it has
// no automatic timeout/reversion — an uncaught exception here (e.g. a
// transient Supabase error from resolvePayoutAccount) would otherwise leave
// it permanently stuck at 'sending' with no clean way back to 'pending'. On
// any unexpected error, mark the payout failed so it returns to a normal,
// re-retriable state rather than requiring the (deliberately delayed, see
// mark_provider_payout_resolved_manually) manual-resolution escape hatch.
export async function retryProviderPayout(formData: FormData): Promise<void> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const payoutId = formData.get('payoutId') as string
  if (!UUID_RE.test(payoutId)) redirect('/admin/pagos-proveedores')

  const { data: claimed, error: claimError } = await admin
    .rpc('claim_provider_payout_for_send', { p_payout_id: payoutId, p_admin_id: adminId })
    .single<{ transaction_id: string; recipient_type: 'business' | 'guide'; recipient_id: string; amount_cents: number }>()

  if (claimError) {
    console.error('Failed to claim provider payout for retry', claimError)
  } else if (claimed) {
    // No row claimed (claimed is falsy with no error) — another action (a
    // concurrent retry, or the webhook's own automatic attempt) already
    // claimed or resolved this payout in the meantime. Nothing left to do;
    // the page will show its current state on reload.
    try {
      const recipient = await resolvePayoutAccount(admin, claimed.recipient_type, claimed.recipient_id)

      if (!recipient) {
        await admin.rpc('mark_provider_payout_result', {
          p_payout_id: payoutId,
          p_status: 'failed',
          p_error_message: `no payout account configured for ${claimed.recipient_type} ${claimed.recipient_id}`,
        })
      } else {
        const result = await sendProviderPayout({
          idempotencyKey: payoutId,
          amountCents: claimed.amount_cents,
          recipient,
        })

        if (result.ok) {
          await admin.rpc('mark_provider_payout_result', {
            p_payout_id: payoutId,
            p_status: 'sent',
            p_wompi_payout_id: result.wompiPayoutId,
          })
        } else {
          console.error('Wompi Payouts API call failed on retry', result.error)
          await admin.rpc('mark_provider_payout_result', {
            p_payout_id: payoutId,
            p_status: 'failed',
            p_error_message: result.error,
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Unexpected error while retrying a provider payout', error)
      await admin.rpc('mark_provider_payout_result', {
        p_payout_id: payoutId,
        p_status: 'failed',
        p_error_message: `unexpected error during retry: ${message}`,
      })
    }
  }

  revalidatePath('/admin/pagos-proveedores')
}

// The recipient was paid out-of-band (bank transfer, cash, etc.) — records
// the payout as resolved without going through Wompi. For structural
// failures a retry can never fix on its own (e.g. the recipient has no
// payout account configured).
export async function resolveProviderPayoutManually(formData: FormData): Promise<void> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const payoutId = formData.get('payoutId') as string
  const notes = (formData.get('notes') as string | null)?.trim()
  if (!UUID_RE.test(payoutId) || !notes) redirect('/admin/pagos-proveedores')

  const { data: resolved, error } = await admin.rpc('mark_provider_payout_resolved_manually', {
    p_payout_id: payoutId,
    p_admin_id: adminId,
    p_notes: notes,
  })

  if (error) {
    console.error('Failed to manually resolve provider payout', error)
  } else if (!resolved) {
    // false means no row matched — the payout is either already resolved,
    // or (for a still-'sending' row) not yet old enough to claim manually,
    // see mark_provider_payout_resolved_manually's own comment. Either way
    // the admin's submitted form is stale; nothing to apply.
    console.error('Manual payout resolution did not apply — payout already resolved or not yet eligible', { payoutId })
  }

  revalidatePath('/admin/pagos-proveedores')
}
