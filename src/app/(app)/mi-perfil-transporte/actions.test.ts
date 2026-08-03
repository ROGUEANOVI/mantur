import { describe, it, expect, vi, beforeEach } from 'vitest'

// acceptTransportRequest is the atomic first-one-wins claim CLAUDE.md calls
// out explicitly ("acceptTransportRequest uses service_role to guarantee
// first-one-wins"). The safety property lives entirely in which columns the
// UPDATE filters on (id + status='pending'), since Postgres's row-level
// atomicity is what makes concurrent claims safe — this suite exists to
// prove those exact filters are the ones sent, not to re-test Postgres
// itself. markCompleted additionally filters on transporter_id, which is
// the only thing stopping one transporter from completing another's ride.

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
const transporterLookupSingle = vi.fn()
const currentAvailabilitySingle = vi.fn()
const toggleUpdateMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      }
      if (table === 'transporters') {
        return {
          select: (cols: string) => ({
            eq: () => ({ single: cols === 'id' ? transporterLookupSingle : currentAvailabilitySingle }),
          }),
          update: (payload: unknown) => ({ eq: (col: string, val: string) => toggleUpdateMock(payload, col, val) }),
        }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const transportRequestsUpdateMock = vi.fn()
const transportRequestsEqMock = vi.fn()

function transportRequestsChain(payload: unknown) {
  transportRequestsUpdateMock(payload)
  const chain: PromiseLike<{ error: null }> & { eq: (col: string, val: unknown) => typeof chain } = {
    eq: (col: string, val: unknown) => {
      transportRequestsEqMock(col, val)
      return chain
    },
    then: (resolve: (v: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
  } as unknown as PromiseLike<{ error: null }> & { eq: (col: string, val: unknown) => typeof chain }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'transport_requests') {
        return { update: (payload: unknown) => transportRequestsChain(payload) }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const { toggleAvailability, acceptTransportRequest, markCompleted } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const TRANSPORTER_ID = '11111111-1111-1111-1111-111111111111'
const REQUEST_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'transporter' } })
  transporterLookupSingle.mockResolvedValue({ data: { id: TRANSPORTER_ID } })
})

describe('getAuthenticatedTransporter guard (shared by every action in this file)', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(toggleAvailability()).rejects.toThrow('redirect:/login')
    expect(transporterLookupSingle).not.toHaveBeenCalled()
  })

  it('redirects to / when the authenticated user is not a transporter', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(toggleAvailability()).rejects.toThrow('redirect:/')
    expect(transporterLookupSingle).not.toHaveBeenCalled()
  })

  it('redirects to / when the role is transporter but no transporters row exists for this profile', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    await expect(toggleAvailability()).rejects.toThrow('redirect:/')
  })
})

describe('toggleAvailability', () => {
  it('flips is_available from true to false', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: true } })
    toggleUpdateMock.mockResolvedValue({ error: null })

    await toggleAvailability()

    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_available: false }, 'id', TRANSPORTER_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte')
    expect(revalidatePathMock).toHaveBeenCalledWith('/transportistas')
  })

  it('flips is_available from false to true', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: false } })
    toggleUpdateMock.mockResolvedValue({ error: null })

    await toggleAvailability()

    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_available: true }, 'id', TRANSPORTER_ID)
  })

  it('returns a generic error when the current row cannot be read', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: null })
    const result = await toggleAvailability()
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the update fails', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: true } })
    toggleUpdateMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await toggleAvailability()
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('acceptTransportRequest', () => {
  it('does nothing (no DB call, no revalidation) when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'not-a-uuid' })
    await acceptTransportRequest(fd)
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('claims the request by filtering on id AND status=pending — the atomicity guarantee', async () => {
    const fd = formData({ requestId: REQUEST_ID })
    await acceptTransportRequest(fd)

    expect(transportRequestsUpdateMock).toHaveBeenCalledWith({ transporter_id: TRANSPORTER_ID, status: 'accepted' })
    // Both filters must be present — dropping the status='pending' filter
    // would let a transporter "steal" an already-accepted request.
    expect(transportRequestsEqMock).toHaveBeenCalledWith('id', REQUEST_ID)
    expect(transportRequestsEqMock).toHaveBeenCalledWith('status', 'pending')
    expect(transportRequestsEqMock).toHaveBeenCalledTimes(2)
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte')
  })

  it('redirects to / when the caller is not a registered transporter', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(acceptTransportRequest(fd)).rejects.toThrow('redirect:/')
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
  })
})

describe('markCompleted', () => {
  it('does nothing (no DB call, no revalidation) when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'nope' })
    await markCompleted(fd)
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('redirects to / when the caller is not a registered transporter', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(markCompleted(fd)).rejects.toThrow('redirect:/')
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
  })

  it('filters on id, the caller\'s own transporter_id, AND status=accepted — an ownership check', async () => {
    const fd = formData({ requestId: REQUEST_ID })
    await markCompleted(fd)

    expect(transportRequestsUpdateMock).toHaveBeenCalledWith({ status: 'completed' })
    // transporter_id here comes from the authenticated session (getAuthenticatedTransporter),
    // never from formData — a transporter can't complete a ride that isn't theirs
    // by passing a different id in the request.
    expect(transportRequestsEqMock).toHaveBeenCalledWith('id', REQUEST_ID)
    expect(transportRequestsEqMock).toHaveBeenCalledWith('transporter_id', TRANSPORTER_ID)
    expect(transportRequestsEqMock).toHaveBeenCalledWith('status', 'accepted')
    expect(transportRequestsEqMock).toHaveBeenCalledTimes(3)
  })

  it('ignores a client-supplied transporter_id in formData and still filters by the session transporter', async () => {
    // The real form never sends this field, but the action must not read
    // it even if it did — ownership has to come from the authenticated
    // session, never from client input, or transporter A could complete
    // transporter B's ride by guessing/spoofing a form field.
    const fd = formData({ requestId: REQUEST_ID, transporterId: 'attacker-controlled-uuid', transporter_id: 'attacker-controlled-uuid' })
    await markCompleted(fd)

    expect(transportRequestsEqMock).toHaveBeenCalledWith('transporter_id', TRANSPORTER_ID)
    expect(transportRequestsEqMock).not.toHaveBeenCalledWith('transporter_id', 'attacker-controlled-uuid')
  })
})
