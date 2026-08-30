import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNetPayoutAmountCents, sendProviderPayout, type PayoutRecipient } from '@/lib/wompi/payouts'
import { sendRefundProcessedEmail } from '@/lib/email/refundEmails'

type AdminClient = ReturnType<typeof createAdminClient>

type WompiWebhookEvent = {
  event: string
  data: Record<string, unknown>
  timestamp: number
  signature?: { properties: string[]; checksum: string }
}

// Wompi's `signature.properties` are dotted paths into `data`
// (e.g. "transaction.id" -> data.transaction.id). Per Wompi's own docs, the
// set of properties can vary per event, so this must resolve paths
// dynamically rather than assume a fixed shape.
function resolvePath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, source)
}

// Wompi's event-integrity formula: SHA256(concat(propertyValues) + timestamp + eventsSecret).
// We recompute it ourselves from the payload and the secret only we and
// Wompi know, then compare against the checksum Wompi included — an
// attacker without the secret cannot produce a matching value no matter
// what they put in the request body.
function isValidChecksum(event: WompiWebhookEvent, secret: string): boolean {
  if (!event.signature?.properties?.length || !event.signature.checksum || !event.timestamp) return false

  const concatenated =
    event.signature.properties.map((path) => String(resolvePath(event.data, path) ?? '')).join('') +
    String(event.timestamp) +
    secret

  const expected = createHash('sha256').update(concatenated).digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(event.signature.checksum, 'utf8')

  // timingSafeEqual throws on mismatched lengths — a checksum of the wrong
  // length can never be valid, so treat that as a mismatch rather than crash.
  if (expectedBuf.length !== receivedBuf.length) return false
  return timingSafeEqual(expectedBuf, receivedBuf)
}

