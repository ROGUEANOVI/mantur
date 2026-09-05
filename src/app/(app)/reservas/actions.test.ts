import { describe, it, expect, vi, beforeEach } from 'vitest'

// This file targets createBooking/createGuideTourBooking directly — the two
// places where money (total, commission) is computed server-side per
// CLAUDE.md's "money logic is server-only" rule. Supabase and Next.js
// navigation/cache are mocked; nothing here touches a real database.

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
const serviceSingle = vi.fn()
const guideTourSingle = vi.fn()
const packageSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      }
      if (table === 'services') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: serviceSingle }) }) }) }
      }
      if (table === 'guide_tours') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: guideTourSingle }) }) }) }
      }
      if (table === 'packages') {
        return { select: () => ({ eq: () => ({ single: packageSingle }) }) }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

// The admin client only ever calls .rpc() from actions.ts now — both the
// commission lookup and the atomic booking+transaction insert are RPCs.
// One shared mock routes to a per-function mock so each test can control
// them independently, exactly like two real Postgres functions would.
const commissionRpcMock = vi.fn()
const createBookingRpcMock = vi.fn()
const createPackagePrereservaRpcMock = vi.fn()
const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'get_commission_rate') return commissionRpcMock(args)
  if (fn === 'create_booking_with_transaction') return createBookingRpcMock(args)
  if (fn === 'create_package_prereserva') return createPackagePrereservaRpcMock(args)
  throw new Error(`unexpected rpc: ${fn}`)
})

// createPackagePrereserva also uses the admin client to look up every
// role='admin' profile and email them (notifyAdminsOfPackagePrereserva) —
// routed by select columns since both queries hit `profiles` with the same
// shape (see the identical technique in wompi/route.test.ts).
const adminProfilesListMock = vi.fn()
const touristProfileSingleMock = vi.fn()
const getUserByIdMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`unexpected table on admin client: ${table}`)
      return {
        select: (columns: string) => ({
          eq: () => (columns === 'id' ? adminProfilesListMock() : { single: () => touristProfileSingleMock() }),
        }),
      }
    },
    auth: { admin: { getUserById: getUserByIdMock } },
  })),
}))

const sendPackagePrereservaRequestedEmailMock = vi.fn()
vi.mock('@/lib/email/bookingEmails', () => ({
  sendPackagePrereservaRequestedEmail: (...args: unknown[]) => sendPackagePrereservaRequestedEmailMock(...args),
}))

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  bookingRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

// actions.ts's own responsibility ends at handing off to the Wompi checkout
// URL builder — its internals (signature, env vars) are covered by
// src/lib/wompi/checkout.test.ts, not here.
const buildWompiCheckoutUrlMock = vi.fn((params: { bookingId: string }) => `https://checkout.wompi.co/p/?ref=${params.bookingId}`)

vi.mock('@/lib/wompi/checkout', () => ({
  buildWompiCheckoutUrl: (...args: [{ bookingId: string; amountInCents: number; currency: string }]) =>
    buildWompiCheckoutUrlMock(...args),
}))

const { createBooking, createGuideTourBooking, createPackagePrereserva } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const SERVICE_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'
const FUTURE_DATE = '2099-01-01'

function serviceRow(overrides: Partial<{
  base_price: number
  capacity: number | null
  status: string
  business_id: string
  slug: string
  pricing_unit: 'per_person' | 'per_night' | 'fixed'
}> = {}) {
  return {
    id: SERVICE_ID,
    base_price: overrides.base_price ?? 50000,
    // 'capacity' in overrides (not ?? ) — capacity: null is a deliberate
    // "no cap" override, and ?? would treat that null as absent and fall
    // back to the default 10.
    capacity: 'capacity' in overrides ? overrides.capacity : 10,
    status: overrides.status ?? 'active',
    business_id: overrides.business_id ?? 'biz-1',
    service_types: { slug: overrides.slug ?? 'tour_activity', pricing_unit: overrides.pricing_unit ?? 'per_person' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
  checkRateLimitMock.mockResolvedValue(true)
  // Defaults for the package-prereserva admin-notification path: one admin,
  // resolvable to an email, and a resolvable tourist name.
  adminProfilesListMock.mockResolvedValue({ data: [{ id: 'admin-1' }] })
  touristProfileSingleMock.mockResolvedValue({ data: { full_name: 'Ana Pérez' } })
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'admin@mantur.co' } } })
})

