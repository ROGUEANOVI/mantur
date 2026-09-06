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

const transactionSelectSingle = vi.fn()
const transactionUpdateEq = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'transactions') {
        return {
          select: () => ({ eq: () => ({ single: transactionSelectSingle }) }),
          update: () => ({ eq: transactionUpdateEq }),
        }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const getInvoiceDianEventsMock = vi.fn()
const resolveDianInvoiceStatusMock = vi.fn()

vi.mock('@/lib/alegra/invoices', () => ({
  getInvoiceDianEvents: (...args: unknown[]) => getInvoiceDianEventsMock(...args),
  resolveDianInvoiceStatus: (...args: unknown[]) => resolveDianInvoiceStatusMock(...args),
}))

const { checkInvoiceDianStatus } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const TRANSACTION_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  transactionSelectSingle.mockResolvedValue({ data: { alegra_invoice_id: 'inv-1' } })
  transactionUpdateEq.mockResolvedValue({ data: null, error: null })
  getInvoiceDianEventsMock.mockResolvedValue({ ok: true, events: [] })
  resolveDianInvoiceStatusMock.mockReturnValue(null)
})

describe('checkInvoiceDianStatus', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(checkInvoiceDianStatus(formData({ transactionId: TRANSACTION_ID }))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the caller is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(checkInvoiceDianStatus(formData({ transactionId: TRANSACTION_ID }))).rejects.toThrow('redirect:/')
  })

  it('returns an error for a malformed transactionId, without querying anything', async () => {
    const result = await checkInvoiceDianStatus(formData({ transactionId: 'not-a-uuid' }))
    expect(result).toEqual({ error: expect.any(String) })
    expect(transactionSelectSingle).not.toHaveBeenCalled()
  })

  it('returns an error when the transaction has no alegra_invoice_id', async () => {
    transactionSelectSingle.mockResolvedValue({ data: { alegra_invoice_id: null } })
    const result = await checkInvoiceDianStatus(formData({ transactionId: TRANSACTION_ID }))
    expect(result).toEqual({ error: expect.any(String) })
    expect(getInvoiceDianEventsMock).not.toHaveBeenCalled()
  })

  it('returns an error when the transaction is not found', async () => {
    transactionSelectSingle.mockResolvedValue({ data: null })
    const result = await checkInvoiceDianStatus(formData({ transactionId: TRANSACTION_ID }))
    expect(result).toEqual({ error: expect.any(String) })
  })

  it('returns an error and writes nothing when the Alegra call fails', async () => {
    getInvoiceDianEventsMock.mockResolvedValue({ ok: false, error: 'timeout' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkInvoiceDianStatus(formData({ transactionId: TRANSACTION_ID }))

    expect(result).toEqual({ error: expect.any(String) })
    expect(transactionUpdateEq).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('returns a "still pending" success and writes nothing when no terminal DIAN event has landed', async () => {
    getInvoiceDianEventsMock.mockResolvedValue({ ok: true, events: [{ type: 'ACKNOWLEDGMENT_DIAN' }] })
    resolveDianInvoiceStatusMock.mockReturnValue(null)

    const result = await checkInvoiceDianStatus(formData({ transactionId: TRANSACTION_ID }))

    expect(result).toEqual({ success: true, message: expect.any(String) })
    expect(transactionUpdateEq).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('updates the transaction and revalidates when a terminal DIAN event is resolved', async () => {
    getInvoiceDianEventsMock.mockResolvedValue({ ok: true, events: [{ type: 'ACCEPTED_DIAN' }] })
    resolveDianInvoiceStatusMock.mockReturnValue('emitted')

    const result = await checkInvoiceDianStatus(formData({ transactionId: TRANSACTION_ID }))

    expect(result).toEqual({ success: true, message: expect.any(String) })
    expect(transactionUpdateEq).toHaveBeenCalledWith('id', TRANSACTION_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/facturas')
  })
})
