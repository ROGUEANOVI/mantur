import { describe, it, expect, vi, beforeEach } from 'vitest'

// The tourist-side counterpart to mi-perfil-transporte/actions.ts. Notably
// this file only ever uses the RLS-scoped `supabase` client (never
// createAdminClient) — ownership on cancelTransportRequest is meant to be
// enforced by RLS policy, not an application-level tourist_id filter. These
// tests can't verify RLS itself, but they do verify the code never reaches
// for the admin client to bypass it.

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
const transportRequestsInsert = vi.fn()
const transportRequestsUpdateMock = vi.fn()
const transportRequestsEqMock = vi.fn()

function updateChain(payload: unknown) {
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      }
      if (table === 'transport_requests') {
        return {
          insert: (payload: unknown) => transportRequestsInsert(payload),
          update: (payload: unknown) => updateChain(payload),
        }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

// The action must never reach for the admin client — ownership on cancel is
// meant to be enforced by RLS on the user-scoped client, not bypassed.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('createTransportRequest/cancelTransportRequest must not use the admin client')
  }),
}))

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  transportRequestRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

const { createTransportRequest, cancelTransportRequest } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const REQUEST_ID = '11111111-1111-1111-1111-111111111111'
const futureDatetime = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const pastDatetime = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
  checkRateLimitMock.mockResolvedValue(true)
})

describe('rate limiting', () => {
  it('createTransportRequest returns a rate-limit error and never inserts when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '1' })

    const result = await createTransportRequest(undefined, fd)

    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(checkRateLimitMock).toHaveBeenCalledWith({}, 'user-1')
    expect(transportRequestsInsert).not.toHaveBeenCalled()
  })
})

describe('getAuthenticatedTourist guard', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '1' })
    await expect(createTransportRequest(undefined, fd)).rejects.toThrow('redirect:/login')
    expect(transportRequestsInsert).not.toHaveBeenCalled()
  })

  it('redirects to / when the authenticated user is not a tourist', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'transporter' } })
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '1' })
    await expect(createTransportRequest(undefined, fd)).rejects.toThrow('redirect:/')
  })
})

describe('createTransportRequest validation', () => {
  it('rejects a missing origin', async () => {
    const fd = formData({ destination: 'B', requested_datetime: futureDatetime(), people_count: '1' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(transportRequestsInsert).not.toHaveBeenCalled()
  })

  it('rejects a missing destination', async () => {
    const fd = formData({ origin: 'A', requested_datetime: futureDatetime(), people_count: '1' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects a missing datetime', async () => {
    const fd = formData({ origin: 'A', destination: 'B', people_count: '1' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects an unparseable datetime string', async () => {
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: 'not-a-date', people_count: '1' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'La fecha y hora deben ser en el futuro.' })
  })

  it('rejects a datetime in the past', async () => {
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: pastDatetime(), people_count: '1' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'La fecha y hora deben ser en el futuro.' })
  })

  it('rejects zero people_count with the missingFields copy (not a separate invalid-people message)', async () => {
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '0' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects a non-numeric people_count', async () => {
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: 'abc' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })
})

describe('createTransportRequest success path', () => {
  it('inserts the request with the session tourist_id and redirects to /mis-viajes', async () => {
    transportRequestsInsert.mockResolvedValue({ error: null })
    const dt = futureDatetime()
    const fd = formData({ origin: '  Parque central  ', destination: '  Pozo Azul  ', requested_datetime: dt, people_count: '3' })

    await expect(createTransportRequest(undefined, fd)).rejects.toThrow('redirect:/mis-viajes')

    expect(transportRequestsInsert).toHaveBeenCalledWith({
      tourist_id: 'user-1',
      origin: 'Parque central',
      destination: 'Pozo Azul',
      requested_datetime: new Date(dt).toISOString(),
      people_count: 3,
      notes: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-viajes')
  })

  it('ignores a client-supplied tourist_id and always uses the session user id', async () => {
    transportRequestsInsert.mockResolvedValue({ error: null })
    // The real form never sends this field, but the action must not read
    // it even if it did — otherwise a tourist could file a request under
    // someone else's account by spoofing a form field.
    const fd = formData({
      origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '1',
      tourist_id: 'attacker-controlled-uuid',
    })

    await expect(createTransportRequest(undefined, fd)).rejects.toThrow('redirect:/mis-viajes')
    expect(transportRequestsInsert).toHaveBeenCalledWith(expect.objectContaining({ tourist_id: 'user-1' }))
  })

  it('trims notes and stores them, or null when blank/whitespace-only', async () => {
    transportRequestsInsert.mockResolvedValue({ error: null })

    const fdWithNotes = formData({
      origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '1', notes: '  Llamar al llegar  ',
    })
    await expect(createTransportRequest(undefined, fdWithNotes)).rejects.toThrow('redirect:/mis-viajes')
    expect(transportRequestsInsert).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Llamar al llegar' }))

    vi.clearAllMocks()
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    checkRateLimitMock.mockResolvedValue(true)
    transportRequestsInsert.mockResolvedValue({ error: null })

    const fdBlankNotes = formData({
      origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '1', notes: '   ',
    })
    await expect(createTransportRequest(undefined, fdBlankNotes)).rejects.toThrow('redirect:/mis-viajes')
    expect(transportRequestsInsert).toHaveBeenCalledWith(expect.objectContaining({ notes: null }))
  })

  it('returns a generic error and does not redirect when the insert fails', async () => {
    transportRequestsInsert.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '1' })

    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

describe('cancelTransportRequest', () => {
  it('redirects to /mis-viajes without querying when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'not-a-uuid' })
    await expect(cancelTransportRequest(fd)).rejects.toThrow('redirect:/mis-viajes')
    expect(transportRequestsEqMock).not.toHaveBeenCalled()
  })

  it('sets status=cancelled and only on a request that is still pending — filters on id AND status=pending', async () => {
    const fd = formData({ requestId: REQUEST_ID })
    await cancelTransportRequest(fd)

    expect(transportRequestsUpdateMock).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(transportRequestsEqMock).toHaveBeenCalledWith('id', REQUEST_ID)
    expect(transportRequestsEqMock).toHaveBeenCalledWith('status', 'pending')
    expect(transportRequestsEqMock).toHaveBeenCalledTimes(2)
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-viajes')
  })

  it('redirects to / when a non-tourist tries to cancel a request', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'admin' } })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(cancelTransportRequest(fd)).rejects.toThrow('redirect:/')
    expect(transportRequestsEqMock).not.toHaveBeenCalled()
  })

  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(cancelTransportRequest(fd)).rejects.toThrow('redirect:/login')
    expect(transportRequestsEqMock).not.toHaveBeenCalled()
  })
})
