import { describe, it, expect, vi, beforeEach } from 'vitest'

// The tourist-side counterpart to mi-perfil-transporte/actions.ts.
// createTransportRequest/cancelTransportRequest only ever use the
// RLS-scoped `supabase` client (never createAdminClient) — ownership there
// is meant to be enforced by RLS policy, not an application-level
// tourist_id filter; a few tests below assert the admin client mock was
// never invoked to guard that. createTransporterReview is the exception —
// like createGuideTourReview/createPackageReview elsewhere in this
// codebase, it uses the admin client with its own explicit re-validation,
// RLS staying only as defense-in-depth.

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
const transporterRouteSingle = vi.fn() // select(...).eq(id).eq(status).single() — createTransportRequest's route lookup

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
      if (table === 'transporter_routes') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: transporterRouteSingle }) }) }) }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const transportRequestReviewSingleMock = vi.fn()
const transporterReviewInsertMock = vi.fn()

const createAdminClientMock = vi.fn(() => ({
  from: (table: string) => {
    if (table === 'transport_requests') {
      return { select: () => ({ eq: () => ({ single: transportRequestReviewSingleMock }) }) }
    }
    if (table === 'transporter_reviews') {
      return { insert: (payload: Record<string, unknown>) => transporterReviewInsertMock(payload) }
    }
    throw new Error(`unexpected table on admin client: ${table}`)
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}))

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  transportRequestRateLimit: {},
  transporterReviewRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

const { createTransportRequest, cancelTransportRequest, createTransporterReview } = await import('./actions')

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

  it('rejects a people_count above the 20-person cap the client already declares (max="20")', async () => {
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '21' })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('accepts a people_count of exactly the 20-person cap', async () => {
    transportRequestsInsert.mockResolvedValue({ error: null })
    const fd = formData({ origin: 'A', destination: 'B', requested_datetime: futureDatetime(), people_count: '20' })

    await expect(createTransportRequest(undefined, fd)).rejects.toThrow('redirect:/mis-viajes')

    expect(transportRequestsInsert).toHaveBeenCalledWith(expect.objectContaining({ people_count: 20 }))
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
      transporter_route_id: null,
      trip_type: 'one_way',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-viajes')
    expect(createAdminClientMock).not.toHaveBeenCalled()
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

describe('createTransportRequest with a published route', () => {
  const ROUTE_ID = '33333333-3333-3333-3333-333333333333'

  it('rejects a non-UUID transporter_route_id without querying the DB', async () => {
    const fd = formData({
      transporter_route_id: 'not-a-uuid', requested_datetime: futureDatetime(), people_count: '1',
    })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(transporterRouteSingle).not.toHaveBeenCalled()
  })

  it('returns "not found" when the route does not exist or is inactive', async () => {
    transporterRouteSingle.mockResolvedValue({ data: null })
    const fd = formData({
      transporter_route_id: ROUTE_ID, requested_datetime: futureDatetime(), people_count: '1',
    })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Solicitud no encontrada.' })
  })

  it('rejects a trip_type the route does not offer', async () => {
    transporterRouteSingle.mockResolvedValue({
      data: { origin: 'Casco urbano', destination: 'Cascada', allows_one_way: false, allows_round_trip: true },
    })
    const fd = formData({
      transporter_route_id: ROUTE_ID, trip_type: 'one_way', requested_datetime: futureDatetime(), people_count: '1',
    })
    const result = await createTransportRequest(undefined, fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(transportRequestsInsert).not.toHaveBeenCalled()
  })

  it('uses the route\'s own origin/destination, ignoring any client-supplied ones', async () => {
    transporterRouteSingle.mockResolvedValue({
      data: { origin: 'Casco urbano', destination: 'Cascada', allows_one_way: true, allows_round_trip: true },
    })
    transportRequestsInsert.mockResolvedValue({ error: null })
    const fd = formData({
      transporter_route_id: ROUTE_ID,
      trip_type: 'round_trip',
      origin: 'attacker-supplied origin',
      destination: 'attacker-supplied destination',
      requested_datetime: futureDatetime(),
      people_count: '2',
    })

    await expect(createTransportRequest(undefined, fd)).rejects.toThrow('redirect:/mis-viajes')

    expect(transportRequestsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'Casco urbano',
        destination: 'Cascada',
        transporter_route_id: ROUTE_ID,
        trip_type: 'round_trip',
      }),
    )
  })

  it('defaults trip_type to one_way when the field is absent', async () => {
    transporterRouteSingle.mockResolvedValue({
      data: { origin: 'Casco urbano', destination: 'Cascada', allows_one_way: true, allows_round_trip: true },
    })
    transportRequestsInsert.mockResolvedValue({ error: null })
    const fd = formData({
      transporter_route_id: ROUTE_ID, requested_datetime: futureDatetime(), people_count: '1',
    })

    await expect(createTransportRequest(undefined, fd)).rejects.toThrow('redirect:/mis-viajes')
    expect(transportRequestsInsert).toHaveBeenCalledWith(expect.objectContaining({ trip_type: 'one_way' }))
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
    expect(createAdminClientMock).not.toHaveBeenCalled()
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

function completedRequestRow(overrides: Partial<{
  tourist_id: string
  transporter_id: string | null
  status: string
}> = {}) {
  return {
    id: REQUEST_ID,
    tourist_id: overrides.tourist_id ?? 'user-1',
    transporter_id: 'transporter_id' in overrides ? overrides.transporter_id : 'transporter-1',
    status: overrides.status ?? 'completed',
  }
}

// Deliberately gated on transport_requests.status='completed', not on
// bookings — see this action's own comment in actions.ts for why.
describe('createTransporterReview', () => {
  it('returns a rate-limit error and never queries the DB when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(transportRequestReviewSingleMock).not.toHaveBeenCalled()
  })

  it('rejects a non-UUID transport_request_id without querying the DB', async () => {
    const result = await createTransporterReview(formData({ transport_request_id: 'not-a-uuid', rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar traslados ya completados.' })
    expect(transportRequestReviewSingleMock).not.toHaveBeenCalled()
  })

  it.each(['0', '6', '2.5', 'abc', ''])('rejects an invalid rating value %s', async (rating) => {
    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating }))
    expect(result).toEqual({ error: 'Selecciona una calificación de 1 a 5 estrellas.' })
    expect(transportRequestReviewSingleMock).not.toHaveBeenCalled()
  })

  it('rejects when the request does not exist', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: null })
    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar traslados ya completados.' })
  })

  it('rejects when the request belongs to a different tourist', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow({ tourist_id: 'someone-else' }) })
    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar traslados ya completados.' })
  })

  it('rejects a request with no transporter_id (defensive — should never happen)', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow({ transporter_id: null }) })
    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar traslados ya completados.' })
  })

  it('rejects a request that is not completed', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow({ status: 'accepted' }) })
    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))
    expect(result).toEqual({ error: 'Solo puedes reseñar traslados ya completados.' })
    expect(transporterReviewInsertMock).not.toHaveBeenCalled()
  })

  it('inserts the review with a trimmed comment and revalidates on success', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow() })
    transporterReviewInsertMock.mockResolvedValue({ error: null })

    const result = await createTransporterReview(
      formData({ transport_request_id: REQUEST_ID, rating: '4', comment: '  Excelente conductor  ' }),
    )

    expect(result).toEqual({ success: true })
    expect(transporterReviewInsertMock).toHaveBeenCalledWith({
      transporter_id: 'transporter-1',
      transport_request_id: REQUEST_ID,
      tourist_id: 'user-1',
      rating: 4,
      comment: 'Excelente conductor',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mis-viajes')
  })

  it('stores a null comment when none is provided', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow() })
    transporterReviewInsertMock.mockResolvedValue({ error: null })

    await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))

    expect(transporterReviewInsertMock).toHaveBeenCalledWith(expect.objectContaining({ comment: null }))
  })

  it('caps the comment at 500 characters server-side', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow() })
    transporterReviewInsertMock.mockResolvedValue({ error: null })

    await createTransporterReview(
      formData({ transport_request_id: REQUEST_ID, rating: '5', comment: 'a'.repeat(600) }),
    )

    expect(transporterReviewInsertMock).toHaveBeenCalledWith(expect.objectContaining({ comment: 'a'.repeat(500) }))
  })

  it('maps a unique_violation on insert to "already reviewed" rather than a generic error', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow() })
    transporterReviewInsertMock.mockResolvedValue({ error: { code: '23505' } })

    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))

    expect(result).toEqual({ error: 'Ya dejaste una reseña para este traslado.' })
  })

  it('returns a generic error on any other insert failure', async () => {
    transportRequestReviewSingleMock.mockResolvedValue({ data: completedRequestRow() })
    transporterReviewInsertMock.mockResolvedValue({ error: { code: '23503' } })

    const result = await createTransporterReview(formData({ transport_request_id: REQUEST_ID, rating: '5' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})
