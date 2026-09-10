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
      throw new Error(`unexpected table on session client: ${table}`)
    },
  })),
}))

const commissionUpdateSelectMock = vi.fn() // provider_commissions.update({...}).eq(id).eq(status).select('id')

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'provider_commissions') {
        return {
          update: (payload: unknown) => ({
            eq: () => ({ eq: () => ({ select: () => commissionUpdateSelectMock(payload) }) }),
          }),
        }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const { markCommissionCollected } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const ADMIN_ID = 'admin-1'
const COMMISSION_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
})

describe('getAuthenticatedAdmin guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(markCommissionCollected(formData({ commissionId: COMMISSION_ID }))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the caller is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(markCommissionCollected(formData({ commissionId: COMMISSION_ID }))).rejects.toThrow('redirect:/')
    expect(commissionUpdateSelectMock).not.toHaveBeenCalled()
  })
})

describe('markCommissionCollected', () => {
  it('rejects a non-UUID commissionId without querying the DB', async () => {
    const result = await markCommissionCollected(formData({ commissionId: 'not-a-uuid' }))
    expect(result).toEqual({ error: 'Registro de comisión no encontrado.' })
    expect(commissionUpdateSelectMock).not.toHaveBeenCalled()
  })

  it('marks the record collected with the admin id and no notes, and revalidates the page', async () => {
    commissionUpdateSelectMock.mockResolvedValue({ data: [{ id: COMMISSION_ID }], error: null })

    const result = await markCommissionCollected(formData({ commissionId: COMMISSION_ID }))

    expect(result).toEqual({ success: true })
    expect(commissionUpdateSelectMock).toHaveBeenCalledWith({
      status: 'collected',
      collected_by: ADMIN_ID,
      admin_notes: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/comisiones/pendientes')
  })

  it('trims and forwards an optional note', async () => {
    commissionUpdateSelectMock.mockResolvedValue({ data: [{ id: COMMISSION_ID }], error: null })

    await markCommissionCollected(formData({ commissionId: COMMISSION_ID, notes: '  Pagó por Nequi  ' }))

    expect(commissionUpdateSelectMock).toHaveBeenCalledWith({
      status: 'collected',
      collected_by: ADMIN_ID,
      admin_notes: 'Pagó por Nequi',
    })
  })

  it('returns a generic error when the update matches zero rows (already collected/voided)', async () => {
    commissionUpdateSelectMock.mockResolvedValue({ data: [], error: null })

    const result = await markCommissionCollected(formData({ commissionId: COMMISSION_ID }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
