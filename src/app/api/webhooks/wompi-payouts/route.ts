import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type WompiWebhookEvent, isValidChecksum, isFreshTimestamp } from '@/lib/wompi/webhookSignature'

// Wompi Payouts' own "URL de Eventos" webhook (comercios.wompi.co →
// Desarrollo → Pagos a Terceros), separate from the checkout product's
// transaction.updated webhook (src/app/api/webhooks/wompi/route.ts) — its
// own secret (WOMPI_PAYOUTS_EVENTS_SECRET), its own event stream. This is
// the async confirmation provider_payouts.status='paid' was always reserved
// for (see the column comment in
// supabase/migrations/20260830200000_create_provider_payouts_ledger.sql):
// sendProviderPayout()'s synchronous response only means Wompi ACCEPTED the
// payout request ('sent'), not that the bank transfer actually completed.
//
// Real, confirmed status vocabulary (docs.wompi.co/docs/colombia/
// consultas-y-operaciones/ — GET /payouts and GET /payouts/{id}/transactions):
//   lote-level:       PENDING, REJECTED, TOTAL_PAYMENT, PARTIAL_PAYMENT,
//                      PENDING_APPROVAL, NOT_APPROVED
//   transaction-level: PROCESSING, PENDING, APPROVED, FAILED, REJECTED
// sendProviderPayout() always creates exactly one lote with exactly one
// transaction inside it, so both vocabularies funnel to the same two
// outcomes this route acts on — anything else just means "still in flight",
// logged and left alone rather than guessed at.
//
// NOT confirmed (unlike the vocabulary above): the exact event name and
// where in the JSON payload the payout id/status actually live — Wompi's
// docs don't publish this for Payouts the way they do for
// transaction.updated. parsePayoutEvent() below is a best-effort reading of
// the most likely shape, deliberately defensive, with a shape summary (field
// names/types, never values) logged on every valid delivery so the first
// real event can confirm or correct it — same practice already used in this
// codebase for WOMPI_PAYOUTS_BASE_URL and the /banks response shape.
const PAID_STATUSES = new Set(['APPROVED', 'TOTAL_PAYMENT'])
const FAILED_STATUSES = new Set(['FAILED', 'REJECTED', 'NOT_APPROVED'])

// A payout event's payload can carry real PII/financial data — legal id
// (cédula/NIT), name, email, bank account number — per the transaction shape
// Wompi's own sandbox docs show for POST /payouts. This must never reach
// application logs verbatim. Recursively replaces every value with its own
// type name, keeping field names and nesting intact so the shape can still
// be confirmed against the field names parsePayoutEvent() assumes (id,
// status, reason/message/error), without ever logging an actual value.
function summarizeShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(summarizeShape)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, summarizeShape(v)]))
  }
  return value === null ? 'null' : typeof value
}

function parsePayoutEvent(
  event: WompiWebhookEvent,
): { wompiPayoutId: string; status: string; reason: string | null } | null {
  const payout = ((event.data as { payout?: unknown }).payout ?? event.data) as Record<string, unknown>
  const id = payout?.id
  const status = payout?.status
  if (typeof id !== 'string' || !id || typeof status !== 'string' || !status) return null
  // Same unconfirmed-shape caveat as id/status above: reason/message/error
  // are the most likely field names for a rejection reason, checked in that
  // order, but none are confirmed against a real event yet.
  const reason = payout?.reason ?? payout?.message ?? payout?.error
  return { wompiPayoutId: id, status: status.toUpperCase(), reason: typeof reason === 'string' ? reason : null }
}

export async function POST(request: Request) {
  const secret = process.env.WOMPI_PAYOUTS_EVENTS_SECRET
  if (!secret) {
    console.error('WOMPI_PAYOUTS_EVENTS_SECRET is not configured; rejecting Wompi Payouts webhook')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  let event: WompiWebhookEvent
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!isValidChecksum(event, secret)) {
    console.error('Wompi Payouts webhook checksum mismatch — rejecting')
    return NextResponse.json({ error: 'invalid checksum' }, { status: 401 })
  }

  if (!isFreshTimestamp(event.timestamp)) {
    console.error('Wompi Payouts webhook event timestamp outside the accepted window — rejecting', {
      timestamp: event.timestamp,
    })
    return NextResponse.json({ error: 'stale event' }, { status: 401 })
  }

  // Evidence trail for correcting parsePayoutEvent()'s shape assumption
  // against the first real event — see the header comment above. Shape only
  // (field names/types), never actual values — the payload can carry real
  // PII/financial data.
  console.info('Wompi Payouts webhook received', { event: event.event, shape: summarizeShape(event.data) })

  const parsed = parsePayoutEvent(event)
  if (!parsed) {
    console.error('Wompi Payouts webhook payload missing an id/status in the expected shape', {
      shape: summarizeShape(event.data),
    })
    return NextResponse.json({ received: true })
  }

  const mappedStatus = PAID_STATUSES.has(parsed.status) ? 'paid' : FAILED_STATUSES.has(parsed.status) ? 'failed' : null

  if (!mappedStatus) {
    // Still in flight (PROCESSING/PENDING/PARTIAL_PAYMENT/PENDING_APPROVAL) —
    // never guess a money-state transition on a non-terminal status.
    return NextResponse.json({ received: true })
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('confirm_provider_payout_from_webhook', {
    p_wompi_payout_id: parsed.wompiPayoutId,
    p_status: mappedStatus,
    p_error_message: mappedStatus === 'failed' ? parsed.reason : null,
  })

  if (error) {
    console.error('Failed to apply Wompi Payouts webhook confirmation', error)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
