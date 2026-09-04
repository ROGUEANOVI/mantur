import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'

const applyUpdateMock = vi.fn()
const confirmVoidMock = vi.fn()
const getUserByIdMock = vi.fn()
const bookingSingleMock = vi.fn()
const bookingDetailsSingleMock = vi.fn()
const profileSingleMock = vi.fn()
const contactDetailsMaybeSingleMock = vi.fn()
const contactDetailsUpsertMock = vi.fn()
const transactionsUpdateEqMock = vi.fn()
const businessOwnerSingleMock = vi.fn()
const sendBusinessBookingConfirmedEmailMock = vi.fn()

function makeRpcResult(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result)
  return Object.assign(promise, { single: () => Promise.resolve(result) })
}

const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'apply_wompi_webhook_transaction_update') return makeRpcResult(applyUpdateMock(args))
  if (fn === 'confirm_refund_request_void_by_wompi_reference') return makeRpcResult(confirmVoidMock(args))
  throw new Error(`unexpected rpc: ${fn}`)
})

const fromMock = vi.fn((table: string) => {
  if (table === 'bookings') {
    // Two different queries hit `bookings` in the same webhook delivery:
    // syncAlegraInvoice's `.select('tourist_id')` and
    // notifyBusinessOfBooking's fuller `.select('service_id, ...')` —
    // routed by columns since both share the same eq().single() shape.
    return {
      select: (columns: string) => ({
        eq: () => ({
          single: () => (columns.includes('service_id') ? bookingDetailsSingleMock() : bookingSingleMock()),
        }),
      }),
    }
  }
  if (table === 'profiles') {
    return { select: () => ({ eq: () => ({ single: profileSingleMock }) }) }
  }
  if (table === 'businesses') {
    return { select: () => ({ eq: () => ({ single: businessOwnerSingleMock }) }) }
  }
  if (table === 'profile_contact_details') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: contactDetailsMaybeSingleMock }) }),
      upsert: (row: unknown, opts: unknown) => contactDetailsUpsertMock(row, opts),
    }
  }
  if (table === 'transactions') {
    return { update: (row: unknown) => ({ eq: (col: string, val: unknown) => transactionsUpdateEqMock(row, col, val) }) }
  }
  throw new Error(`unexpected table: ${table}`)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  })),
}))

// enqueueAndSendProviderPayout's own internals (enqueue/claim/resolve
// account/send/mark) are tested exhaustively in src/lib/wompi/payouts.test.ts
// now that the logic lives there — this file only needs to verify the
// wrapper resolves business_id/guide_id and the net amount correctly
// before delegating, so the shared function is mocked as a black box.
const enqueueAndSendProviderPayoutMock = vi.fn()
vi.mock('@/lib/wompi/payouts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wompi/payouts')>()
  return {
    ...actual,
    enqueueAndSendProviderPayout: (...args: Parameters<typeof actual.enqueueAndSendProviderPayout>) =>
      enqueueAndSendProviderPayoutMock(...args),
  }
})

const sendRefundProcessedEmailMock = vi.fn()
vi.mock('@/lib/email/refundEmails', () => ({
  sendRefundProcessedEmail: (...args: unknown[]) => sendRefundProcessedEmailMock(...args),
}))

vi.mock('@/lib/email/bookingEmails', () => ({
  sendBusinessBookingConfirmedEmail: (...args: unknown[]) => sendBusinessBookingConfirmedEmailMock(...args),
}))

const findOrCreateContactMock = vi.fn()
vi.mock('@/lib/alegra/contacts', () => ({
  findOrCreateContact: (...args: unknown[]) => findOrCreateContactMock(...args),
}))

const createCommissionInvoiceMock = vi.fn()
vi.mock('@/lib/alegra/invoices', () => ({
  createCommissionInvoice: (...args: unknown[]) => createCommissionInvoiceMock(...args),
}))

const { POST } = await import('./route')

