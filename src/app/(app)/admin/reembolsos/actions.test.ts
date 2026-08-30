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

const getUserByIdMock = vi.fn()
const markProcessedRpcMock = vi.fn()
const refundSelectSingle = vi.fn()
const refundRejectUpdateSingle = vi.fn()
const policyUpdateSelect = vi.fn()

const refundRejectUpdateInMock = vi.fn(() => ({ select: () => ({ single: refundRejectUpdateSingle }) }))
const refundRejectUpdateMock = vi.fn(() => ({
  eq: () => ({ in: (...args: unknown[]) => refundRejectUpdateInMock(...args) }),
}))
const policyUpdateMock = vi.fn(() => ({ eq: () => ({ select: policyUpdateSelect }) }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { getUserById: getUserByIdMock } },
    rpc: (fn: string, args: Record<string, unknown>) => markProcessedRpcMock(fn, args),
    from: (table: string) => {
      if (table === 'refund_requests') {
        return {
          select: () => ({ eq: () => ({ single: refundSelectSingle }) }),
          update: refundRejectUpdateMock,
        }
      }
      if (table === 'refund_policy_config') {
        return { update: policyUpdateMock }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const sendRefundProcessedEmailMock = vi.fn()
const sendRefundRejectedEmailMock = vi.fn()
vi.mock('@/lib/email/refundEmails', () => ({
  sendRefundProcessedEmail: (...args: unknown[]) => sendRefundProcessedEmailMock(...args),
  sendRefundRejectedEmail: (...args: unknown[]) => sendRefundRejectedEmailMock(...args),
}))

const { markRefundProcessedManually, rejectRefundRequest, updateRefundPolicyRate } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const REFUND_ID = '11111111-1111-1111-1111-111111111111'
const CONFIG_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'tourist@example.com' } } })
})

describe('getAuthenticatedAdmin guard (shared by all three actions)', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(markRefundProcessedManually(formData({ refundRequestId: REFUND_ID }))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(rejectRefundRequest(formData({ refundRequestId: REFUND_ID, rejection_reason: 'no' }))).rejects.toThrow('redirect:/')
    expect(markProcessedRpcMock).not.toHaveBeenCalled()
  })
})

describe('markRefundProcessedManually', () => {
  it('redirects without calling the RPC when refundRequestId is not a valid UUID', async () => {
    await expect(markRefundProcessedManually(formData({ refundRequestId: 'not-a-uuid' }))).rejects.toThrow(
      'redirect:/admin/reembolsos',
    )
    expect(markProcessedRpcMock).not.toHaveBeenCalled()
  })

  it("calls mark_refund_request_processed with method 'manual' and the admin's id", async () => {
    markProcessedRpcMock.mockResolvedValue({ data: true, error: null })
    refundSelectSingle.mockResolvedValue({ data: { refund_amount_cents: 50000, requested_by: 'tourist-1' }, error: null })

    await markRefundProcessedManually(formData({ refundRequestId: REFUND_ID }))

    expect(markProcessedRpcMock).toHaveBeenCalledWith('mark_refund_request_processed', {
      p_refund_request_id: REFUND_ID,
      p_method: 'manual',
      p_processed_by: 'admin-1',
    })
    expect(sendRefundProcessedEmailMock).toHaveBeenCalledWith('tourist@example.com', 50000, 'manual')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/reembolsos')
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('does not look up the requester or send an email when the RPC reports it was already processed', async () => {
    markProcessedRpcMock.mockResolvedValue({ data: false, error: null })

    await markRefundProcessedManually(formData({ refundRequestId: REFUND_ID }))

    expect(refundSelectSingle).not.toHaveBeenCalled()
    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
  })

  it('does not send an email when the requester has no resolvable email', async () => {
    markProcessedRpcMock.mockResolvedValue({ data: true, error: null })
    refundSelectSingle.mockResolvedValue({ data: { refund_amount_cents: 50000, requested_by: 'tourist-1' }, error: null })
    getUserByIdMock.mockResolvedValue({ data: { user: null } })

    await markRefundProcessedManually(formData({ refundRequestId: REFUND_ID }))

    expect(sendRefundProcessedEmailMock).not.toHaveBeenCalled()
  })
})

describe('rejectRefundRequest', () => {
  it('redirects without updating when refundRequestId is invalid', async () => {
    await expect(rejectRefundRequest(formData({ refundRequestId: 'bad', rejection_reason: 'no' }))).rejects.toThrow(
      'redirect:/admin/reembolsos',
    )
    expect(refundRejectUpdateMock).not.toHaveBeenCalled()
  })

  it('redirects without updating when no rejection_reason is provided', async () => {
    await expect(rejectRefundRequest(formData({ refundRequestId: REFUND_ID }))).rejects.toThrow('redirect:/admin/reembolsos')
    expect(refundRejectUpdateMock).not.toHaveBeenCalled()
  })

  it('updates the request to rejected with the trimmed reason and admin id, then emails the requester', async () => {
    refundRejectUpdateSingle.mockResolvedValue({ data: { requested_by: 'tourist-1' }, error: null })

    await rejectRefundRequest(formData({ refundRequestId: REFUND_ID, rejection_reason: '  Fuera de ventana  ' }))

    expect(refundRejectUpdateMock).toHaveBeenCalledWith({
      status: 'rejected',
      admin_notes: 'Fuera de ventana',
      processed_by: 'admin-1',
    })
    expect(refundRejectUpdateInMock).toHaveBeenCalledWith('status', ['pending', 'processing'])
    expect(sendRefundRejectedEmailMock).toHaveBeenCalledWith('tourist@example.com', 'Fuera de ventana')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/reembolsos')
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-reservas')
  })

  it('does not send an email when the update matched no row (e.g. already resolved)', async () => {
    refundRejectUpdateSingle.mockResolvedValue({ data: null, error: { message: 'no rows' } })

    await rejectRefundRequest(formData({ refundRequestId: REFUND_ID, rejection_reason: 'motivo' }))

    expect(sendRefundRejectedEmailMock).not.toHaveBeenCalled()
  })
})

describe('updateRefundPolicyRate', () => {
  it('returns notFound error for an invalid configId', async () => {
    const result = await updateRefundPolicyRate(formData({ configId: 'bad', rate: '50' }))
    expect(result).toEqual({ error: 'Configuración no encontrada.' })
    expect(policyUpdateMock).not.toHaveBeenCalled()
  })

  it.each(['-1', '101', 'abc'])('returns invalidRate error for rate=%s', async (rate) => {
    const result = await updateRefundPolicyRate(formData({ configId: CONFIG_ID, rate }))
    expect(result).toEqual({ error: 'El porcentaje debe ser un número entre 0 y 100.' })
  })

  it('updates the rate and returns success', async () => {
    policyUpdateSelect.mockResolvedValue({ data: [{ id: CONFIG_ID }], error: null })

    const result = await updateRefundPolicyRate(formData({ configId: CONFIG_ID, rate: '60' }))

    expect(policyUpdateMock).toHaveBeenCalledWith({ refund_percentage: 60, updated_by: 'admin-1' })
    expect(result).toEqual({ success: true })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/reembolsos')
  })

  it('returns a generic error when the update matches no row', async () => {
    policyUpdateSelect.mockResolvedValue({ data: [], error: null })
    const result = await updateRefundPolicyRate(formData({ configId: CONFIG_ID, rate: '60' }))
    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
  })
})