const APPLICABLE_STATUSES = new Set(['APPROVED', 'DECLINED', 'ERROR', 'VOIDED', 'PENDING'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A generous window, comfortably wider than Wompi's own documented 24h/
// 3-retry delivery policy — legitimate late retries must never be rejected.
// This exists only to bound how long a captured, validly-signed event stays
// replayable, not to enforce real-time delivery.
const MAX_EVENT_AGE_SECONDS = 48 * 60 * 60
// Small allowance for clock skew between our server and Wompi's.
const MAX_CLOCK_SKEW_SECONDS = 5 * 60

function isFreshTimestamp(timestamp: number): boolean {
  const nowSeconds = Date.now() / 1000
  const age = nowSeconds - timestamp
  return age >= -MAX_CLOCK_SKEW_SECONDS && age <= MAX_EVENT_AGE_SECONDS
}

type PayoutAccountRow = {
  bank_name: string
  wompi_bank_id: string | null
  account_type: 'ahorros' | 'corriente'
  account_number: string
  holder_id_type: 'CC' | 'CE' | 'NIT'
  holder_id_number: string
  holder_name: string
  holder_email: string
}

// Resolves the recipient's stored bank details and attempts the actual
// Wompi Payouts call. Deliberately never throws and never affects the
// webhook's own HTTP response — the payment was already confirmed by the
// caller before this runs, so a payout failure here is a ledger entry for
// admin follow-up (provider_payouts.status = 'failed'), not a reason to make
// Wompi retry a webhook whose payment-confirmation half already succeeded.
async function enqueueAndSendPayout(
  admin: AdminClient,
  params: {
    transactionId: string
    businessId: string | null
    guideId: string | null
    amountInCents: number
    commissionAmountCents: number
  },
): Promise<void> {
  try {
    const recipientType = params.businessId ? 'business' : params.guideId ? 'guide' : null
    const recipientId = params.businessId ?? params.guideId
    if (!recipientType || !recipientId) {
      console.error('Wompi webhook: paid transaction has no business_id or guide_id to pay out to', {
        transactionId: params.transactionId,
      })
      return
    }

    const amountCents = computeNetPayoutAmountCents(params.amountInCents, params.commissionAmountCents)

    // A 100%-commission service type would legitimately owe the recipient
    // nothing — that is a valid outcome, not a failure, and must not be
    // logged as one (provider_payouts.amount_cents has its own `> 0` CHECK,
    // which would otherwise turn this into a generic-looking enqueue error).
    if (amountCents <= 0) return

    const { data: enqueued, error: enqueueError } = await admin
      .rpc('enqueue_provider_payout', {
        p_transaction_id: params.transactionId,
        p_recipient_type: recipientType,
        p_recipient_id: recipientId,
        p_amount_cents: amountCents,
      })
      .single<{ id: string; status: string; is_new: boolean }>()

    if (enqueueError || !enqueued) {
      console.error('Failed to enqueue provider payout', enqueueError)
      return
    }

    // Only attempt to send when the ledger row is still pending — if a
    // previous attempt already sent/failed it, this webhook delivery is a
    // retry of an already-confirmed payment and there is nothing left to do.
    if (enqueued.status !== 'pending') return

    const table = recipientType === 'business' ? 'business_payout_accounts' : 'tourist_guide_payout_accounts'
    const idColumn = recipientType === 'business' ? 'business_id' : 'guide_id'

    const { data: account, error: accountError } = await admin
      .from(table)
      .select('bank_name, wompi_bank_id, account_type, account_number, holder_id_type, holder_id_number, holder_name, holder_email')
      .eq(idColumn, recipientId)
      .maybeSingle<PayoutAccountRow>()

    if (accountError || !account) {
      await admin.rpc('mark_provider_payout_result', {
        p_payout_id: enqueued.id,
        p_status: 'failed',
        p_error_message: `no payout account configured for ${recipientType} ${recipientId}`,
      })
      return
    }

    const recipient: PayoutRecipient = {
      legalIdType: account.holder_id_type,
      legalId: account.holder_id_number,
      wompiBankId: account.wompi_bank_id ?? '',
      accountType: account.account_type,
      accountNumber: account.account_number,
      name: account.holder_name,
      email: account.holder_email,
    }

    const result = await sendProviderPayout({ idempotencyKey: enqueued.id, amountCents, recipient })

    if (result.ok) {
      await admin.rpc('mark_provider_payout_result', {
        p_payout_id: enqueued.id,
        p_status: 'sent',
        p_wompi_payout_id: result.wompiPayoutId,
      })
    } else {
      console.error('Wompi Payouts API call failed', result.error)
      await admin.rpc('mark_provider_payout_result', {
        p_payout_id: enqueued.id,
        p_status: 'failed',
        p_error_message: result.error,
      })
    }
  } catch (error) {
    console.error('Unexpected error while processing a provider payout', error)
  }
}

// The missing async confirmation for a same-day refund void: Wompi's own
// void-request response doesn't reliably confirm VOIDED synchronously (see
// the comment on voidWompiTransaction), so this is where that confirmation
// actually lands — a VOIDED transaction.updated event for a transaction
// apply_wompi_webhook_transaction_update above correctly left untouched
// (it only ever transitions a 'pending' row, never 'paid' -> 'voided').
// Never throws and never affects the webhook's own HTTP response, same
// reasoning as enqueueAndSendPayout.
async function confirmRefundVoidAndNotify(admin: AdminClient, wompiTransactionId: string): Promise<void> {
  try {
    const { data, error } = await admin
      .rpc('confirm_refund_request_void_by_wompi_reference', { p_wompi_transaction_id: wompiTransactionId })
      .single<{
        confirmed: boolean
        refund_request_id: string | null
        requested_by: string | null
        refund_amount_cents: number | null
        bookkeeping_mismatch: boolean
      }>()

    if (error || !data?.confirmed) return

    // The money side (transactions/bookings) is always reconciled by the
    // RPC regardless of this flag — a mismatch means refund_requests was
    // already resolved by a human decision (most likely rejected) while the
    // void was still in flight at Wompi. Log it for manual follow-up rather
    // than auto-emailing a "processed" message that would contradict
    // whatever the admin's own action already told the tourist.
    if (data.bookkeeping_mismatch) {
      console.error(
        'Wompi confirmed a refund void whose refund_requests row was already resolved by an admin action — money state corrected, but the refund_requests record needs manual review',
        { refundRequestId: data.refund_request_id, wompiTransactionId },
      )
      return
    }

    if (!data.requested_by || data.refund_amount_cents == null) return

    const { data: userData } = await admin.auth.admin.getUserById(data.requested_by)
    const email = userData?.user?.email
    if (email) await sendRefundProcessedEmail(email, data.refund_amount_cents, 'void')
  } catch (error) {
    console.error('Unexpected error while confirming a refund void', error)
  }
}

export async function POST(request: Request) {
  const secret = process.env.WOMPI_EVENTS_SECRET
  if (!secret) {
    console.error('WOMPI_EVENTS_SECRET is not configured; rejecting Wompi webhook')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  let event: WompiWebhookEvent
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!isValidChecksum(event, secret)) {
    console.error('Wompi webhook checksum mismatch — rejecting')
    return NextResponse.json({ error: 'invalid checksum' }, { status: 401 })
  }

  if (!isFreshTimestamp(event.timestamp)) {
    console.error('Wompi webhook event timestamp outside the accepted window — rejecting', { timestamp: event.timestamp })
    return NextResponse.json({ error: 'stale event' }, { status: 401 })
  }

  // Only transaction.updated carries the fields this handler understands.
  // Other event types (nequi_token.updated, bancolombia_transfer_token.updated)
  // are acknowledged as no-ops so Wompi doesn't keep retrying them.
  const transaction = (event.data as { transaction?: Record<string, unknown> }).transaction
  if (event.event !== 'transaction.updated' || !transaction) {
    return NextResponse.json({ received: true })
  }

  // `reference` is the booking id we generated in buildWompiCheckoutUrl();
  // `id` is Wompi's own transaction identifier, stored as wompi_reference.
  // `reference` is NOT part of Wompi's checksummed signature.properties (only
  // id/status/amount_in_cents typically are), so it must not be trusted on
  // its own — a malformed value is rejected here, and the RPC independently
  // cross-checks amount_in_cents/currency against what was actually stored
  // for that booking before ever confirming it (see the migration comment).
  const bookingId = transaction.reference as string | undefined
  const wompiTransactionId = transaction.id as string | undefined
  const wompiStatus = transaction.status as string | undefined
  const wompiAmountInCents = transaction.amount_in_cents
  const wompiCurrency = transaction.currency as string | undefined

  if (
    !bookingId ||
    !UUID_RE.test(bookingId) ||
    !wompiTransactionId ||
    !wompiStatus ||
    !APPLICABLE_STATUSES.has(wompiStatus) ||
    typeof wompiAmountInCents !== 'number' ||
    !Number.isInteger(wompiAmountInCents) ||
    wompiAmountInCents <= 0 ||
    !wompiCurrency
  ) {
    console.error('Wompi webhook payload missing or malformed expected fields', {
      bookingId,
      wompiTransactionId,
      wompiStatus,
      wompiAmountInCents,
      wompiCurrency,
    })
    return NextResponse.json({ received: true })
  }

  const admin = createAdminClient()
  const { data: updateResult, error } = await admin
    .rpc('apply_wompi_webhook_transaction_update', {
      p_booking_id: bookingId,
      p_wompi_transaction_id: wompiTransactionId,
      p_wompi_status: wompiStatus,
      p_wompi_amount_in_cents: wompiAmountInCents,
      p_wompi_currency: wompiCurrency,
    })
    .single<{
      applied: boolean
      transaction_id: string | null
      business_id: string | null
      guide_id: string | null
      amount_in_cents: number | null
      commission_amount_cents: number | null
    }>()

  if (error) {
    console.error('Failed to apply Wompi webhook update', error)
    // A genuine DB failure (not a duplicate/no-op) should be retried by
    // Wompi's own retry policy, so this is the one case that must NOT
    // return 200.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }

  // A VOIDED event for a transaction that was already 'paid' (not
  // 'pending') is exactly the case apply_wompi_webhook_transaction_update
  // above correctly left as a no-op (`applied: false`) — it's the async
  // confirmation of a same-day refund void, handled separately here.
  if (wompiStatus === 'VOIDED') {
    await confirmRefundVoidAndNotify(admin, wompiTransactionId)
  }

  // Only a freshly-confirmed APPROVED payment triggers a payout — this
  // never re-fires for a retried/duplicate webhook delivery, since `applied`
  // is only true the one time apply_wompi_webhook_transaction_update
  // actually flips the row out of 'pending'.
  if (
    updateResult?.applied &&
    wompiStatus === 'APPROVED' &&
    updateResult.transaction_id &&
    updateResult.amount_in_cents != null &&
    updateResult.commission_amount_cents != null
  ) {
    await enqueueAndSendPayout(admin, {
      transactionId: updateResult.transaction_id,
      businessId: updateResult.business_id,
      guideId: updateResult.guide_id,
      amountInCents: updateResult.amount_in_cents,
      commissionAmountCents: updateResult.commission_amount_cents,
    })
  }

  return NextResponse.json({ received: true })
}
