import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const candidatesQueryMock = vi.fn()
const resetOrphansMock = vi.fn()
const claimRpcMock = vi.fn()
const markRpcMock = vi.fn()

// Dispatches by RPC name to a dedicated mock per function, rather than one
// shared FIFO queue — the route now calls reset_stale_sending_provider_payouts
// once up front, before the per-candidate claim/mark calls, so a single
// ordered queue across all three would silently misassign results.
const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'reset_stale_sending_provider_payouts') return resetOrphansMock(args)
  if (fn === 'claim_provider_payout_for_send') return { single: () => claimRpcMock(args) }
  if (fn === 'mark_provider_payout_result') return markRpcMock(args)
  throw new Error(`unexpected rpc: ${fn}`)
})

function makeFromChain() {
  return {
    select: vi.fn(() => ({
      or: vi.fn(() => ({
        limit: vi.fn(() => candidatesQueryMock()),
      })),
    })),
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => makeFromChain()),
    rpc: rpcMock,
  })),
}))

const resolvePayoutAccountMock = vi.fn()
const sendProviderPayoutMock = vi.fn()

vi.mock('@/lib/wompi/payouts', () => ({
  resolvePayoutAccount: resolvePayoutAccountMock,
  sendProviderPayout: sendProviderPayoutMock,
}))

const { GET } = await import('./route')

const SECRET = 'test-cron-secret'
const ORIGINAL_ENV = { ...process.env }

function makeRpc(result: { data: unknown; error: unknown }) {
  return Promise.resolve(result)
}

function cronRequest(bearer: string | null = SECRET) {
  return new Request('https://mantur.co/api/cron/reconcile-payouts', {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })
}

