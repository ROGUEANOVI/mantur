import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeNetPayoutAmountCents, sendProviderPayout, resolvePayoutAccount, listPayoutBanks } from './payouts'

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

describe('listPayoutBanks', () => {
  it('returns a clear failure (never throws) when WOMPI_PAYOUTS_BASE_URL is not configured', async () => {
    delete process.env.WOMPI_PAYOUTS_BASE_URL
    const result = await listPayoutBanks()
    expect(result).toEqual({ ok: false, error: 'WOMPI_PAYOUTS_BASE_URL is not configured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a clear failure when WOMPI_PAYOUTS_API_KEY is not configured', async () => {
    delete process.env.WOMPI_PAYOUTS_API_KEY
    const result = await listPayoutBanks()
    expect(result).toEqual({ ok: false, error: 'WOMPI_PAYOUTS_API_KEY is not configured' })
  })

  it('calls GET /banks with the auth headers', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))

    await listPayoutBanks()

    expect(fetch).toHaveBeenCalledWith(
      'https://payouts.example.wompi.co/banks',
      expect.objectContaining({
        headers: {
          'x-api-key': 'test-api-key',
          'user-principal-id': 'test-principal-id',
        },
      }),
    )
  })

  it('maps the data array to {id, name} entries, dropping malformed ones', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'bank-1', name: 'Bancolombia' },
            { id: 'bank-2', name: 'Davivienda', code: 'DAVI' },
            { id: 123, name: 'missing valid id' },
            { name: 'missing id entirely' },
          ],
        }),
        { status: 200 },
      ),
    )

    const result = await listPayoutBanks()

    expect(result).toEqual({
      ok: true,
      banks: [
        { id: 'bank-1', name: 'Bancolombia' },
        { id: 'bank-2', name: 'Davivienda' },
      ],
    })
  })

  it('returns ok:false when the response has no data array', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'unexpected shape' }), { status: 200 }))
    const result = await listPayoutBanks()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false (never throws) on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 }))
    const result = await listPayoutBanks()
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('401')
  })

  it('returns ok:false (never throws) when fetch itself rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unreachable'))
    const result = await listPayoutBanks()
    expect(result).toEqual({ ok: false, error: 'network unreachable' })
  })
})

const ACCOUNT_ROW = {
  bank_name: 'Bancolombia',
  wompi_bank_id: 'bank-uuid-1',
  account_type: 'ahorros' as const,
  account_number: '00011122233',
  holder_id_type: 'CC' as const,
  holder_id_number: '123456789',
  holder_name: 'Finca El Paraíso',
  holder_email: 'finca@example.com',
}

function fakeAdminClient(row: typeof ACCOUNT_ROW | null) {
  const fromMock = vi.fn((_table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
      }),
    }),
  }))
  return { from: fromMock } as unknown as Parameters<typeof resolvePayoutAccount>[0]
}

describe('resolvePayoutAccount', () => {
  it('reads business_payout_accounts by business_id and maps it to a PayoutRecipient for a business recipient', async () => {
    const admin = fakeAdminClient(ACCOUNT_ROW)
    const result = await resolvePayoutAccount(admin, 'business', 'biz-1')

    expect(admin.from).toHaveBeenCalledWith('business_payout_accounts')
    expect(result).toEqual({
      legalIdType: 'CC',
      legalId: '123456789',
      wompiBankId: 'bank-uuid-1',
      accountType: 'ahorros',
      accountNumber: '00011122233',
      name: 'Finca El Paraíso',
      email: 'finca@example.com',
    })
  })

  it('reads tourist_guide_payout_accounts by guide_id for a guide recipient', async () => {
    const admin = fakeAdminClient(ACCOUNT_ROW)
    await resolvePayoutAccount(admin, 'guide', 'guide-1')

    expect(admin.from).toHaveBeenCalledWith('tourist_guide_payout_accounts')
  })

  it('returns null when no payout account row exists', async () => {
    const admin = fakeAdminClient(null)
    const result = await resolvePayoutAccount(admin, 'business', 'biz-1')
    expect(result).toBeNull()
  })

  it('defaults wompiBankId to an empty string when the account has none configured yet', async () => {
    const admin = fakeAdminClient({ ...ACCOUNT_ROW, wompi_bank_id: null })
    const result = await resolvePayoutAccount(admin, 'business', 'biz-1')
    expect(result?.wompiBankId).toBe('')
  })
})
