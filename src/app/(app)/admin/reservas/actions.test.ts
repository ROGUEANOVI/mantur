import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mirrors src/app/(app)/reservas/actions.test.ts's coverage of
// createServicePrereserva/createGuideTourPrereserva, but for the admin path:
// the tourist comes from an admin-picked id (validated against profiles)
// instead of the session, there's no rate limit, and success returns
// {success:true} instead of redirecting. The shared validation (quantity,
// capacity, date, RPC error mapping) is intentionally mirrored code — see
// createManualServiceBooking's comment in actions.ts — so this file gives it
// light coverage (one invalid case + the happy path) rather than
// re-exercising every branch already pinned down in the sibling file.

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

// Session client — only used by getAuthenticatedAdmin's role check.
const authGetUser = vi.fn()
const sessionProfileSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: sessionProfileSingle }) }) }
      throw new Error(`unexpected table on session client: ${table}`)
    },
  })),
}))

// Generic chainable builder: every method returns itself so call order
// (select/eq/ilike/in/order/limit) doesn't matter, `.single()` resolves the
// configured single-row result, and awaiting the chain directly (no
// `.single()`, e.g. list queries) resolves the configured list result.
function builder(singleFn: () => unknown, listFn: () => unknown = singleFn) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    ilike: () => b,
    in: () => b,
    order: () => b,
    limit: () => b,
    single: () => Promise.resolve(singleFn()),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(listFn()).then(resolve, reject),
  }
  return b
}

const profilesSingleMock = vi.fn() // validateTourist + notify's touristProfile lookup
const profilesListMock = vi.fn() // searchTourists byName
const contactDetailsListMock = vi.fn() // searchTourists byPhone + backfill
const servicesSingleMock = vi.fn()
const guideToursSingleMock = vi.fn()
const businessOwnerSingleMock = vi.fn() // notifyBusinessOfServicePrereserva
const guideProfileIdSingleMock = vi.fn() // notifyGuideOfTourPrereserva

const createServicePrereservaRpcMock = vi.fn()
const createGuideTourPrereservaRpcMock = vi.fn()
const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'create_service_prereserva') return createServicePrereservaRpcMock(args)
  if (fn === 'create_guide_tour_prereserva') return createGuideTourPrereservaRpcMock(args)
  throw new Error(`unexpected rpc: ${fn}`)
})

const getUserByIdMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
    from: (table: string) => {
      if (table === 'profiles') return builder(profilesSingleMock, profilesListMock)
      if (table === 'profile_contact_details') return builder(contactDetailsListMock, contactDetailsListMock)
      if (table === 'services') return builder(servicesSingleMock)
      if (table === 'guide_tours') return builder(guideToursSingleMock)
      if (table === 'businesses') return builder(businessOwnerSingleMock)
      if (table === 'tourist_guides') return builder(guideProfileIdSingleMock)
      throw new Error(`unexpected table on admin client: ${table}`)
    },
    auth: { admin: { getUserById: getUserByIdMock } },
  })),
}))

const sendBusinessBookingConfirmedEmailMock = vi.fn()
const sendGuideBookingConfirmedEmailMock = vi.fn()
vi.mock('@/lib/email/bookingEmails', () => ({
  sendPackagePrereservaRequestedEmail: vi.fn(),
  sendBusinessBookingConfirmedEmail: (...args: unknown[]) => sendBusinessBookingConfirmedEmailMock(...args),
  sendGuideBookingConfirmedEmail: (...args: unknown[]) => sendGuideBookingConfirmedEmailMock(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  bookingRateLimit: {},
  checkRateLimit: vi.fn(async () => true),
}))

vi.mock('@/lib/wompi/checkout', () => ({
  buildWompiCheckoutUrl: vi.fn(() => 'https://checkout.wompi.co/p/?ref=unused'),
}))

const getBlockedDatesMock = vi.fn()
vi.mock('@/lib/availability', () => ({
  getBlockedDates: (...args: unknown[]) => getBlockedDatesMock(...args),
}))

const {
  searchTourists,
  getItemBlockedDates,
  createManualServiceBooking,
  createManualGuideTourBooking,
} = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const ADMIN_ID = 'admin-1'
const TOURIST_ID = '99999999-9999-9999-9999-999999999999'
const SERVICE_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'
const FUTURE_DATE = '2099-01-01'

function serviceRow(overrides: Partial<{ base_price: number; capacity: number | null; business_id: string; pricing_unit: 'per_person' | 'per_night' | 'fixed' }> = {}) {
  return {
    id: SERVICE_ID,
    name: 'Cabalgata',
    base_price: overrides.base_price ?? 40000,
    capacity: 'capacity' in overrides ? overrides.capacity : 10,
    status: 'active',
    business_id: overrides.business_id ?? 'biz-42',
    service_types: { slug: 'tour_activity', pricing_unit: overrides.pricing_unit ?? 'per_person' },
  }
}

function tourRow(overrides: Partial<{ price: number; capacity: number | null; guide_id: string }> = {}) {
  return {
    id: TOUR_ID,
    name: 'Recorrido nocturno',
    price: overrides.price ?? 60000,
    capacity: 'capacity' in overrides ? overrides.capacity : 8,
    status: 'active',
    guide_id: overrides.guide_id ?? 'guide-1',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } })
  sessionProfileSingle.mockResolvedValue({ data: { role: 'admin' } })
  profilesSingleMock.mockResolvedValue({ data: { id: TOURIST_ID, full_name: 'Ana Pérez' } })
  profilesListMock.mockResolvedValue({ data: [] })
  contactDetailsListMock.mockResolvedValue({ data: [] })
  businessOwnerSingleMock.mockResolvedValue({ data: { owner_id: 'owner-1' } })
  guideProfileIdSingleMock.mockResolvedValue({ data: { profile_id: 'guide-profile-1' } })
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'provider@mantur.co' } } })
  getBlockedDatesMock.mockResolvedValue([])
})

