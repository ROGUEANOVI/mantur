import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeNetPayoutAmountCents, sendProviderPayout } from './payouts'

const ORIGINAL_ENV = { ...process.env }

const RECIPIENT = {
  legalIdType: 'CC' as const,
  legalId: '123456789',
  wompiBankId: 'bank-uuid-1',
  accountType: 'ahorros' as const,
  accountNumber: '00011122233',
  name: 'Finca El Paraíso',
  email: 'finca@example.com',
}

function setPayoutEnv() {
  process.env.WOMPI_PAYOUTS_BASE_URL = 'https://payouts.example.wompi.co'
  process.env.WOMPI_PAYOUTS_API_KEY = 'test-api-key'
  process.env.WOMPI_PAYOUTS_USER_PRINCIPAL_ID = 'test-principal-id'
  process.env.WOMPI_PAYOUTS_ACCOUNT_ID = 'test-account-id'
}

beforeEach(() => {
  setPayoutEnv()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe('computeNetPayoutAmountCents', () => {
  it('subtracts commission from the total amount', () => {
    expect(computeNetPayoutAmountCents(1_000_000, 100_000)).toBe(900_000)
  })

  it('returns 0 when commission equals the full amount', () => {
    expect(computeNetPayoutAmountCents(500, 500)).toBe(0)
  })
})

describe('sendProviderPayout', () => {
  it('returns a clear failure (never throws) when WOMPI_PAYOUTS_BASE_URL is not configured', async () => {
    delete process.env.WOMPI_PAYOUTS_BASE_URL
    const result = await sendProviderPayout({ idempotencyKey: 'payout-1', amountCents: 90000, recipient: RECIPIENT })
    expect(result).toEqual({ ok: false, error: 'WOMPI_PAYOUTS_BASE_URL is not configured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a clear failure when WOMPI_PAYOUTS_API_KEY is not configured', async () => {
    delete process.env.WOMPI_PAYOUTS_API_KEY
    const result = await sendProviderPayout({ idempotencyKey: 'payout-1', amountCents: 90000, recipient: RECIPIENT })
    expect(result).toEqual({ ok: false, error: 'WOMPI_PAYOUTS_API_KEY is not configured' })
  })

  it('returns a clear failure when the recipient has no wompi_bank_id, without calling fetch', async () => {
    const result = await sendProviderPayout({
      idempotencyKey: 'payout-1',
      amountCents: 90000,
      recipient: { ...RECIPIENT, wompiBankId: '' },
    })
    expect(result).toEqual({ ok: false, error: 'recipient has no wompi_bank_id configured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the idempotency-key header, auth headers, and correctly-shaped body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 'wompi-payout-1' }), { status: 200 }))

    await sendProviderPayout({ idempotencyKey: 'payout-abc', amountCents: 450000, recipient: RECIPIENT })

    expect(fetch).toHaveBeenCalledWith(
      'https://payouts.example.wompi.co/payouts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          'user-principal-id': 'test-principal-id',
          'idempotency-key': 'payout-abc',
          'Content-Type': 'application/json',
        }),
      }),
    )

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body).toEqual({
      legalIdType: 'CC',
      legalId: '123456789',
      bankId: 'bank-uuid-1',
      accountType: 'AHORROS',
      accountNumber: '00011122233',
      name: 'Finca El Paraíso',
      email: 'finca@example.com',
      amount: 450000,
      reference: 'payout-payout-abc',
      accountId: 'test-account-id',
      paymentType: 'PROVIDERS',
    })
  })

  it('returns ok:true with the Wompi payout id on a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 'wompi-payout-42' }), { status: 200 }))
    const result = await sendProviderPayout({ idempotencyKey: 'payout-1', amountCents: 90000, recipient: RECIPIENT })
    expect(result).toEqual({ ok: true, wompiPayoutId: 'wompi-payout-42' })
  })

  it('resolves a nested data.id shape too', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { id: 'wompi-payout-99' } }), { status: 200 }))
    const result = await sendProviderPayout({ idempotencyKey: 'payout-1', amountCents: 90000, recipient: RECIPIENT })
    expect(result).toEqual({ ok: true, wompiPayoutId: 'wompi-payout-99' })
  })

  it('returns ok:false (never throws) on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'invalid bank id' }), { status: 422 }))
    const result = await sendProviderPayout({ idempotencyKey: 'payout-1', amountCents: 90000, recipient: RECIPIENT })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('422')
  })

  it('returns ok:false when the response has no id at all', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    const result = await sendProviderPayout({ idempotencyKey: 'payout-1', amountCents: 90000, recipient: RECIPIENT })
    expect(result.ok).toBe(false)
  })

  it('returns ok:false (never throws) when fetch itself rejects, e.g. a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unreachable'))
    const result = await sendProviderPayout({ idempotencyKey: 'payout-1', amountCents: 90000, recipient: RECIPIENT })
    expect(result).toEqual({ ok: false, error: 'network unreachable' })
  })
})
