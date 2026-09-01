import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeNetPayoutAmountCents, sendProviderPayout, resolvePayoutAccount } from '@/lib/wompi/payouts'
import { sendRefundProcessedEmail } from '@/lib/email/refundEmails'
import { sendBusinessBookingConfirmedEmail } from '@/lib/email/bookingEmails'
import { findOrCreateContact } from '@/lib/alegra/contacts'
import { createCommissionInvoice } from '@/lib/alegra/invoices'
import { estimateWompiFeeCents } from '@/lib/wompi/fees'

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

    // Atomically claim the row before calling Wompi — a plain status read
    // here (the original implementation) left no DB-level exclusion between
    // this webhook delivery and a concurrent admin retry both reaching
    // sendProviderPayout() for the same row while it sat at 'pending' for
    // the full duration of the outbound call. claim_provider_payout_for_send
    // is shared with the admin retry action (src/app/(app)/admin/pagos-
    // proveedores/actions.ts) for exactly this reason — p_admin_id is
    // omitted here (defaults to NULL) since no admin is involved in the
    // automatic path. 0 rows (no error) means a previous attempt already
    // sent/failed it, or a concurrent claimant won the race — either way,
    // nothing left to do. A genuine RPC error is logged separately so it's
    // distinguishable from that ordinary no-op case.
    const { data: claimed, error: claimError } = await admin
      .rpc('claim_provider_payout_for_send', { p_payout_id: enqueued.id })
      .single<{ transaction_id: string; recipient_type: string; recipient_id: string; amount_cents: number }>()

    if (claimError) {
      console.error('Failed to claim provider payout for automatic send', claimError)
      return
    }
    if (!claimed) return

    const recipient = await resolvePayoutAccount(admin, recipientType, recipientId)

    if (!recipient) {
      await admin.rpc('mark_provider_payout_result', {
        p_payout_id: enqueued.id,
        p_status: 'failed',
        p_error_message: `no payout account configured for ${recipientType} ${recipientId}`,
      })
      return
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

// Wompi puts the payer's identity document in a different place depending
// on payment method: billing_data/customer_data.legal_id for CARD (and for
// any method when checkout.ts's collect-customer-legal-id=true flag is
// honored), but payment_method.user_legal_id for PSE and DAVIPLATA
// specifically (confirmed against Wompi's own docs) — NEQUI and Bancolombia
// Transfer/QR carry no identification anywhere. Checking all three sources
// is the only way to not miss an identification Wompi actually sent.
function extractBillingIdentification(
  transaction: Record<string, unknown>,
): { legalIdType: string; legalId: string } | null {
  const billingData = transaction.billing_data as Record<string, unknown> | undefined
  const customerData = transaction.customer_data as Record<string, unknown> | undefined
  const paymentMethod = transaction.payment_method as Record<string, unknown> | undefined
  const legalIdType = (billingData?.legal_id_type ?? customerData?.legal_id_type ?? paymentMethod?.user_legal_id_type) as
    | string
    | undefined
  const legalId = (billingData?.legal_id ?? customerData?.legal_id ?? paymentMethod?.user_legal_id) as string | undefined
  if (!legalIdType || !legalId) return null
  return { legalIdType, legalId }
}

// DIAN's own sanctioned fallback for a sale where the buyer's identification
// was never captured (Oficio DIAN 900223 de 2022, Resolución 000042 de
// 2020): invoice as "Consumidor final" under NIT 222222222222, rather than
// skipping invoicing outright. A real sandbox booking paid via Nequi
// confirmed this isn't a corner case — Wompi's Nequi flow never collects any
// identification at all, so without this fallback every Nequi/Bancolombia
// Transfer/QR sale would simply never get a ManTur invoice, which is a DIAN
// compliance gap. The name is deliberately the literal "Consumidor final",
// not the tourist's real name, matching the DIAN convention exactly — this
// generic contact is intentionally shared across every unidentified sale.
const CONSUMIDOR_FINAL_IDENTIFICATION = { legalIdType: 'NIT', legalId: '222222222222', name: 'Consumidor final' }

// Syncs the Alegra contact (cached on profile_contact_details after the
// first booking) and creates the commission invoice for a freshly-confirmed
// payment. Deliberately never throws and never affects the webhook's own
// HTTP response — invoicing is a downstream bookkeeping step, not a reason
// to make Wompi retry a webhook whose payment confirmation already
// succeeded. A failure here is recorded as transactions.alegra_invoice_status
// = 'rejected' for admin follow-up, not surfaced as an HTTP error.
async function syncAlegraInvoice(
  admin: AdminClient,
  params: { transactionId: string; bookingId: string; commissionAmountCents: number; transaction: Record<string, unknown> },
): Promise<void> {
  try {
    const realIdentification = extractBillingIdentification(params.transaction)
    if (!realIdentification) {
      // Routine, not an error: this is the expected path for every Nequi/
      // Bancolombia Transfer/QR payment (Wompi never collects an
      // identification for those methods) — console.error here would drown
      // out genuinely actionable failures below (contact/invoice creation).
      console.info('Wompi webhook: no billing identification available, invoicing as Consumidor final', {
        transactionId: params.transactionId,
      })
    }
    const identification = realIdentification ?? CONSUMIDOR_FINAL_IDENTIFICATION

    const { data: booking } = await admin
      .from('bookings')
      .select('tourist_id')
      .eq('id', params.bookingId)
      .single<{ tourist_id: string }>()

    if (!booking) return

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', booking.tourist_id)
      .single<{ full_name: string | null }>()

    const { data: contactDetails } = await admin
      .from('profile_contact_details')
      .select('alegra_contact_id, alegra_contact_identification')
      .eq('profile_id', booking.tourist_id)
      .maybeSingle<{ alegra_contact_id: string | null; alegra_contact_identification: string | null }>()

    // SECURITY REVIEW FINDING: only reuse the cached contact when its
    // identification still matches the CURRENT transaction's. A legitimate
    // identification collision (a typo at checkout, a shared family
    // document number, two real people's cédulas colliding in Alegra's own
    // data) would otherwise silently and PERMANENTLY attach every future
    // invoice for this ManTur account to a different real person's Alegra
    // contact/tax identity — trusting the cache unconditionally has no way
    // to ever self-correct that. A mismatch falls through to re-resolving
    // (and re-caching) the contact for the identification actually on file
    // for this transaction.
    let contactId =
      contactDetails?.alegra_contact_id && contactDetails.alegra_contact_identification === identification.legalId
        ? contactDetails.alegra_contact_id
        : null

    if (!contactId) {
      const customerData = params.transaction.customer_data as Record<string, unknown> | undefined
      const email = (params.transaction.customer_email as string | undefined) ?? null
      // The literal "Consumidor final" name is deliberate when no real
      // identification was captured — see CONSUMIDOR_FINAL_IDENTIFICATION.
      const name = !realIdentification
        ? CONSUMIDOR_FINAL_IDENTIFICATION.name
        : profile?.full_name || (customerData?.full_name as string | undefined) || 'Consumidor final'

      const contactResult = await findOrCreateContact({
        legalIdType: identification.legalIdType,
        legalId: identification.legalId,
        name,
        email,
      })

      if (!contactResult.ok) {
        console.error('Failed to find or create Alegra contact', contactResult.error)
        return
      }

      contactId = contactResult.contactId

      // Upsert rather than insert: a tourist might already have a
      // profile_contact_details row (e.g. from saving a phone number in
      // /mi-perfil) — upsert only ever touches the columns given here, so an
      // existing phone value is never overwritten.
      await admin.from('profile_contact_details').upsert(
        {
          profile_id: booking.tourist_id,
          alegra_contact_id: contactId,
          alegra_contact_identification: identification.legalId,
        },
        { onConflict: 'profile_id' },
      )
    }

    const invoiceResult = await createCommissionInvoice({
      contactId,
      commissionAmountCents: params.commissionAmountCents,
    })

    if (!invoiceResult.ok) {
      console.error('Failed to create Alegra invoice', invoiceResult.error)
      await admin.from('transactions').update({ alegra_invoice_status: 'rejected' }).eq('id', params.transactionId)
      return
    }

    // 'pending' here means "created in Alegra", not "DIAN-confirmed" — no
    // webhook-based DIAN reconciliation is available on this account tier
    // (confirmed live: Alegra's invoices.emissionFinished webhook belongs to
    // a separate "proveedor electrónico" product, not a normal accounting
    // account). Checking final DIAN status is a polling-based follow-up
    // (GET /invoices/{id}?fields=events), not yet built.
    await admin
      .from('transactions')
      .update({ alegra_invoice_id: invoiceResult.invoiceId, alegra_invoice_status: 'pending' })
      .eq('id', params.transactionId)
  } catch (error) {
    console.error('Unexpected error while syncing an Alegra invoice', error)
  }
}

// Notifies the business owner that a booking just got confirmed. Scoped to
// business-service bookings only (bookings.service_id) for now — guide-tour
// bookings (bookings.guide_tour_id) are a natural follow-up, not yet built.
// Before this, a business owner had no email at all for a new booking (only
// a "Reservas activas" count on /mi-negocio) — deliberately never throws and
// never affects the webhook's own HTTP response, same reasoning as
// enqueueAndSendPayout/syncAlegraInvoice.
async function notifyBusinessOfBooking(
  admin: AdminClient,
  params: { bookingId: string; businessId: string },
): Promise<void> {
  try {
    const { data: booking } = await admin
      .from('bookings')
      .select('business_id, service_id, booking_date, quantity, notes, tourist_id, services(name)')
      .eq('id', params.bookingId)
      .single<{
        business_id: string | null
        service_id: string | null
        booking_date: string
        quantity: number
        notes: string | null
        tourist_id: string
        services: { name: string } | null
      }>()

    // Guide-tour bookings have no service_id — out of scope for now.
    // Defense-in-depth: also confirm the booking's own business_id matches
    // the one passed in, even though both currently derive from the same
    // trusted RPC result — this stays correct if a future call site ever
    // sources bookingId/businessId independently.
    if (!booking || !booking.service_id || booking.business_id !== params.businessId) return

    const { data: business } = await admin
      .from('businesses')
      .select('owner_id')
      .eq('id', params.businessId)
      .single<{ owner_id: string }>()

    if (!business) return

    const { data: touristProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', booking.tourist_id)
      .single<{ full_name: string | null }>()

    const { data: ownerUserData } = await admin.auth.admin.getUserById(business.owner_id)
    const ownerEmail = ownerUserData?.user?.email
    if (!ownerEmail) return

    await sendBusinessBookingConfirmedEmail(ownerEmail, {
      serviceName: booking.services?.name ?? 'Servicio',
      touristName: touristProfile?.full_name ?? 'Un turista',
      bookingDate: booking.booking_date,
      quantity: booking.quantity,
      notes: booking.notes,
    })
  } catch (error) {
    console.error('Unexpected error while notifying business of a new booking', error)
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
  // Drives refund eligibility (only CARD supports Wompi's automated
  // same-day void, confirmed against Wompi's own support docs — see
  // 20260901010000_add_refund_payout_destination.sql). Not part of the
  // checksummed signature.properties, same trust posture as `reference`.
  const wompiPaymentMethodType = (transaction.payment_method as Record<string, unknown> | undefined)?.type as
    | string
    | undefined

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
      p_payment_method_type: wompiPaymentMethodType ?? null,
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

    // Plain UPDATE rather than folding into apply_wompi_webhook_transaction_update
    // — see 20260830210000's ambiguous-column postmortem on that RPC's
    // RETURNS TABLE shape. Fire-and-forget like alegra_invoice_id below:
    // this is bookkeeping visibility (admin's net-margin stat), not a
    // reason to make Wompi retry an already-confirmed payment.
    const { error: wompiFeeUpdateError } = await admin
      .from('transactions')
      .update({ wompi_fee_cents: estimateWompiFeeCents(updateResult.amount_in_cents) })
      .eq('id', updateResult.transaction_id)

    if (wompiFeeUpdateError) {
      console.error('Failed to persist estimated Wompi fee', wompiFeeUpdateError)
    }

    await syncAlegraInvoice(admin, {
      transactionId: updateResult.transaction_id,
      bookingId,
      commissionAmountCents: updateResult.commission_amount_cents,
      transaction,
    })

    if (updateResult.business_id) {
      await notifyBusinessOfBooking(admin, { bookingId, businessId: updateResult.business_id })
    }
  }

  return NextResponse.json({ received: true })
}