describe('getAuthenticatedAdmin guard (shared by every action here)', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(createManualServiceBooking(formData({ tourist_id: TOURIST_ID }))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the caller is not an admin', async () => {
    sessionProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(createManualServiceBooking(formData({ tourist_id: TOURIST_ID }))).rejects.toThrow('redirect:/')
  })
})

describe('searchTourists', () => {
  it('returns no results for a query shorter than 2 characters, without querying the DB', async () => {
    const results = await searchTourists('a')
    expect(results).toEqual([])
    expect(profilesListMock).not.toHaveBeenCalled()
  })

  it('matches by name, backfilling phone from profile_contact_details', async () => {
    profilesListMock.mockResolvedValue({ data: [{ id: TOURIST_ID, full_name: 'Ana Pérez' }] })
    contactDetailsListMock.mockResolvedValue({ data: [{ profile_id: TOURIST_ID, phone: '3001234567' }] })

    const results = await searchTourists('Ana')

    expect(results).toEqual([{ id: TOURIST_ID, full_name: 'Ana Pérez', phone: '3001234567' }])
  })

  it('matches by phone digits', async () => {
    contactDetailsListMock.mockResolvedValue({
      data: [{ profile_id: TOURIST_ID, phone: '3001234567', profiles: { id: TOURIST_ID, full_name: 'Ana Pérez' } }],
    })

    const results = await searchTourists('300 123 4567')

    expect(results).toEqual([{ id: TOURIST_ID, full_name: 'Ana Pérez', phone: '3001234567' }])
  })
})

describe('getItemBlockedDates', () => {
  it('resolves business_id for a service and delegates to getBlockedDates', async () => {
    servicesSingleMock.mockResolvedValue({ data: { business_id: 'biz-42' } })

    await getItemBlockedDates('service', SERVICE_ID)

    expect(getBlockedDatesMock).toHaveBeenCalledWith(expect.anything(), 'service', SERVICE_ID, 'business', 'biz-42')
  })

  it('resolves guide_id for a guide tour and delegates to getBlockedDates', async () => {
    guideToursSingleMock.mockResolvedValue({ data: { guide_id: 'guide-1' } })

    await getItemBlockedDates('guide_tour', TOUR_ID)

    expect(getBlockedDatesMock).toHaveBeenCalledWith(expect.anything(), 'guide_tour', TOUR_ID, 'guide', 'guide-1')
  })

  it('returns an empty list when the item is missing, without calling getBlockedDates', async () => {
    servicesSingleMock.mockResolvedValue({ data: null })

    const result = await getItemBlockedDates('service', SERVICE_ID)

    expect(result).toEqual([])
    expect(getBlockedDatesMock).not.toHaveBeenCalled()
  })
})

