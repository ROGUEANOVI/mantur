import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'

const applyUpdateMock = vi.fn()
const enqueuePayoutMock = vi.fn()
const markPayoutResultMock = vi.fn()
const payoutAccountMaybeSingle = vi.fn()

function makeRpcResult(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result)
  return Object.assign(promise, { single: () => Promise.resolve(result) })
}

const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'apply_wompi_webhook_transaction_update') return makeRpcResult(applyUpdateMock(args))
  if (fn === 'enqueue_provider_payout') return makeRpcResult(enqueuePayoutMock(args))
  if (fn === 'mark_provider_payout_result') return makeRpcResult(markPayoutResultMock(args))
  throw new Error(`unexpected rpc: ${fn}`)
})

const fromMock = vi.fn((table: string) => {
  if (table === 'business_payout_accounts' || table === 'tourist_guide_payout_accounts') {
    return { select: () => ({ eq: () => ({ maybeSingle: payoutAccountMaybeSingle }) }) }
  }
  throw new Error(`unexpected table: ${table}`)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: rpcMock, from: fromMock })),
}))

const sendProviderPayoutMock = vi.fn()
vi.mock('@/lib/wompi/payouts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wompi/payouts')>()
  return {
    ...actual,
    sendProviderPayout: (...args: Parameters<typeof actual.sendProviderPayout>) => sendProviderPayoutMock(...args),
  }
})

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
} = {}) {
  const timestamp = overrides.timestamp ?? NOW_SECONDS
  const transaction: Record<string, unknown> = {
    id: overrides.wompiTransactionId ?? 'wompi-tx-1',
    status: overrides.status ?? 'APPROVED',
    reference: overrides.bookingId ?? BOOKING_ID,
    amount_in_cents: overrides.amountInCents ?? 50000,
  }
  if (overrides.currency !== null) transaction.currency = overrides.currency ?? 'COP'

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

const PAYOUT_ACCOUNT_ROW = {
  bank_name: 'Bancolombia',
  wompi_bank_id: 'bank-uuid-1',
  account_type: 'ahorros',
  account_number: '00011122233',
  holder_id_type: 'NIT',
  holder_id_number: '900123456',
  holder_name: 'Finca El Paraíso',
  holder_email: 'finca@example.com',
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
    })
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
    expect(enqueuePayoutMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/wompi — provider payout on a freshly-confirmed APPROVED payment', () => {
  it('does not enqueue a payout when applied is false (duplicate/no-op delivery), even for an APPROVED status', async () => {
    applyUpdateMock.mockReturnValue({ data: { applied: false }, error: null })
    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))
    expect(res.status).toBe(200)
    expect(enqueuePayoutMock).not.toHaveBeenCalled()
  })

  it('enqueues a business payout with the net amount (amount minus commission) when business_id is set', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-1', amountInCents: 100000, commissionAmountCents: 10000 }))
    enqueuePayoutMock.mockReturnValue({ data: { id: 'payout-1', status: 'pending', is_new: true }, error: null })
    payoutAccountMaybeSingle.mockResolvedValue({ data: PAYOUT_ACCOUNT_ROW, error: null })
    sendProviderPayoutMock.mockResolvedValue({ ok: true, wompiPayoutId: 'wompi-payout-1' })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(enqueuePayoutMock).toHaveBeenCalledWith({
      p_transaction_id: 'tx-1',
      p_recipient_type: 'business',
      p_recipient_id: 'biz-1',
      p_amount_cents: 90000,
    })
    expect(fromMock).toHaveBeenCalledWith('business_payout_accounts')
  })

  it('enqueues a guide payout when business_id is null and guide_id is set', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: null, guideId: 'guide-1' }))
    enqueuePayoutMock.mockReturnValue({ data: { id: 'payout-2', status: 'pending', is_new: true }, error: null })
    payoutAccountMaybeSingle.mockResolvedValue({ data: PAYOUT_ACCOUNT_ROW, error: null })
    sendProviderPayoutMock.mockResolvedValue({ ok: true, wompiPayoutId: 'wompi-payout-2' })

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(enqueuePayoutMock).toHaveBeenCalledWith(expect.objectContaining({ p_recipient_type: 'guide', p_recipient_id: 'guide-1' }))
    expect(fromMock).toHaveBeenCalledWith('tourist_guide_payout_accounts')
  })

  it('sends the payout via sendProviderPayout using the enqueued payout id as the idempotency key, then marks it sent', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    enqueuePayoutMock.mockReturnValue({ data: { id: 'payout-3', status: 'pending', is_new: true }, error: null })
    payoutAccountMaybeSingle.mockResolvedValue({ data: PAYOUT_ACCOUNT_ROW, error: null })
    sendProviderPayoutMock.mockResolvedValue({ ok: true, wompiPayoutId: 'wompi-payout-3' })

    await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(sendProviderPayoutMock).toHaveBeenCalledWith({
      idempotencyKey: 'payout-3',
      amountCents: 45000,
      recipient: {
        legalIdType: 'NIT',
        legalId: '900123456',
        wompiBankId: 'bank-uuid-1',
        accountType: 'ahorros',
        accountNumber: '00011122233',
        name: 'Finca El Paraíso',
        email: 'finca@example.com',
      },
    })
    expect(markPayoutResultMock).toHaveBeenCalledWith({
      p_payout_id: 'payout-3',
      p_status: 'sent',
      p_wompi_payout_id: 'wompi-payout-3',
    })
  })

  it('marks the payout failed (without affecting the webhook response) when sendProviderPayout fails', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    enqueuePayoutMock.mockReturnValue({ data: { id: 'payout-4', status: 'pending', is_new: true }, error: null })
    payoutAccountMaybeSingle.mockResolvedValue({ data: PAYOUT_ACCOUNT_ROW, error: null })
    sendProviderPayoutMock.mockResolvedValue({ ok: false, error: 'Wompi Payouts API returned 422' })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(markPayoutResultMock).toHaveBeenCalledWith({
      p_payout_id: 'payout-4',
      p_status: 'failed',
      p_error_message: 'Wompi Payouts API returned 422',
    })
  })

  it('marks the payout failed and never calls sendProviderPayout when no payout account is configured for the recipient', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: 'biz-2' }))
    enqueuePayoutMock.mockReturnValue({ data: { id: 'payout-5', status: 'pending', is_new: true }, error: null })
    payoutAccountMaybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
    expect(markPayoutResultMock).toHaveBeenCalledWith({
      p_payout_id: 'payout-5',
      p_status: 'failed',
      p_error_message: 'no payout account configured for business biz-2',
    })
  })

  it('does not attempt to send again when the payout row already exists with a non-pending status (a retried webhook for an already-processed payment)', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    enqueuePayoutMock.mockReturnValue({ data: { id: 'payout-6', status: 'sent', is_new: false }, error: null })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(fromMock).not.toHaveBeenCalled()
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
  })

  it('logs and skips payout processing (still returns 200) when neither business_id nor guide_id is present', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ businessId: null, guideId: null }))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(enqueuePayoutMock).not.toHaveBeenCalled()
  })

  it('skips enqueueing entirely (not an error) when the net payout amount is zero, e.g. a 100%-commission service type', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult({ amountInCents: 50000, commissionAmountCents: 50000 }))

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(enqueuePayoutMock).not.toHaveBeenCalled()
  })

  it('still returns 200 when enqueue_provider_payout itself errors', async () => {
    applyUpdateMock.mockReturnValue(approvedUpdateResult())
    enqueuePayoutMock.mockReturnValue({ data: null, error: { message: 'db error' } })

    const res = await POST(postRequest(buildEvent({ status: 'APPROVED' })))

    expect(res.status).toBe(200)
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
  })
})
