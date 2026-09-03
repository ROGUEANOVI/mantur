import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computeNetPayoutAmountCents,
  sendProviderPayout,
  resolvePayoutAccount,
  listPayoutBanks,
  enqueueAndSendProviderPayout,
} from './payouts'

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

// enqueueAndSendProviderPayout calls resolvePayoutAccount/sendProviderPayout
// internally — both defined in this same module, so a real `admin` (fake,
// injected as a parameter) plus a mocked global `fetch` is what actually
// exercises those internal calls, rather than vi.mock'ing this module from
// the outside (an ESM self-call from enqueueAndSendProviderPayout to
// sendProviderPayout can't be intercepted that way — the shared webhook
// route test learned this the hard way when this function was extracted
// from route.ts; its own test now only checks that this function gets
// called with the right arguments, not the internals re-tested here).
function fakePayoutAdmin(overrides: {
  enqueueResult?: { data: { id: string; status: string; is_new: boolean } | null; error: unknown }
  claimResult?: { data: unknown; error: unknown }
  markResultCalls?: { p_payout_id: string; p_status: string; p_wompi_payout_id?: string; p_error_message?: string }[]
  accountRow?: typeof ACCOUNT_ROW | null
} = {}) {
  const enqueueMock = vi.fn().mockResolvedValue(
    overrides.enqueueResult ?? { data: { id: 'payout-1', status: 'pending', is_new: true }, error: null },
  )
  const claimMock = vi.fn().mockResolvedValue(
    overrides.claimResult ?? {
      data: { transaction_id: 'tx-1', recipient_type: 'business', recipient_id: 'biz-1', amount_cents: 1 },
      error: null,
    },
  )
  const markMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const accountRow = 'accountRow' in overrides ? overrides.accountRow : ACCOUNT_ROW

  const rpc = vi.fn((fn: string, args: Record<string, unknown>) => {
    if (fn === 'enqueue_provider_payout') return { single: () => enqueueMock(args) }
    if (fn === 'claim_provider_payout_for_send') return { single: () => claimMock(args) }
    if (fn === 'mark_provider_payout_result') return markMock(args)
    throw new Error(`unexpected rpc: ${fn}`)
  })

  const from = vi.fn((_table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: accountRow, error: null }) }) }),
  }))

  return { admin: { rpc, from } as unknown as Parameters<typeof enqueueAndSendProviderPayout>[0], enqueueMock, claimMock, markMock, from }
}

describe('enqueueAndSendProviderPayout', () => {
  it('skips enqueueing entirely (not an error) when amountCents is zero or negative', async () => {
    const { admin, enqueueMock } = fakePayoutAdmin()
    await enqueueAndSendProviderPayout(admin, {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-1',
      amountCents: 0,
    })
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('logs and stops when enqueue_provider_payout itself errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin, claimMock } = fakePayoutAdmin({ enqueueResult: { data: null, error: { message: 'db error' } } })

    await enqueueAndSendProviderPayout(admin, {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-1',
      amountCents: 90000,
    })

    expect(claimMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to enqueue provider payout', { message: 'db error' })
    consoleErrorSpy.mockRestore()
  })

  it('does nothing further when the claim finds no matching row (already sent, or lost a concurrent race)', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { admin, from } = fakePayoutAdmin({ claimResult: { data: null, error: null } })

    await enqueueAndSendProviderPayout(admin, {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-1',
      amountCents: 90000,
    })

    expect(from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('logs and stops when the claim RPC itself errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin, from } = fakePayoutAdmin({ claimResult: { data: null, error: { message: 'connection reset' } } })

    await enqueueAndSendProviderPayout(admin, {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-1',
      amountCents: 90000,
    })

    expect(from).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to claim provider payout for automatic send', {
      message: 'connection reset',
    })
    consoleErrorSpy.mockRestore()
  })

  it('marks the payout failed and never calls fetch when no payout account is configured', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { admin, markMock } = fakePayoutAdmin({ accountRow: null })

    await enqueueAndSendProviderPayout(admin, {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-2',
      amountCents: 90000,
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(markMock).toHaveBeenCalledWith({
      p_payout_id: 'payout-1',
      p_status: 'failed',
      p_error_message: 'no payout account configured for business biz-2',
    })
  })

  it('sends via sendProviderPayout using the enqueued payout id as the idempotency key, then marks it sent', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 'wompi-payout-1' }), { status: 200 }))
    const { admin, markMock } = fakePayoutAdmin()

    await enqueueAndSendProviderPayout(admin, {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-1',
      amountCents: 90000,
    })

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.amount).toBe(90000)
    expect(body.reference).toBe('payout-payout-1')
    expect(markMock).toHaveBeenCalledWith({
      p_payout_id: 'payout-1',
      p_status: 'sent',
      p_wompi_payout_id: 'wompi-payout-1',
    })
  })

  it('marks the payout failed when the Wompi Payouts API call fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'invalid bank id' }), { status: 422 }))
    const { admin, markMock } = fakePayoutAdmin()

    await enqueueAndSendProviderPayout(admin, {
      transactionId: 'tx-1',
      recipientType: 'business',
      recipientId: 'biz-1',
      amountCents: 90000,
    })

    expect(markMock).toHaveBeenCalledWith(
      expect.objectContaining({ p_payout_id: 'payout-1', p_status: 'failed' }),
    )
  })

  it('never throws — an unexpected error is caught and logged', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const admin = {
      rpc: () => {
        throw new Error('unexpected')
      },
    } as unknown as Parameters<typeof enqueueAndSendProviderPayout>[0]

    await expect(
      enqueueAndSendProviderPayout(admin, {
        transactionId: 'tx-1',
        recipientType: 'business',
        recipientId: 'biz-1',
        amountCents: 90000,
      }),
    ).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledWith('Unexpected error while processing a provider payout', expect.any(Error))
    consoleErrorSpy.mockRestore()
  })
})