const SECRET = 'test-events-secret'
const ORIGINAL_ENV = { ...process.env }
const BOOKING_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.WOMPI_EVENTS_SECRET = SECRET
  // Default: no update applied, so payout code paths don't fire unless a
  // test explicitly opts in via applyUpdateMock.mockReturnValue(...).
  applyUpdateMock.mockReturnValue({ data: { applied: false }, error: null })
  // Default: no matching refund_requests row awaiting void confirmation.
  confirmVoidMock.mockReturnValue({
    data: { confirmed: false, refund_request_id: null, requested_by: null, refund_amount_cents: null, bookkeeping_mismatch: false },
    error: null,
  })
  // Defaults for the Alegra invoice sync path, exercised by any APPROVED
  // event that flips applied:true (most payout tests above included) —
  // these keep those tests passing without asserting on Alegra calls.
  bookingSingleMock.mockResolvedValue({ data: { tourist_id: 'tourist-1' } })
  profileSingleMock.mockResolvedValue({ data: { full_name: 'Prueba Wompi Sandbox' } })
  contactDetailsMaybeSingleMock.mockResolvedValue({ data: null })
  contactDetailsUpsertMock.mockResolvedValue({ data: null, error: null })
  transactionsUpdateEqMock.mockResolvedValue({ data: null, error: null })
  findOrCreateContactMock.mockResolvedValue({ ok: true, contactId: 'alegra-contact-1' })
  createCommissionInvoiceMock.mockResolvedValue({ ok: true, invoiceId: 'alegra-invoice-1' })
  // Defaults for the business booking-confirmation email path — a
  // business-service booking (not a guide-tour one) with a resolvable owner.
  bookingDetailsSingleMock.mockResolvedValue({
    data: {
      business_id: 'biz-1',
      service_id: 'service-1',
      booking_date: '2026-09-05',
      quantity: 2,
      notes: null,
      tourist_id: 'tourist-1',
      services: { name: 'Cabalgata al atardecer' },
    },
  })
  businessOwnerSingleMock.mockResolvedValue({ data: { owner_id: 'owner-1' } })
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'negocio@example.com' } } })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

function resolvePath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, source)
}

function checksumFor(properties: string[], data: Record<string, unknown>, timestamp: number, secret = SECRET) {
  const concatenated = properties.map((p) => String(resolvePath(data, p) ?? '')).join('') + String(timestamp) + secret
  return createHash('sha256').update(concatenated).digest('hex')
}

const NOW_SECONDS = Math.floor(Date.now() / 1000)

function buildEvent(overrides: {
  status?: string
  bookingId?: string
  wompiTransactionId?: string
  amountInCents?: number
  currency?: string | null
  eventType?: string
  timestamp?: number
  badChecksum?: boolean
  billingData?: Record<string, unknown> | null
  customerEmail?: string
  paymentMethod?: Record<string, unknown>
} = {}) {
  const timestamp = overrides.timestamp ?? NOW_SECONDS
  const transaction: Record<string, unknown> = {
    id: overrides.wompiTransactionId ?? 'wompi-tx-1',
    status: overrides.status ?? 'APPROVED',
    reference: overrides.bookingId ?? BOOKING_ID,
    amount_in_cents: overrides.amountInCents ?? 50000,
    customer_email: overrides.customerEmail ?? 'tourist@example.com',
  }
  if (overrides.currency !== null) transaction.currency = overrides.currency ?? 'COP'
  // Wompi's checkout always collects a legal ID for card payments — default
  // to a realistic value so the Alegra sync path is exercised the same way
  // real traffic would; pass billingData: null to test its absence.
  if (overrides.billingData !== null) {
    transaction.billing_data = overrides.billingData ?? { legal_id_type: 'CC', legal_id: '1002003000' }
  }
  if (overrides.paymentMethod) {
    transaction.payment_method = overrides.paymentMethod
  }

  const data = { transaction }
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']
  const checksum = overrides.badChecksum
    ? 'deadbeef'.repeat(8)
    : checksumFor(properties, data, timestamp)

  return {
    event: overrides.eventType ?? 'transaction.updated',
    data,
    timestamp,
    signature: { properties, checksum },
  }
}