describe('rate limiting (shared by both booking actions)', () => {
  it('createBooking returns a rate-limit error and never queries the service when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })

    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(checkRateLimitMock).toHaveBeenCalledWith({}, 'user-1')
    expect(serviceSingle).not.toHaveBeenCalled()
  })

  it('createGuideTourBooking returns a rate-limit error and never queries the tour when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })

    const result = await createGuideTourBooking(fd)

    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(guideTourSingle).not.toHaveBeenCalled()
  })
})

describe('getAuthenticatedTourist guard (shared by both booking actions)', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })

    await expect(createBooking(fd)).rejects.toThrow('redirect:/login')
    expect(serviceSingle).not.toHaveBeenCalled()
  })

  it('redirects to / when the authenticated user is not a tourist', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })

    await expect(createBooking(fd)).rejects.toThrow('redirect:/')
    expect(serviceSingle).not.toHaveBeenCalled()
  })
})

describe('createBooking', () => {
  it('rejects a non-UUID service id without querying the DB', async () => {
    const fd = formData({ service_id: 'not-a-uuid', quantity: '2', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'No se encontró el servicio o tour seleccionado.' })
    expect(serviceSingle).not.toHaveBeenCalled()
  })

  it('rejects when the service is missing or inactive', async () => {
    serviceSingle.mockResolvedValue({ data: null })
    const fd = formData({ service_id: SERVICE_ID, quantity: '2', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'Esto no está disponible en este momento.' })
  })

  it('rejects when the service exists but has no resolvable service_types join', async () => {
    serviceSingle.mockResolvedValue({ data: { id: SERVICE_ID, base_price: 50000, capacity: 10, status: 'active', business_id: 'biz-1', service_types: null } })
    const fd = formData({ service_id: SERVICE_ID, quantity: '2', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'Esto no está disponible en este momento.' })
  })

  it('rejects zero quantity', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    const fd = formData({ service_id: SERVICE_ID, quantity: '0', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'La cantidad debe ser al menos 1.' })
  })

  it('rejects non-numeric quantity', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    const fd = formData({ service_id: SERVICE_ID, quantity: 'abc', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'La cantidad debe ser al menos 1.' })
  })

  it('rejects quantity above capacity', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ capacity: 4 }) })
    const fd = formData({ service_id: SERVICE_ID, quantity: '5', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'Supera el cupo máximo disponible.' })
  })

  it('allows quantity when capacity is null (no cap)', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 1000, capacity: null }) })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-1', error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '500', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-1')
  })

  it('rejects a booking date in the past', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    const fd = formData({ service_id: SERVICE_ID, quantity: '2', booking_date: '2000-01-01' })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'La fecha debe ser hoy o en el futuro.' })
  })

  it('computes total/cents/commission correctly for a per_person service and redirects to the confirmation page', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 45000, pricing_unit: 'per_person' }) })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null }) // 10% commission
    createBookingRpcMock.mockResolvedValue({ data: 'booking-1', error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '3', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-1')

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_total_amount).toBe(135_000) // 45000 * 3
    expect(payload.p_quantity).toBe(3)
    expect(payload.p_amount_in_cents).toBe(13_500_000) // 135000 * 100
    expect(payload.p_commission_amount_cents).toBe(1_350_000) // 10% of 13,500,000
  })

  it('creates the booking as pending_payment/pending (payment is confirmed later by the Wompi webhook, never at creation time) and redirects to the Wompi checkout URL for that booking/amount', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 45000 }) })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-55', error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-55')

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_booking_status).toBe('pending_payment')
    expect(payload.p_transaction_status).toBe('pending')

    expect(buildWompiCheckoutUrlMock).toHaveBeenCalledWith({
      bookingId: 'booking-55',
      amountInCents: 4_500_000,
      currency: 'COP',
    })
  })

  it('computes total as base_price * quantity for a per_night service', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 80000, capacity: 5, pricing_unit: 'per_night', slug: 'lodging' }) })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-2', error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '3', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-2')

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_total_amount).toBe(240_000) // 80000 * 3 nights
    expect(payload.p_quantity).toBe(3)
  })

  it('for a fixed-price service, total equals base_price regardless of quantity, and the stored quantity is forced to 1', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 300000, capacity: 20, pricing_unit: 'fixed', slug: 'event_rental' }) })
    commissionRpcMock.mockResolvedValue({ data: 12, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-3', error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '5', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-3')

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_total_amount).toBe(300_000) // fixed — not multiplied by quantity
    expect(payload.p_quantity).toBe(1) // forced to 1 regardless of the submitted quantity
    expect(payload.p_amount_in_cents).toBe(30_000_000)
  })

  it('for a fixed-price service, the capacity check still runs against the real submitted quantity before it is forced to 1', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 300000, capacity: 2, pricing_unit: 'fixed', slug: 'event_rental' }) })

    const fd = formData({ service_id: SERVICE_ID, quantity: '5', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Supera el cupo máximo disponible.' })
    expect(createBookingRpcMock).not.toHaveBeenCalled()
  })

  it('calls get_commission_rate with the service\'s own dynamic service_types.slug, not a hardcoded string', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 45000, slug: 'lodging', pricing_unit: 'per_night' }) })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-4', error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-4')

    expect(commissionRpcMock).toHaveBeenCalledWith({ p_service_type: 'lodging' })
  })

  it('ignores a client-supplied price/total/commission override and always uses the server-fetched price', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 45000 }) })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-1', error: null })

    // An attacker tampering with the submitted form — none of these fields
    // exist in the real form, but a server action must ignore anything it
    // doesn't explicitly read, not just anything the UI happens to send.
    const fd = formData({
      service_id: SERVICE_ID,
      quantity: '1',
      booking_date: FUTURE_DATE,
      price: '1',
      total_amount: '1',
      amount_in_cents: '1',
      commission_rate: '0',
      commission_amount_cents: '0',
    })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-1')

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_total_amount).toBe(45_000) // server price, not the tampered "1"
    expect(payload.p_amount_in_cents).toBe(4_500_000)
    expect(payload.p_commission_amount_cents).toBe(450_000) // real 10%, not the tampered "0"
  })

  it('rounds a fractional commission amount to the nearest cent instead of truncating', async () => {
    // price * 100 and commission math can both land on a .5-cent boundary;
    // this combination forces Math.round to round 99.9 up to 100 — a
    // Math.floor/ceil regression here would silently under/over-charge.
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 9.99 }) })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-1', error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-1')

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_amount_in_cents).toBe(999)
    expect(payload.p_commission_amount_cents).toBe(100) // round(99.9) = 100, not 99
  })

  it('returns a generic error and never creates a booking when the commission RPC fails', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    commissionRpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(createBookingRpcMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when create_booking_with_transaction fails (the RPC itself rolls back atomically — no manual cleanup call is expected)', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    commissionRpcMock.mockResolvedValue({ data: 10, error: null })
    createBookingRpcMock.mockResolvedValue({ data: null, error: { message: 'insert failed' } })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

describe('createGuideTourBooking', () => {
  it('rejects a non-UUID guide_tour_id before querying the DB', async () => {
    const fd = formData({ guide_tour_id: 'not-a-uuid', people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)
    expect(result).toEqual({ error: 'No se encontró el servicio o tour seleccionado.' })
    expect(guideTourSingle).not.toHaveBeenCalled()
  })

  it('rejects non-numeric or zero people_count', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '0', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)
    expect(result).toEqual({ error: 'La cantidad debe ser al menos 1.' })
  })

  it('returns a generic error when the commission RPC fails', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    commissionRpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(createBookingRpcMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when create_booking_with_transaction fails', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    commissionRpcMock.mockResolvedValue({ data: 15, error: null })
    createBookingRpcMock.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('reads the commission rate for "guide_tour", not "experience", and inserts the booking with quantity (not people_count)', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    commissionRpcMock.mockResolvedValue({ data: 15, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-7', error: null })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '2', booking_date: FUTURE_DATE, notes: 'Punto de encuentro: parque' })
    await expect(createGuideTourBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-7')

    expect(commissionRpcMock).toHaveBeenCalledWith({ p_service_type: 'guide_tour' })

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_notes).toBe('Punto de encuentro: parque')
    expect(payload.p_guide_id).toBe('guide-1')
    expect(payload.p_total_amount).toBe(40_000) // 20000 * 2
    // The bookings table column is `quantity` (renamed from people_count) —
    // this function's own formData field name is still people_count, but
    // the RPC parameter must be p_quantity.
    expect(payload.p_quantity).toBe(2)
    expect(payload).not.toHaveProperty('p_people_count')

    expect(payload.p_amount_in_cents).toBe(4_000_000)
    expect(payload.p_commission_amount_cents).toBe(600_000) // 15% of 4,000,000
  })

  it('creates a guide tour booking as pending_payment/pending and redirects to the Wompi checkout URL', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    commissionRpcMock.mockResolvedValue({ data: 15, error: null })
    createBookingRpcMock.mockResolvedValue({ data: 'booking-66', error: null })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    await expect(createGuideTourBooking(fd)).rejects.toThrow('redirect:https://checkout.wompi.co/p/?ref=booking-66')

    const payload = createBookingRpcMock.mock.calls[0][0]
    expect(payload.p_booking_status).toBe('pending_payment')
    expect(payload.p_transaction_status).toBe('pending')

    expect(buildWompiCheckoutUrlMock).toHaveBeenCalledWith({
      bookingId: 'booking-66',
      amountInCents: 2_000_000,
      currency: 'COP',
    })
  })

  it('rejects when the tour is missing or inactive', async () => {
    guideTourSingle.mockResolvedValue({ data: null })
    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)
    expect(result).toEqual({ error: 'Esto no está disponible en este momento.' })
  })

  it('rejects people_count above the tour capacity', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 4, status: 'active', guide_id: 'guide-1' } })
    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '5', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)
    expect(result).toEqual({ error: 'Supera el cupo máximo disponible.' })
  })

  it('rejects a booking date in the past', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: '2000-01-01' })
    const result = await createGuideTourBooking(fd)
    expect(result).toEqual({ error: 'La fecha debe ser hoy o en el futuro.' })
  })
})

