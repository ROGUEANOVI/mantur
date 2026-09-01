import { describe, it, expect, vi, beforeEach } from 'vitest'

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`)
  }
}

const redirectMock = vi.fn((url: string) => {
  throw new RedirectSignal(url)
})
const revalidatePathMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

const authGetUser = vi.fn()
const profileSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const claimRpcMock = vi.fn()
const markResultRpcMock = vi.fn()
const resolveManuallyRpcMock = vi.fn()

const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'claim_provider_payout_for_send') return claimRpcMock(args)
  if (fn === 'mark_provider_payout_result') return markResultRpcMock(args)
  if (fn === 'mark_provider_payout_resolved_manually') return resolveManuallyRpcMock(args)
  throw new Error(`unexpected rpc: ${fn}`)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}))

const resolvePayoutAccountMock = vi.fn()
const sendProviderPayoutMock = vi.fn()
vi.mock('@/lib/wompi/payouts', () => ({
  resolvePayoutAccount: (...args: unknown[]) => resolvePayoutAccountMock(...args),
  sendProviderPayout: (...args: unknown[]) => sendProviderPayoutMock(...args),
}))

const { retryProviderPayout, resolveProviderPayoutManually } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const PAYOUT_ID = '11111111-1111-1111-1111-111111111111'
const ADMIN_ID = 'admin-1'

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

const RECIPIENT = {
  legalIdType: 'CC' as const,
  legalId: '123456789',
  wompiBankId: 'bank-uuid-1',
  accountType: 'ahorros' as const,
  accountNumber: '00011122233',
  name: 'Finca El Paraíso',
  email: 'finca@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  // .single() is chained on the rpc() return value in the real client — the
  // mock's rpc() calls already return the resolved payload directly, so wrap
  // it in an object exposing .single() the same way the Supabase client does.
  claimRpcMock.mockImplementation(() => ({ single: () => Promise.resolve({ data: null, error: null }) }))
})

describe('auth guard (shared by both actions)', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(retryProviderPayout(formData({ payoutId: PAYOUT_ID }))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    await expect(resolveProviderPayoutManually(formData({ payoutId: PAYOUT_ID, notes: 'paid by hand' }))).rejects.toThrow(
      'redirect:/',
    )
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('retryProviderPayout', () => {
  it('redirects without calling any RPC when payoutId is not a valid UUID', async () => {
    await expect(retryProviderPayout(formData({ payoutId: 'not-a-uuid' }))).rejects.toThrow(
      'redirect:/admin/pagos-proveedores',
    )
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('does nothing beyond revalidating when the claim RPC returns no row (already resolved by another action)', async () => {
    claimRpcMock.mockImplementation(() => ({ single: () => Promise.resolve({ data: null, error: null }) }))

    await retryProviderPayout(formData({ payoutId: PAYOUT_ID }))

    expect(rpcMock).toHaveBeenCalledWith('claim_provider_payout_for_send', {
      p_payout_id: PAYOUT_ID,
      p_admin_id: ADMIN_ID,
    })
    expect(resolvePayoutAccountMock).not.toHaveBeenCalled()
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/pagos-proveedores')
  })

  it('logs and does not crash when the claim RPC itself errors', async () => {
    claimRpcMock.mockImplementation(() => ({
      single: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }),
    }))

    await retryProviderPayout(formData({ payoutId: PAYOUT_ID }))

    expect(resolvePayoutAccountMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/pagos-proveedores')
  })

  it('marks the payout failed when an unexpected exception is thrown after the claim (e.g. resolvePayoutAccount throws)', async () => {
    claimRpcMock.mockImplementation(() => ({
      single: () =>
        Promise.resolve({
          data: { transaction_id: 'tx-1', recipient_type: 'business', recipient_id: 'biz-1', amount_cents: 90000 },
          error: null,
        }),
    }))
    resolvePayoutAccountMock.mockRejectedValue(new Error('network unreachable'))

    await retryProviderPayout(formData({ payoutId: PAYOUT_ID }))

    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
    expect(markResultRpcMock).toHaveBeenCalledWith({
      p_payout_id: PAYOUT_ID,
      p_status: 'failed',
      p_error_message: 'unexpected error during retry: network unreachable',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/pagos-proveedores')
  })

  it('marks the payout failed (without calling Wompi) when the claimed row has no payout account configured', async () => {
    claimRpcMock.mockImplementation(() => ({
      single: () =>
        Promise.resolve({
          data: { transaction_id: 'tx-1', recipient_type: 'business', recipient_id: 'biz-1', amount_cents: 90000 },
          error: null,
        }),
    }))
    resolvePayoutAccountMock.mockResolvedValue(null)

    await retryProviderPayout(formData({ payoutId: PAYOUT_ID }))

    expect(resolvePayoutAccountMock).toHaveBeenCalledWith(expect.anything(), 'business', 'biz-1')
    expect(sendProviderPayoutMock).not.toHaveBeenCalled()
    expect(markResultRpcMock).toHaveBeenCalledWith({
      p_payout_id: PAYOUT_ID,
      p_status: 'failed',
      p_error_message: 'no payout account configured for business biz-1',
    })
  })

  it('sends the payout and marks it sent on success', async () => {
    claimRpcMock.mockImplementation(() => ({
      single: () =>
        Promise.resolve({
          data: { transaction_id: 'tx-1', recipient_type: 'guide', recipient_id: 'guide-1', amount_cents: 45000 },
          error: null,
        }),
    }))
    resolvePayoutAccountMock.mockResolvedValue(RECIPIENT)
    sendProviderPayoutMock.mockResolvedValue({ ok: true, wompiPayoutId: 'wompi-payout-1' })

    await retryProviderPayout(formData({ payoutId: PAYOUT_ID }))

    expect(sendProviderPayoutMock).toHaveBeenCalledWith({
      idempotencyKey: PAYOUT_ID,
      amountCents: 45000,
      recipient: RECIPIENT,
    })
    expect(markResultRpcMock).toHaveBeenCalledWith({
      p_payout_id: PAYOUT_ID,
      p_status: 'sent',
      p_wompi_payout_id: 'wompi-payout-1',
    })
  })

  it('marks the payout failed with the Wompi error when sendProviderPayout fails', async () => {
    claimRpcMock.mockImplementation(() => ({
      single: () =>
        Promise.resolve({
          data: { transaction_id: 'tx-1', recipient_type: 'business', recipient_id: 'biz-1', amount_cents: 90000 },
          error: null,
        }),
    }))
    resolvePayoutAccountMock.mockResolvedValue(RECIPIENT)
    sendProviderPayoutMock.mockResolvedValue({ ok: false, error: 'Wompi Payouts API returned 500' })

    await retryProviderPayout(formData({ payoutId: PAYOUT_ID }))

    expect(markResultRpcMock).toHaveBeenCalledWith({
      p_payout_id: PAYOUT_ID,
      p_status: 'failed',
      p_error_message: 'Wompi Payouts API returned 500',
    })
  })
})

describe('resolveProviderPayoutManually', () => {
  it('redirects without calling the RPC when payoutId is not a valid UUID', async () => {
    await expect(
      resolveProviderPayoutManually(formData({ payoutId: 'bad', notes: 'paid by hand' })),
    ).rejects.toThrow('redirect:/admin/pagos-proveedores')
    expect(resolveManuallyRpcMock).not.toHaveBeenCalled()
  })

  it('redirects without calling the RPC when notes is empty or missing', async () => {
    await expect(resolveProviderPayoutManually(formData({ payoutId: PAYOUT_ID }))).rejects.toThrow(
      'redirect:/admin/pagos-proveedores',
    )
    await expect(resolveProviderPayoutManually(formData({ payoutId: PAYOUT_ID, notes: '   ' }))).rejects.toThrow(
      'redirect:/admin/pagos-proveedores',
    )
    expect(resolveManuallyRpcMock).not.toHaveBeenCalled()
  })

  it('calls mark_provider_payout_resolved_manually with the trimmed notes and the admin id', async () => {
    resolveManuallyRpcMock.mockResolvedValue({ data: true, error: null })

    await resolveProviderPayoutManually(formData({ payoutId: PAYOUT_ID, notes: '  paid via bank transfer  ' }))

    expect(resolveManuallyRpcMock).toHaveBeenCalledWith({
      p_payout_id: PAYOUT_ID,
      p_admin_id: ADMIN_ID,
      p_notes: 'paid via bank transfer',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/pagos-proveedores')
  })

  it('logs (without crashing) when the RPC reports the payout was not eligible (already resolved, or a sending row not yet stale)', async () => {
    resolveManuallyRpcMock.mockResolvedValue({ data: false, error: null })

    await resolveProviderPayoutManually(formData({ payoutId: PAYOUT_ID, notes: 'paid via bank transfer' }))

    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/pagos-proveedores')
  })

  it('logs (without crashing) when the RPC itself errors', async () => {
    resolveManuallyRpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    await resolveProviderPayoutManually(formData({ payoutId: PAYOUT_ID, notes: 'paid via bank transfer' }))

    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/pagos-proveedores')
  })
})