function postRequest(body: unknown) {
  return new Request('https://mantur.co/api/webhooks/wompi', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function approvedUpdateResult(overrides: Partial<{
  businessId: string | null
  guideId: string | null
  amountInCents: number
  commissionAmountCents: number
}> = {}) {
  return {
    data: {
      applied: true,
      transaction_id: 'tx-1',
      business_id: 'businessId' in overrides ? overrides.businessId : 'biz-1',
      guide_id: overrides.guideId ?? null,
      amount_in_cents: overrides.amountInCents ?? 50000,
      commission_amount_cents: overrides.commissionAmountCents ?? 5000,
    },
    error: null,
  }
}

describe('POST /api/webhooks/wompi — signature/status handling', () => {
  it('returns 500 and never calls the RPC when WOMPI_EVENTS_SECRET is not configured', async () => {
    delete process.env.WOMPI_EVENTS_SECRET
    const res = await POST(postRequest(buildEvent()))
    expect(res.status).toBe(500)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(new Request('https://mantur.co/api/webhooks/wompi', { method: 'POST', body: '{not json' }))
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 when the checksum does not match, and never calls the RPC', async () => {
    const res = await POST(postRequest(buildEvent({ badChecksum: true })))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a tampered amount even if the attacker recomputes everything else (checksum covers amount_in_cents)', async () => {
    const event = buildEvent()
    event.data.transaction.amount_in_cents = 1
    const res = await POST(postRequest(event))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an event whose timestamp is far outside the accepted freshness window', async () => {
    const res = await POST(postRequest(buildEvent({ timestamp: NOW_SECONDS - 60 * 60 * 24 * 30 })))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an event timestamped too far in the future', async () => {
    const res = await POST(postRequest(buildEvent({ timestamp: NOW_SECONDS + 60 * 60 * 24 })))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("accepts an event within the freshness window, e.g. a legitimate late retry within Wompi's documented 24h policy", async () => {
    const res = await POST(postRequest(buildEvent({ timestamp: NOW_SECONDS - 60 * 60 * 20 })))
    expect(res.status).toBe(200)
    expect(applyUpdateMock).toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing for non-transaction.updated events', async () => {
    const res = await POST(postRequest(buildEvent({ eventType: 'nequi_token.updated' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing for an unrecognized transaction status', async () => {
    const res = await POST(postRequest(buildEvent({ status: 'SOME_NEW_STATUS' })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing when the reference is not a valid UUID', async () => {
    const res = await POST(postRequest(buildEvent({ bookingId: 'not-a-uuid' })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing when currency is missing from the payload', async () => {
    const res = await POST(postRequest(buildEvent({ currency: null })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing when amount_in_cents is zero or negative', async () => {
    const res = await POST(postRequest(buildEvent({ amountInCents: 0 })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls apply_wompi_webhook_transaction_update with the booking id, wompi transaction id, status, amount, and currency', async () => {
    const res = await POST(
      postRequest(buildEvent({ status: 'APPROVED', bookingId: BOOKING_ID, wompiTransactionId: 'wompi-tx-99', amountInCents: 135000 })),
    )

    expect(res.status).toBe(200)
    expect(applyUpdateMock).toHaveBeenCalledWith({
      p_booking_id: BOOKING_ID,
      p_wompi_transaction_id: 'wompi-tx-99',
      p_wompi_status: 'APPROVED',
      p_wompi_amount_in_cents: 135000,
      p_wompi_currency: 'COP',
      p_payment_method_type: null,
    })
  })

  it('extracts payment_method.type from the event and passes it as p_payment_method_type', async () => {
    await POST(postRequest(buildEvent({ status: 'APPROVED', paymentMethod: { type: 'NEQUI' } })))

    expect(applyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ p_payment_method_type: 'NEQUI' }))
  })

  it('passes null (not undefined/crash) when the event carries no payment_method.type at all — e.g. some Nequi/Bancolombia events', async () => {
    await POST(postRequest(buildEvent({ status: 'APPROVED', paymentMethod: {} })))

    expect(applyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ p_payment_method_type: null }))
  })

  it('returns 500 (so Wompi retries) when the RPC itself errors', async () => {
    applyUpdateMock.mockReturnValue({ data: null, error: { message: 'db down' } })
    const res = await POST(postRequest(buildEvent()))
    expect(res.status).toBe(500)
  })

  it.each(['DECLINED', 'ERROR', 'VOIDED', 'PENDING'])('accepts a valid %s status event and never triggers a payout', async (status) => {
    applyUpdateMock.mockReturnValue({ data: { applied: true, transaction_id: 'tx-1', business_id: 'biz-1', guide_id: null, amount_in_cents: 50000, commission_amount_cents: 5000 }, error: null })
    const res = await POST(postRequest(buildEvent({ status })))
    expect(res.status).toBe(200)
    expect(applyUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ p_wompi_status: status }))
    expect(enqueueAndSendProviderPayoutMock).not.toHaveBeenCalled()
  })
})

// enqueueAndSendProviderPayout's own internals are tested exhaustively in
// src/lib/wompi/payouts.test.ts (it's mocked as a black box here) — this
// only covers the wrapper's own job: resolving business_id/guide_id into
// recipientType/recipientId and computing the net payout amount before
// delegating.
describe('POST /api/webhooks/wompi — provider payout on a freshly-confirmed APPROVED payment', () => {
  it('does not call enqueueAndSendProviderPayout when applied is false (duplicate/no-op delivery), even for an APPROVED status', async () => {
    applyUpdateMock.mockReturnValue({ data: { applied: false }, error: null })
    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))
    expect(res.status).toBe(200)
    expect(enqueueAndSendProviderPayoutMock).not.toHaveBeenCalled()
  })

  it('resolves a business recipient with the net amount (amount minus commission) when business_id is set', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1', amountInCents: 100000, commissionAmountCents: 10000 }))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(enqueueAndSendProviderPayoutMock).toHaveBeenCalledWith(expect.anything(), {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-1',
      amountCents: 90000,
    })
  })

  it('resolves a guide recipient when business_id is null and guide_id is set', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: null, guideId: 'guide-1' }))

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(enqueueAndSendProviderPayoutMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientType: 'guide', recipientId: 'guide-1' }),
    )
  })

  it('logs and skips payout processing (still returns 200) when neither business_id nor guide_id is present', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: null, guideId: null }))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(enqueueAndSendProviderPayoutMock).not.toHaveBeenCalled()
  })

  it('still delegates with amountCents 0 for a 100%-commission service type — enqueueAndSendProviderPayout itself decides that is a no-op', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ amountInCents: 50000, commissionAmountCents: 50000 }))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(enqueueAndSendProviderPayoutMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 0 }))
  })
})