const PACKAGE_ID = '33333333-3333-3333-3333-333333333333'

function packageRow(overrides: Partial<{
  name: string
  base_price: number
  capacity: number | null
  pricing_unit: 'per_person' | 'per_night' | 'fixed'
}> = {}) {
  return {
    id: PACKAGE_ID,
    name: overrides.name ?? 'Ruta Serranía del Perijá',
    base_price: overrides.base_price ?? 100000,
    capacity: 'capacity' in overrides ? overrides.capacity : 10,
    pricing_unit: overrides.pricing_unit ?? 'per_person',
  }
}

describe('createPackagePrereserva', () => {
  it('rejects a rate-limited request without querying the package', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createPackagePrereserva(fd)
    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(packageSingle).not.toHaveBeenCalled()
  })

  it('rejects a non-UUID package id without querying the DB', async () => {
    const fd = formData({ package_id: 'not-a-uuid', quantity: '1', booking_date: FUTURE_DATE })
    const result = await createPackagePrereserva(fd)
    expect(result).toEqual({ error: 'No se encontró el paquete seleccionado.' })
    expect(packageSingle).not.toHaveBeenCalled()
  })

  it('rejects when the package is missing or inactive (RLS-filtered)', async () => {
    packageSingle.mockResolvedValue({ data: null })
    const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createPackagePrereserva(fd)
    expect(result).toEqual({ error: 'No se encontró el paquete seleccionado.' })
  })

  it('rejects zero/non-numeric quantity', async () => {
    packageSingle.mockResolvedValue({ data: packageRow() })
    const fd = formData({ package_id: PACKAGE_ID, quantity: '0', booking_date: FUTURE_DATE })
    const result = await createPackagePrereserva(fd)
    expect(result).toEqual({ error: 'La cantidad debe ser al menos 1.' })
  })

  it('rejects quantity above capacity', async () => {
    packageSingle.mockResolvedValue({ data: packageRow({ capacity: 4 }) })
    const fd = formData({ package_id: PACKAGE_ID, quantity: '5', booking_date: FUTURE_DATE })
    const result = await createPackagePrereserva(fd)
    expect(result).toEqual({ error: 'Supera el cupo máximo disponible.' })
  })

  it('allows any quantity when capacity is null (no cap)', async () => {
    packageSingle.mockResolvedValue({ data: packageRow({ capacity: null }) })
    createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-1', error: null })
    const fd = formData({ package_id: PACKAGE_ID, quantity: '500', booking_date: FUTURE_DATE })
    await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')
  })

  it('rejects a booking date in the past', async () => {
    packageSingle.mockResolvedValue({ data: packageRow() })
    const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: '2000-01-01' })
    const result = await createPackagePrereserva(fd)
    expect(result).toEqual({ error: 'La fecha debe ser hoy o en el futuro.' })
  })

  it('computes total for a per_person package and redirects straight to the confirmation page — no Wompi checkout', async () => {
    packageSingle.mockResolvedValue({ data: packageRow({ base_price: 50000, pricing_unit: 'per_person' }) })
    createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-9', error: null })

    const fd = formData({ package_id: PACKAGE_ID, quantity: '3', booking_date: FUTURE_DATE, notes: 'Llegamos tarde' })
    await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-9/confirmacion')

    expect(buildWompiCheckoutUrlMock).not.toHaveBeenCalled()
    const payload = createPackagePrereservaRpcMock.mock.calls[0][0]
    expect(payload.p_total_amount).toBe(150_000) // 50000 * 3
    expect(payload.p_quantity).toBe(3)
    expect(payload.p_notes).toBe('Llegamos tarde')
    expect(payload.p_package_id).toBe(PACKAGE_ID)
  })

  it('for a fixed-price package, total equals base_price and stored quantity is forced to 1', async () => {
    packageSingle.mockResolvedValue({ data: packageRow({ base_price: 300000, capacity: 20, pricing_unit: 'fixed' }) })
    createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-10', error: null })

    const fd = formData({ package_id: PACKAGE_ID, quantity: '5', booking_date: FUTURE_DATE })
    await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-10/confirmacion')

    const payload = createPackagePrereservaRpcMock.mock.calls[0][0]
    expect(payload.p_total_amount).toBe(300_000)
    expect(payload.p_quantity).toBe(1)
  })

  it('never calls get_commission_rate or create_booking_with_transaction — packages use their own RPC with no commission', async () => {
    packageSingle.mockResolvedValue({ data: packageRow() })
    createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-11', error: null })

    const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
    await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-11/confirmacion')

    expect(commissionRpcMock).not.toHaveBeenCalled()
    expect(createBookingRpcMock).not.toHaveBeenCalled()
  })

  it('defaults notes to null when omitted', async () => {
    packageSingle.mockResolvedValue({ data: packageRow() })
    createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-12', error: null })

    const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
    await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-12/confirmacion')

    const payload = createPackagePrereservaRpcMock.mock.calls[0][0]
    expect(payload.p_notes).toBeNull()
  })

  it('returns a generic error and never redirects when the RPC fails', async () => {
    packageSingle.mockResolvedValue({ data: packageRow() })
    createPackagePrereservaRpcMock.mockResolvedValue({ data: null, error: { message: 'insert failed' } })

    const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createPackagePrereserva(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('ignores a client-supplied price/total override and always uses the server-fetched package price', async () => {
    packageSingle.mockResolvedValue({ data: packageRow({ base_price: 45000 }) })
    createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-13', error: null })

    const fd = formData({
      package_id: PACKAGE_ID,
      quantity: '1',
      booking_date: FUTURE_DATE,
      total_amount: '1',
    })
    await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-13/confirmacion')

    const payload = createPackagePrereservaRpcMock.mock.calls[0][0]
    expect(payload.p_total_amount).toBe(45_000)
  })

  describe('admin notification on a new request', () => {
    it('emails every admin with the package, tourist name, date, and quantity', async () => {
      packageSingle.mockResolvedValue({ data: packageRow({ name: 'Ruta Serranía del Perijá' }) })
      createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-20', error: null })
      adminProfilesListMock.mockResolvedValue({ data: [{ id: 'admin-1' }, { id: 'admin-2' }] })
      getUserByIdMock.mockImplementation((id: string) =>
        Promise.resolve({ data: { user: { email: id === 'admin-1' ? 'admin1@mantur.co' : 'admin2@mantur.co' } } }),
      )

      const fd = formData({ package_id: PACKAGE_ID, quantity: '2', booking_date: FUTURE_DATE, notes: 'Somos 2 adultos' })
      await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-20/confirmacion')

      expect(sendPackagePrereservaRequestedEmailMock).toHaveBeenCalledWith('admin1@mantur.co', {
        packageName: 'Ruta Serranía del Perijá',
        touristName: 'Ana Pérez',
        bookingDate: FUTURE_DATE,
        quantity: 2,
        notes: 'Somos 2 adultos',
      })
      expect(sendPackagePrereservaRequestedEmailMock).toHaveBeenCalledWith('admin2@mantur.co', expect.anything())
    })

    it('never emails when there are no admin profiles', async () => {
      packageSingle.mockResolvedValue({ data: packageRow() })
      createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-21', error: null })
      adminProfilesListMock.mockResolvedValue({ data: [] })

      const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
      await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-21/confirmacion')

      expect(getUserByIdMock).not.toHaveBeenCalled()
      expect(sendPackagePrereservaRequestedEmailMock).not.toHaveBeenCalled()
    })

    it('skips an admin with no resolvable email but still emails the rest', async () => {
      packageSingle.mockResolvedValue({ data: packageRow() })
      createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-22', error: null })
      adminProfilesListMock.mockResolvedValue({ data: [{ id: 'admin-1' }, { id: 'admin-2' }] })
      getUserByIdMock.mockImplementation((id: string) =>
        Promise.resolve({ data: { user: id === 'admin-1' ? null : { email: 'admin2@mantur.co' } } }),
      )

      const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
      await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-22/confirmacion')

      expect(sendPackagePrereservaRequestedEmailMock).toHaveBeenCalledTimes(1)
      expect(sendPackagePrereservaRequestedEmailMock).toHaveBeenCalledWith('admin2@mantur.co', expect.anything())
    })

    it('still redirects when notifying admins throws unexpectedly', async () => {
      packageSingle.mockResolvedValue({ data: packageRow() })
      createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-23', error: null })
      adminProfilesListMock.mockRejectedValue(new Error('db down'))

      const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
      await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-23/confirmacion')
    })

    it('logs and never emails when the admin profiles lookup itself returns a Supabase error', async () => {
      packageSingle.mockResolvedValue({ data: packageRow() })
      createPackagePrereservaRpcMock.mockResolvedValue({ data: 'booking-24', error: null })
      adminProfilesListMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const fd = formData({ package_id: PACKAGE_ID, quantity: '1', booking_date: FUTURE_DATE })
      await expect(createPackagePrereserva(fd)).rejects.toThrow('redirect:/reservas/booking-24/confirmacion')

      expect(sendPackagePrereservaRequestedEmailMock).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to look up admin profiles for package prereserva notification',
        { message: 'connection reset' },
      )
      consoleErrorSpy.mockRestore()
    })
  })
})
