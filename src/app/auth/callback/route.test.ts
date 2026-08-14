import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const exchangeCodeForSession = vi.fn()
const getUserMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
      getUser: getUserMock,
    },
  })),
}))

const profilesMaybeSingle = vi.fn()
const profilesUpsert = vi.fn()
const profilesUpdate = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: profilesMaybeSingle }),
          }),
          upsert: (payload: unknown, opts: unknown) => profilesUpsert(payload, opts),
          update: (payload: unknown) => ({
            eq: (column: string, value: unknown) => profilesUpdate(payload, column, value),
          }),
        }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const { GET } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
  profilesUpsert.mockResolvedValue({ error: null })
  profilesUpdate.mockResolvedValue({ error: null })
})

function makeRequest(search: string) {
  return new NextRequest(`https://mantur.co/auth/callback${search}`)
}

describe('GET /auth/callback', () => {
  it('redirects to the oauth error page when Google returns an error param, without exchanging any code', async () => {
    const res = await GET(makeRequest('?error=access_denied'))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=oauth')
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('redirects to the oauth error page when the code param is missing', async () => {
    const res = await GET(makeRequest(''))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=oauth')
    expect(exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('redirects to the oauth error page when exchangeCodeForSession fails', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid code' } })

    const res = await GET(makeRequest('?code=abc123'))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=oauth')
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('redirects to the oauth error page when there is no user after a successful exchange', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({ data: { user: null } })

    const res = await GET(makeRequest('?code=abc123'))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=oauth')
  })

  it('redirects to the oauth error page when the profile read fails, without writing anything', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-x', user_metadata: {} } } })
    profilesMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db unavailable' } })

    const res = await GET(makeRequest('?code=abc123'))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=oauth')
    expect(profilesUpsert).not.toHaveBeenCalled()
    expect(profilesUpdate).not.toHaveBeenCalled()
  })

  it('creates a tourist profile from Google metadata for a brand-new user and redirects to /', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'new-user-1',
          user_metadata: { full_name: 'Ana Pérez', avatar_url: 'https://google.example/avatar.png' },
        },
      },
    })
    profilesMaybeSingle.mockResolvedValue({ data: null })

    const res = await GET(makeRequest('?code=abc123'))

    expect(profilesUpsert).toHaveBeenCalledWith(
      {
        id: 'new-user-1',
        role: 'tourist',
        full_name: 'Ana Pérez',
        avatar_url: 'https://google.example/avatar.png',
      },
      { onConflict: 'id' },
    )
    expect(profilesUpdate).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe('https://mantur.co/')
  })

  it('preserves an existing admin role by never including role in the update, and redirects to /admin', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({
      data: { user: { id: 'admin-1', user_metadata: {} } },
    })
    profilesMaybeSingle.mockResolvedValue({
      data: { role: 'admin', full_name: 'Admin Existente', avatar_url: null },
    })

    const res = await GET(makeRequest('?code=abc123'))

    expect(profilesUpdate).toHaveBeenCalledWith(
      { full_name: 'Admin Existente', avatar_url: null },
      'id',
      'admin-1',
    )
    expect(profilesUpsert).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toBe('https://mantur.co/admin')
  })

  it('does not overwrite an existing full_name/avatar_url with Google metadata', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-2',
          user_metadata: { full_name: 'Nombre de Google', avatar_url: 'https://google.example/new.png' },
        },
      },
    })
    profilesMaybeSingle.mockResolvedValue({
      data: { role: 'tourist', full_name: 'Nombre editado en /mi-perfil', avatar_url: 'https://mantur.co/old.png' },
    })

    await GET(makeRequest('?code=abc123'))

    expect(profilesUpdate).toHaveBeenCalledWith(
      { full_name: 'Nombre editado en /mi-perfil', avatar_url: 'https://mantur.co/old.png' },
      'id',
      'user-2',
    )
    expect(profilesUpsert).not.toHaveBeenCalled()
  })
})