describe('POST /api/webhooks/wompi — estimated Wompi fee persisted on a freshly-confirmed APPROVED payment', () => {
  it('stores the estimated fee (2.65% + $700 COP + 19% IVA) computed from the confirmed amount', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ amountInCents: 50000 }))

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(transactionsUpdateEqMock).toHaveBeenCalledWith({ wompi_fee_cents: 84877 }, 'id', 'tx-1')
  })

  it('never persists a fee estimate when applied is false (duplicate/no-op webhook delivery)', async () => {
    applyUpdateMock.mockReturnValue({ data: { applied: false }, error: null })

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(transactionsUpdateEqMock).not.toHaveBeenCalledWith(expect.objectContaining({ wompi_fee_cents: expect.anything() }), 'id', expect.anything())
  })
})

describe('POST /api/webhooks/wompi — async confirmation of a same-day refund void', () => {
  // Wompi's own void-request response doesn't reliably confirm VOIDED
  // synchronously (see the comment on voidWompiTransaction) — this is where
  // that confirmation actually lands: a VOIDED transaction.updated event for
  // a transaction apply_wompi_webhook_transaction_update left untouched
  // (it only transitions a 'pending' row, never 'paid' -> 'voided').

  it('calls confirm_refund_request_void_by_wompi_reference with the wompi transaction id on a VOIDED event', async () => {
    const res = await POST(postRequest(buildEvent({ status: 'VOIDED', wompiTransactionId: 'wompi-tx-77' })))
    expect(res.status).toBe(200)
    expect(confirmVoidMock).toHaveBeenCalledWith({ p_wompi_transaction_id: 'wompi-tx-77' })
  })

  it('never attempts void confirmation for a non-VOIDED status', async () => {
    await POST(postRequest(buildEvent({ status: 'APPROVED' })))
    expect(confirmVoidMock).not.toHaveBeenCalled()
  })

  it('emails the tourist once the RPC confirms the void with no bookkeeping mismatch', async () => {
    confirmVoidMock.mockReturnValue({
      data: { confirmed: true, refund_request_id: 'refund-1', requested_by: 'user-1', refund_amount_cents: 70000, bookkeeping_mismatch: false },
      error: null,
    })
    getUserByIdMock.mockResolvedValue({ data: { user: { email: 'tourist@example.com' } } })

    const res = await POST(postRequest(buildEvent({ status: 'VOIDED' })))

    expect(res.status).toBe(200)
    expect(getUserByIdMock).toHaveBeenCalledWith('user-1')
    expect(sendRefundProcessedEmailMock).toHaveBeenCalledWith('tourist@example.com', 70000, 'void')
  })

  it('does not email when the RPC finds no matching paid transaction to reconcile (confirmed: false)', async () => {
    const res = await POST(postRequest(buildEvent({ status: 'VOIDED' })))
    expect(res.status).toBe(200)
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
  })

  it('skips the email (never contradicts an admin decision) and never looks up the user when confirmed but bookkeeping_mismatch is true — e.g. an admin rejected the row while the void was in flight', async () => {
    confirmVoidMock.mockReturnValue({
      data: { confirmed: true, refund_request_id: 'refund-1', requested_by: 'user-1', refund_amount_cents: 70000, bookkeeping_mismatch: true },
      error: null,
    })

    const res = await POST(postRequest(buildEvent({ status: 'VOIDED' })))

    expect(res.status).toBe(200)
    expect(getUserByIdMock).not.toHaveBeenCalled()
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
  })

  it('still returns 200 and does not throw when the confirm RPC itself errors', async () => {
    confirmVoidMock.mockReturnValue({ data: null, error: { message: 'db down' } })
    const res = await POST(postRequest(buildEvent({ status: 'VOIDED' })))
    expect(res.status).toBe(200)
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
  })

  it('still returns 200 when no user email is found for the requester', async () => {
    confirmVoidMock.mockReturnValue({
      data: { confirmed: true, refund_request_id: 'refund-1', requested_by: 'user-1', refund_amount_cents: 70000, bookkeeping_mismatch: false },
      error: null,
    })
    getUserByIdMock.mockResolvedValue({ data: { user: null } })

    const res = await POST(postRequest(buildEvent({ status: 'VOIDED' })))

    expect(res.status).toBe(200)
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/wompi — Alegra commission-invoice sync on a freshly-confirmed APPROVED payment', () => {
  it('creates the invoice directly with the cached alegra_contact_id when its stored identification still matches, without calling findOrCreateContact', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ amountInCents: 100000, commissionAmountCents: 10000 }))
    contactDetailsMaybeSingleMock.mockResolvedValue({
      data: { alegra_contact_id: 'cached-contact-1', alegra_contact_identification: '1002003000' },
    })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(findOrCreateContactMock).not.toHaveBeenCalled()
    expect(createCommissionInvoiceMock).toHaveBeenCalledWith({ contactId: 'cached-contact-1', commissionAmountCents: 10000 })
  })

  it('re-resolves the contact instead of trusting a stale cache when the cached identification no longer matches the current transaction', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    contactDetailsMaybeSingleMock.mockResolvedValue({
      data: { alegra_contact_id: 'stale-contact', alegra_contact_identification: 'a-different-identification' },
    })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED', billingData: { legal_id_type: 'CC', legal_id: '1002003000' } })))

    expect(res.status).toBe(200)
    expect(findOrCreateContactMock).toHaveBeenCalledWith(expect.objectContaining({ legalId: '1002003000' }))
    expect(createCommissionInvoiceMock).toHaveBeenCalledWith({ contactId: 'alegra-contact-1', commissionAmountCents: 5000 })
  })

  it('finds or creates the contact using billing_data identification and the tourist profile name/email, then caches the id and identification', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())

    const res = await POST(
      postRequest(
        buildEvent({ status: 'APPROVED', customerEmail: 'tourist@example.com', billingData: { legal_id_type: 'CC', legal_id: '1002003000' } }),
      ),
    )

    expect(res.status).toBe(200)
    expect(findOrCreateContactMock).toHaveBeenCalledWith({
      legalIdType: 'CC',
      legalId: '1002003000',
      name: 'Prueba Wompi Sandbox',
      email: 'tourist@example.com',
    })
    expect(contactDetailsUpsertMock).toHaveBeenCalledWith(
      { profile_id: 'tourist-1', alegra_contact_id: 'alegra-contact-1', alegra_contact_identification: '1002003000' },
      { onConflict: 'profile_id' },
    )
    expect(createCommissionInvoiceMock).toHaveBeenCalledWith({ contactId: 'alegra-contact-1', commissionAmountCents: 5000 })
  })

  it('records the invoice id and a pending status on the transaction after a successful creation', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    createCommissionInvoiceMock.mockResolvedValue({ ok: true, invoiceId: 'inv-77' })

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(transactionsUpdateEqMock).toHaveBeenCalledWith(
      { alegra_invoice_id: 'inv-77', alegra_invoice_status: 'pending' },
      'id',
      'tx-1',
    )
  })

  it('records a rejected status (and never a fabricated invoice id) when invoice creation fails', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    createCommissionInvoiceMock.mockResolvedValue({ ok: false, error: 'Alegra API returned 422' })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(transactionsUpdateEqMock).toHaveBeenCalledWith({ alegra_invoice_status: 'rejected' }, 'id', 'tx-1')
  })

  it('invoices as "Consumidor final" (NIT 222222222222), never skipping, when Wompi sent no identification at all (e.g. Nequi)', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED', billingData: null })))

    expect(res.status).toBe(200)
    expect(findOrCreateContactMock).toHaveBeenCalledWith({
      legalIdType: 'NIT',
      legalId: '222222222222',
      name: 'Consumidor final',
      email: 'tourist@example.com',
    })
    expect(createCommissionInvoiceMock).toHaveBeenCalledWith({ contactId: 'alegra-contact-1', commissionAmountCents: 5000 })
  })

  it('reads the identification from payment_method.user_legal_id when billing_data/customer_data have none (PSE/Daviplata)', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())

    const res = await POST(
      postRequest(
        buildEvent({
          status: 'APPROVED',
          billingData: null,
          paymentMethod: { type: 'PSE', user_legal_id_type: 'CC', user_legal_id: '1002003000' },
        }),
      ),
    )

    expect(res.status).toBe(200)
    expect(findOrCreateContactMock).toHaveBeenCalledWith(
      expect.objectContaining({ legalIdType: 'CC', legalId: '1002003000', name: 'Prueba Wompi Sandbox' }),
    )
  })

  it('never attempts invoicing when applied is false (duplicate/no-op webhook delivery)', async () => {
    applyUpdateMock.mockReturnValue({ data: { applied: false }, error: null })

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(findOrCreateContactMock).not.toHaveBeenCalled()
    expect(createCommissionInvoiceMock).not.toHaveBeenCalled()
  })

  it('still returns 200 and does not throw when the contact lookup fails unexpectedly', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    findOrCreateContactMock.mockResolvedValue({ ok: false, error: 'Alegra API returned 500' })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(createCommissionInvoiceMock).not.toHaveBeenCalled()
  })

  it('still returns 200 and does not throw when an unexpected error is thrown mid-sync', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    bookingSingleMock.mockRejectedValue(new Error('db down'))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
  })
})

