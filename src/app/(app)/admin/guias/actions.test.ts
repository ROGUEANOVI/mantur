import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deactivate/delete revoke the tourist_guide role in addition to touching
// tourist_guides — that dual write, and the FK-restrict fallback on delete,
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

const guideUpdateMock = vi.fn()
const guideDeleteMock = vi.fn()
const profileUpdateMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'tourist_guides') {
        return {
          update: (payload: unknown) => ({ eq: (col: string, val: string) => guideUpdateMock(payload, col, val) }),
          delete: () => ({ eq: (col: string, val: string) => guideDeleteMock(col, val) }),
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

const { deactivateGuide, activateGuide, deleteGuide } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  guideUpdateMock.mockResolvedValue({ error: null })
  guideDeleteMock.mockResolvedValue({ error: null })
  profileUpdateMock.mockResolvedValue({ error: null })
})

describe('getAuthenticatedAdmin guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(deactivateGuide(formData({ guideId: 'g1', profileId: 'p1' }))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(deactivateGuide(formData({ guideId: 'g1', profileId: 'p1' }))).rejects.toThrow('redirect:/')
    expect(guideUpdateMock).not.toHaveBeenCalled()
  })
})

describe('deactivateGuide', () => {
  it('does nothing when guideId is missing', async () => {
    await deactivateGuide(formData({ profileId: 'p1' }))
    expect(guideUpdateMock).not.toHaveBeenCalled()
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })

  it('does nothing when profileId is missing', async () => {
    await deactivateGuide(formData({ guideId: 'g1' }))
    expect(guideUpdateMock).not.toHaveBeenCalled()
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })

  it('sets is_available false and reverts the profile role to tourist', async () => {
    await deactivateGuide(formData({ guideId: 'g1', profileId: 'p1' }))
    expect(guideUpdateMock).toHaveBeenCalledWith({ is_available: false }, 'id', 'g1')
    expect(profileUpdateMock).toHaveBeenCalledWith({ role: 'tourist' }, 'id', 'p1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/guias')
    expect(revalidatePathMock).toHaveBeenCalledWith('/guias')
  })
})

describe('activateGuide', () => {
  it('does nothing when profileId is missing', async () => {
    await activateGuide(new FormData())
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })

  it('restores the tourist_guide role', async () => {
    await activateGuide(formData({ profileId: 'p1' }))
    expect(profileUpdateMock).toHaveBeenCalledWith({ role: 'tourist_guide' }, 'id', 'p1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/guias')
    expect(revalidatePathMock).toHaveBeenCalledWith('/guias')
  })
})

describe('deleteGuide', () => {
  it('does nothing when ids are missing', async () => {
    await deleteGuide(formData({ guideId: 'g1' }))
    expect(guideDeleteMock).not.toHaveBeenCalled()
  })

  it('deletes the guide row, reverts the role, and redirects to the list', async () => {
    await expect(deleteGuide(formData({ guideId: 'g1', profileId: 'p1' }))).rejects.toThrow('redirect:/admin/guias')
    expect(guideDeleteMock).toHaveBeenCalledWith('id', 'g1')
    expect(profileUpdateMock).toHaveBeenCalledWith({ role: 'tourist' }, 'id', 'p1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/guias')
    expect(revalidatePathMock).toHaveBeenCalledWith('/guias')
  })

  it('redirects with an error and skips the role revert when the delete is FK-blocked', async () => {
    guideDeleteMock.mockResolvedValue({ error: { code: '23503' } })
    await expect(deleteGuide(formData({ guideId: 'g1', profileId: 'p1' }))).rejects.toThrow(
      'redirect:/admin/guias?error=has_bookings',
    )
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })
})