describe('createManualServiceBooking', () => {
  it('rejects when no tourist was selected', async () => {
    const result = await createManualServiceBooking(formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE }))
    expect(result).toEqual({ error: 'Selecciona un turista.' })
  })

  it('rejects when the selected tourist id does not resolve to a tourist profile', async () => {
    profilesSingleMock.mockResolvedValue({ data: null })
    const result = await createManualServiceBooking(
      formData({ tourist_id: TOURIST_ID, service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE }),
    )
    expect(result).toEqual({ error: 'Selecciona un turista registrado.' })
  })

  it('rejects a quantity above capacity, same rule as the tourist-facing action', async () => {
    servicesSingleMock.mockResolvedValue({ data: serviceRow({ capacity: 5 }) })
    const result = await createManualServiceBooking(
      formData({ tourist_id: TOURIST_ID, service_id: SERVICE_ID, quantity: '6', booking_date: FUTURE_DATE }),
    )
    expect(result).toEqual({ error: 'Supera el cupo máximo disponible.' })
  })

  it('computes total from base_price × quantity, calls the RPC with the admin-picked tourist_id, notifies the business, and returns success', async () => {
    servicesSingleMock.mockResolvedValue({ data: serviceRow({ base_price: 40000, business_id: 'biz-42' }) })
    createServicePrereservaRpcMock.mockResolvedValue({ data: 'booking-1', error: null })

    const result = await createManualServiceBooking(
      formData({ tourist_id: TOURIST_ID, service_id: SERVICE_ID, quantity: '3', booking_date: FUTURE_DATE, notes: 'Cerrado por WhatsApp' }),
    )

    expect(result).toEqual({ success: true })
    expect(createServicePrereservaRpcMock).toHaveBeenCalledWith({
      p_tourist_id: TOURIST_ID,
      p_service_id: SERVICE_ID,
      p_quantity: 3,
      p_booking_date: FUTURE_DATE,
      p_total_amount: 120000,
      p_notes: 'Cerrado por WhatsApp',
    })
    expect(sendBusinessBookingConfirmedEmailMock).toHaveBeenCalledWith(
      'provider@mantur.co',
      expect.objectContaining({ serviceName: 'Cabalgata', quantity: 3 }),
    )
  })

  it('maps a date_unavailable RPC exception to the shared "unavailable" copy', async () => {
    servicesSingleMock.mockResolvedValue({ data: serviceRow() })
    createServicePrereservaRpcMock.mockResolvedValue({ data: null, error: { message: 'date_unavailable' } })

    const result = await createManualServiceBooking(
      formData({ tourist_id: TOURIST_ID, service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE }),
    )

    expect(result).toEqual({ error: 'Esto no está disponible en este momento.' })
  })
})

describe('createManualGuideTourBooking', () => {
  it('rejects when no tourist was selected', async () => {
    const result = await createManualGuideTourBooking(formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE }))
    expect(result).toEqual({ error: 'Selecciona un turista.' })
  })

  it('rejects when the selected tourist id does not resolve to a tourist profile', async () => {
    profilesSingleMock.mockResolvedValue({ data: null })
    const result = await createManualGuideTourBooking(
      formData({ tourist_id: TOURIST_ID, guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE }),
    )
    expect(result).toEqual({ error: 'Selecciona un turista registrado.' })
  })

  it('computes total from price × people_count, calls the RPC with the admin-picked tourist_id, notifies the guide, and returns success', async () => {
    guideToursSingleMock.mockResolvedValue({ data: tourRow({ price: 60000, guide_id: 'guide-1' }) })
    createGuideTourPrereservaRpcMock.mockResolvedValue({ data: 'booking-2', error: null })

    const result = await createManualGuideTourBooking(
      formData({ tourist_id: TOURIST_ID, guide_tour_id: TOUR_ID, people_count: '2', booking_date: FUTURE_DATE }),
    )

    expect(result).toEqual({ success: true })
    expect(createGuideTourPrereservaRpcMock).toHaveBeenCalledWith({
      p_tourist_id: TOURIST_ID,
      p_guide_tour_id: TOUR_ID,
      p_quantity: 2,
      p_booking_date: FUTURE_DATE,
      p_total_amount: 120000,
      p_notes: null,
    })
    expect(sendGuideBookingConfirmedEmailMock).toHaveBeenCalledWith(
      'provider@mantur.co',
      expect.objectContaining({ tourName: 'Recorrido nocturno', quantity: 2 }),
    )
  })

  it('maps a capacity_exceeded RPC exception to the shared capacity copy', async () => {
    guideToursSingleMock.mockResolvedValue({ data: tourRow() })
    createGuideTourPrereservaRpcMock.mockResolvedValue({ data: null, error: { message: 'capacity_exceeded' } })

    const result = await createManualGuideTourBooking(
      formData({ tourist_id: TOURIST_ID, guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE }),
    )

    expect(result).toEqual({ error: 'Supera el cupo máximo disponible.' })
  })
})