describe('POST /api/webhooks/wompi — business booking-confirmation email on a freshly-confirmed APPROVED payment', () => {
  it('emails the business owner with the service, tourist name, date, and quantity', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1' }))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(businessOwnerSingleMock).toHaveBeenCalled()
    expect(getUserByIdMock).toHaveBeenCalledWith('owner-1')
    expect(sendBusinessBookingConfirmedEmailMock).toHaveBeenCalledWith('negocio@example.com', {
      serviceName: 'Cabalgata al atardecer',
      touristName: 'Prueba Wompi Sandbox',
      bookingDate: '2026-09-05',
      quantity: 2,
      notes: null,
    })
  })

  it('never emails when the confirmed booking is a guide-tour booking (no service_id)', async () => {
    // business_id is present here (unlike the real guide-tour case) so the
    // call site actually enters notifyBusinessOfBooking — this test targets
    // its internal service_id guard specifically, distinct from the
    // "business_id absent" test below which never calls it at all.
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1' }))
    bookingDetailsSingleMock.mockResolvedValue({
      data: { business_id: 'biz-1', service_id: null, booking_date: '2026-09-05', quantity: 2, notes: null, tourist_id: 'tourist-1', services: null },
    })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(sendBusinessBookingConfirmedEmailMock).not.toHaveBeenCalled()
  })

  it('never emails when the booking row itself belongs to a different business_id (defense-in-depth mismatch guard)', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1' }))
    bookingDetailsSingleMock.mockResolvedValue({
      data: {
        business_id: 'some-other-biz',
        service_id: 'service-1',
        booking_date: '2026-09-05',
        quantity: 2,
        notes: null,
        tourist_id: 'tourist-1',
        services: { name: 'Cabalgata al atardecer' },
      },
    })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(sendBusinessBookingConfirmedEmailMock).not.toHaveBeenCalled()
  })

  it('never attempts to email when business_id is absent from the update result', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: null, guideId: 'guide-1' }))

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(businessOwnerSingleMock).not.toHaveBeenCalled()
    expect(sendBusinessBookingConfirmedEmailMock).not.toHaveBeenCalled()
  })

  it('never attempts to email when applied is false (duplicate/no-op webhook delivery)', async () => {
    applyUpdateMock.mockReturnValue({ data: { applied: false }, error: null })

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(sendBusinessBookingConfirmedEmailMock).not.toHaveBeenCalled()
  })

  it('still returns 200 without emailing when the business has no resolvable owner', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1' }))
    businessOwnerSingleMock.mockResolvedValue({ data: null })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(sendBusinessBookingConfirmedEmailMock).not.toHaveBeenCalled()
  })

  it('still returns 200 without emailing when the owner has no resolvable email', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1' }))
    getUserByIdMock.mockResolvedValue({ data: { user: null } })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(sendBusinessBookingConfirmedEmailMock).not.toHaveBeenCalled()
  })

  it('still returns 200 and does not throw when an unexpected error is thrown mid-notify', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1' }))
    bookingDetailsSingleMock.mockRejectedValue(new Error('db down'))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
  })
})
