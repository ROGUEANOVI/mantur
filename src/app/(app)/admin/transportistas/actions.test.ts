import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deactivate/delete revoke the transporter role in addition to touching
// transporters — that dual write, and the FK-restrict fallback on delete,
// are the pieces of real logic worth pinning down here.

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

const transporterUpdateMock = vi.fn()
const transporterDeleteMock = vi.fn()
const profileUpdateMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'transporters') {
        return {
          update: (payload: unknown) => ({ eq: (col: string, val: string) => transporterUpdateMock(payload, col, val) }),
          delete: () => ({ eq: (col: string, val: string) => transporterDeleteMock(col, val) }),
        }
      }
      if (table === 'profiles') {
        return {
          update: (payload: unknown) => ({ eq: (col: string, val: string) => profileUpdateMock(payload, col, val) }),
        }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const { deactivateTransporter, activateTransporter, deleteTransporter } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  transporterUpdateMock.mockResolvedValue({ error: null })
  transporterDeleteMock.mockResolvedValue({ error: null })
  profileUpdateMock.mockResolvedValue({ error: null })
})

describe('getAuthenticatedAdmin guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(
      deactivateTransporter(formData({ transporterId: 't1', profileId: 'p1' })),
    ).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(
      deactivateTransporter(formData({ transporterId: 't1', profileId: 'p1' })),
    ).rejects.toThrow('redirect:/')
    expect(transporterUpdateMock).not.toHaveBeenCalled()
  })
})

describe('deactivateTransporter', () => {
  it('does nothing when transporterId is missing', async () => {
    await deactivateTransporter(formData({ profileId: 'p1' }))
    expect(transporterUpdateMock).not.toHaveBeenCalled()
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })

  it('does nothing when profileId is missing', async () => {
    await deactivateTransporter(formData({ transporterId: 't1' }))
    expect(transporterUpdateMock).not.toHaveBeenCalled()
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })

  it('sets is_available false and reverts the profile role to tourist', async () => {
    await deactivateTransporter(formData({ transporterId: 't1', profileId: 'p1' }))
    expect(transporterUpdateMock).toHaveBeenCalledWith({ is_available: false }, 'id', 't1')
    expect(profileUpdateMock).toHaveBeenCalledWith({ role: 'tourist' }, 'id', 'p1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/transportistas')
    expect(revalidatePathMock).toHaveBeenCalledWith('/transportistas')
  })
})

describe('activateTransporter', () => {
  it('does nothing when profileId is missing', async () => {
    await activateTransporter(new FormData())
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })

  it('restores the transporter role', async () => {
    await activateTransporter(formData({ profileId: 'p1' }))
    expect(profileUpdateMock).toHaveBeenCalledWith({ role: 'transporter' }, 'id', 'p1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/transportistas')
    expect(revalidatePathMock).toHaveBeenCalledWith('/transportistas')
  })
})

describe('deleteTransporter', () => {
  it('does nothing when ids are missing', async () => {
    await deleteTransporter(formData({ transporterId: 't1' }))
    expect(transporterDeleteMock).not.toHaveBeenCalled()
  })

  it('deletes the transporter row, reverts the role, and redirects to the list', async () => {
    await expect(
      deleteTransporter(formData({ transporterId: 't1', profileId: 'p1' })),
    ).rejects.toThrow('redirect:/admin/transportistas')
    expect(transporterDeleteMock).toHaveBeenCalledWith('id', 't1')
    expect(profileUpdateMock).toHaveBeenCalledWith({ role: 'tourist' }, 'id', 'p1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/transportistas')
    expect(revalidatePathMock).toHaveBeenCalledWith('/transportistas')
  })

  it('redirects with an error and skips the role revert when the delete is FK-blocked', async () => {
    transporterDeleteMock.mockResolvedValue({ error: { code: '23503' } })
    await expect(
      deleteTransporter(formData({ transporterId: 't1', profileId: 'p1' })),
    ).rejects.toThrow('redirect:/admin/transportistas?error=has_requests')
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })
})