const RECIPIENT = {
  legalIdType: 'CC' as const,
  legalId: '123',
  wompiBankId: 'bank-1',
  accountType: 'ahorros' as const,
  accountNumber: '456',
  name: 'Finca El Paraíso',
  email: 'finca@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  candidatesQueryMock.mockReturnValue(Promise.resolve({ data: [], error: null }))
  resetOrphansMock.mockReturnValue(makeRpc({ data: [], error: null }))
  resolvePayoutAccountMock.mockResolvedValue(RECIPIENT)
  sendProviderPayoutMock.mockResolvedValue({ ok: true, wompiPayoutId: 'wompi-payout-1' })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('GET /api/cron/reconcile-payouts', () => {
  it('returns 500 and never queries when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(cronRequest())
    expect(response.status).toBe(500)
    expect(candidatesQueryMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 on a missing or wrong bearer token', async () => {
    const missing = await GET(cronRequest(null))
    expect(missing.status).toBe(401)

    const wrong = await GET(cronRequest('wrong-secret'))
    expect(wrong.status).toBe(401)

    expect(candidatesQueryMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the candidates query itself errors', async () => {
    candidatesQueryMock.mockReturnValue(Promise.resolve({ data: null, error: { message: 'db error' } }))
    const response = await GET(cronRequest())
    expect(response.status).toBe(500)
  })

  it('is a no-op when there are no stale candidates and no orphaned sending rows', async () => {
    const response = await GET(cronRequest())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 0, retried: 0, failed: 0 })
    expect(resetOrphansMock).toHaveBeenCalledWith({ p_orphan_minutes: 10 })
    expect(claimRpcMock).not.toHaveBeenCalled()
  })

  it('resets orphaned sending rows before querying candidates, and reports the count', async () => {
    resetOrphansMock.mockReturnValue(makeRpc({ data: [{ id: 'payout-9' }, { id: 'payout-10' }], error: null }))

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(body).toEqual({ ok: true, resetOrphans: 2, candidates: 0, retried: 0, failed: 0 })
  })

  it('logs but still proceeds to the candidates query when the orphan reset RPC itself errors', async () => {
    resetOrphansMock.mockReturnValue(makeRpc({ data: null, error: { message: 'db down' } }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 0, retried: 0, failed: 0 })
    expect(candidatesQueryMock).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('skips a candidate that a concurrent process already claimed (no row, no error)', async () => {
    candidatesQueryMock.mockReturnValue(Promise.resolve({ data: [{ id: 'payout-1' }], error: null }))
    claimRpcMock.mockReturnValueOnce(makeRpc({ data: null, error: null }))

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 1, retried: 0, failed: 0 })
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
  })

  it('logs and continues past a claim RPC error without marking anything', async () => {
    candidatesQueryMock.mockReturnValue(Promise.resolve({ data: [{ id: 'payout-1' }], error: null }))
    claimRpcMock.mockReturnValueOnce(makeRpc({ data: null, error: { message: 'claim failed' } }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 1, retried: 0, failed: 0 })
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('marks a claimed payout failed when the recipient has no payout account configured', async () => {
    candidatesQueryMock.mockReturnValue(Promise.resolve({ data: [{ id: 'payout-1' }], error: null }))
    claimRpcMock.mockReturnValueOnce(
      makeRpc({ data: { transaction_id: 'tx-1', recipient_type: 'business', recipient_id: 'biz-1', amount_cents: 5000 }, error: null }),
    )
    resolvePayoutAccountMock.mockResolvedValueOnce(null)

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 1, retried: 0, failed: 1 })
    expect(rpcMock).toHaveBeenCalledWith('mark_provider_payout_result', {
      p_payout_id: 'payout-1',
      p_status: 'failed',
      p_error_message: 'no payout account configured for business biz-1',
    })
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
  })

  it('retries and marks a payout sent on a successful Wompi call', async () => {
    candidatesQueryMock.mockReturnValue(Promise.resolve({ data: [{ id: 'payout-1' }], error: null }))
    claimRpcMock.mockReturnValueOnce(
      makeRpc({ data: { transaction_id: 'tx-1', recipient_type: 'business', recipient_id: 'biz-1', amount_cents: 5000 }, error: null }),
    )

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(sendProviderPayoutMock).toHaveBeenCalledWith({
      idempotencyKey: 'payout-1',
      amountCents: 5000,
      recipient: RECIPIENT,
    })
    expect(rpcMock).toHaveBeenCalledWith('mark_provider_payout_result', {
      p_payout_id: 'payout-1',
      p_status: 'sent',
      p_wompi_payout_id: 'wompi-payout-1',
    })
    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 1, retried: 1, failed: 0 })
  })

  it('marks a payout failed when the Wompi API call itself fails', async () => {
    candidatesQueryMock.mockReturnValue(Promise.resolve({ data: [{ id: 'payout-1' }], error: null }))
    claimRpcMock.mockReturnValueOnce(
      makeRpc({ data: { transaction_id: 'tx-1', recipient_type: 'guide', recipient_id: 'guide-1', amount_cents: 3000 }, error: null }),
    )
    sendProviderPayoutMock.mockResolvedValueOnce({ ok: false, error: 'declined' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(cronRequest())
    const body = await response.json()

    expect(rpcMock).toHaveBeenCalledWith('mark_provider_payout_result', {
      p_payout_id: 'payout-1',
      p_status: 'failed',
      p_error_message: 'declined',
    })
    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 1, retried: 0, failed: 1 })
    errorSpy.mockRestore()
  })

  it('marks the row failed and continues the loop when an unexpected error is thrown mid-reconciliation', async () => {
    candidatesQueryMock.mockReturnValue(
      Promise.resolve({ data: [{ id: 'payout-1' }, { id: 'payout-2' }], error: null }),
    )
    claimRpcMock
      .mockReturnValueOnce(
        makeRpc({ data: { transaction_id: 'tx-1', recipient_type: 'business', recipient_id: 'biz-1', amount_cents: 1000 }, error: null }),
      )
      .mockReturnValueOnce(
        makeRpc({ data: { transaction_id: 'tx-2', recipient_type: 'guide', recipient_id: 'guide-1', amount_cents: 2000 }, error: null }),
      )

    resolvePayoutAccountMock
      .mockRejectedValueOnce(new Error('unexpected supabase error'))
      .mockResolvedValueOnce(RECIPIENT)

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET(cronRequest())
    const body = await response.json()

    expect(body).toEqual({ ok: true, resetOrphans: 0, candidates: 2, retried: 1, failed: 1 })
    expect(rpcMock).toHaveBeenCalledWith('mark_provider_payout_result', {
      p_payout_id: 'payout-1',
      p_status: 'failed',
      p_error_message: 'unexpected error during reconciliation: unexpected supabase error',
    })
    expect(rpcMock).toHaveBeenCalledWith('mark_provider_payout_result', {
      p_payout_id: 'payout-2',
      p_status: 'sent',
      p_wompi_payout_id: 'wompi-payout-1',
    })
    errorSpy.mockRestore()
  })
})
