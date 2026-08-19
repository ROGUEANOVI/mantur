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
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const rpcMock = vi.fn()
const bookingInsertSingle = vi.fn()
// Typed with an explicit payload param (rather than left inferred as a
// zero-arg function) so `bookingInsertMock.mock.calls[0][0]` type-checks as
// Record<string, unknown> instead of `undefined` — this was flagged as a
// pre-existing TS gap in this file, unrelated to the experiences->services
// rename, and is fixed here only because it blocks `tsc --noEmit`.
const bookingInsertMock = vi.fn((_payload: Record<string, unknown>) => ({
  select: () => ({ single: bookingInsertSingle }),
}))
const txInsertMock = vi.fn((_payload: Record<string, unknown>) => undefined as unknown)
const bookingDeleteEq = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          insert: bookingInsertMock,
          delete: () => ({ eq: bookingDeleteEq }),
        }
      }
      if (table === 'transactions') {
        return { insert: txInsertMock }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  bookingRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

const { createBooking, createGuideTourBooking } = await import('./actions')

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
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '500', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')
  })

  it('rejects a booking date in the past', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    const fd = formData({ service_id: SERVICE_ID, quantity: '2', booking_date: '2000-01-01' })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'La fecha debe ser hoy o en el futuro.' })
  })

  it('computes total/cents/commission correctly for a per_person service and redirects to the confirmation page', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 45000, pricing_unit: 'per_person' }) })
    rpcMock.mockResolvedValue({ data: 10, error: null }) // 10% commission
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '3', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')

    const bookingPayload = bookingInsertMock.mock.calls[0][0]
    expect(bookingPayload.total_amount).toBe(135_000) // 45000 * 3
    expect(bookingPayload.quantity).toBe(3)

    const txPayload = txInsertMock.mock.calls[0][0]
    expect(txPayload.amount_in_cents).toBe(13_500_000) // 135000 * 100
    expect(txPayload.commission_amount_cents).toBe(1_350_000) // 10% of 13,500,000
  })

  it('computes total as base_price * quantity for a per_night service', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 80000, capacity: 5, pricing_unit: 'per_night', slug: 'lodging' }) })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-2' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '3', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-2/confirmacion')

    const bookingPayload = bookingInsertMock.mock.calls[0][0]
    expect(bookingPayload.total_amount).toBe(240_000) // 80000 * 3 nights
    expect(bookingPayload.quantity).toBe(3)
  })

  it('for a fixed-price service, total equals base_price regardless of quantity, and the stored quantity is forced to 1', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 300000, capacity: 20, pricing_unit: 'fixed', slug: 'event_rental' }) })
    rpcMock.mockResolvedValue({ data: 12, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-3' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '5', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-3/confirmacion')

    const bookingPayload = bookingInsertMock.mock.calls[0][0]
    expect(bookingPayload.total_amount).toBe(300_000) // fixed — not multiplied by quantity
    expect(bookingPayload.quantity).toBe(1) // forced to 1 regardless of the submitted quantity

    const txPayload = txInsertMock.mock.calls[0][0]
    expect(txPayload.amount_in_cents).toBe(30_000_000)
  })

  it('for a fixed-price service, the capacity check still runs against the real submitted quantity before it is forced to 1', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 300000, capacity: 2, pricing_unit: 'fixed', slug: 'event_rental' }) })

    const fd = formData({ service_id: SERVICE_ID, quantity: '5', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Supera el cupo máximo disponible.' })
    expect(bookingInsertMock).not.toHaveBeenCalled()
  })

  it('calls get_commission_rate with the service\'s own dynamic service_types.slug, not a hardcoded string', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 45000, slug: 'lodging', pricing_unit: 'per_night' }) })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-4' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-4/confirmacion')

    expect(rpcMock).toHaveBeenCalledWith('get_commission_rate', { p_service_type: 'lodging' })
  })

  it('ignores a client-supplied price/total/commission override and always uses the server-fetched price', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 45000 }) })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

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
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')

    const bookingPayload = bookingInsertMock.mock.calls[0][0]
    const txPayload = txInsertMock.mock.calls[0][0]
    expect(bookingPayload.total_amount).toBe(45_000) // server price, not the tampered "1"
    expect(txPayload.amount_in_cents).toBe(4_500_000)
    expect(txPayload.commission_amount_cents).toBe(450_000) // real 10%, not the tampered "0"
  })

  it('rounds a fractional commission amount to the nearest cent instead of truncating', async () => {
    // price * 100 and commission math can both land on a .5-cent boundary;
    // this combination forces Math.round to round 99.9 up to 100 — a
    // Math.floor/ceil regression here would silently under/over-charge.
    serviceSingle.mockResolvedValue({ data: serviceRow({ base_price: 9.99 }) })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')

    const txPayload = txInsertMock.mock.calls[0][0]
    expect(txPayload.amount_in_cents).toBe(999)
    expect(txPayload.commission_amount_cents).toBe(100) // round(99.9) = 100, not 99
  })

  it('returns a generic error and never creates a booking when the commission RPC fails', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(bookingInsertMock).not.toHaveBeenCalled()
  })

  it('rolls back (deletes) the booking when the transaction insert fails', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-99' }, error: null })
    txInsertMock.mockResolvedValue({ error: { message: 'insert failed' } })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(bookingDeleteEq).toHaveBeenCalledWith('id', 'booking-99')
  })

  it('returns a generic error when the booking insert itself fails', async () => {
    serviceSingle.mockResolvedValue({ data: serviceRow() })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const fd = formData({ service_id: SERVICE_ID, quantity: '1', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(txInsertMock).not.toHaveBeenCalled()
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
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(bookingInsertMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the booking insert itself fails', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    rpcMock.mockResolvedValue({ data: 15, error: null })
    bookingInsertSingle.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(txInsertMock).not.toHaveBeenCalled()
  })

  it('reads the commission rate for "guide_tour", not "experience", and inserts the booking with quantity (not people_count)', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    rpcMock.mockResolvedValue({ data: 15, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-7' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '2', booking_date: FUTURE_DATE, notes: 'Punto de encuentro: parque' })
    await expect(createGuideTourBooking(fd)).rejects.toThrow('redirect:/reservas/booking-7/confirmacion')

    expect(rpcMock).toHaveBeenCalledWith('get_commission_rate', { p_service_type: 'guide_tour' })

    const bookingPayload = bookingInsertMock.mock.calls[0][0]
    expect(bookingPayload.notes).toBe('Punto de encuentro: parque')
    expect(bookingPayload.guide_id).toBe('guide-1')
    expect(bookingPayload.total_amount).toBe(40_000) // 20000 * 2
    // The bookings table column is `quantity` (renamed from people_count) —
    // this function's own formData field name is still people_count, but
    // the inserted DB column key must be `quantity`.
    expect(bookingPayload.quantity).toBe(2)
    expect(bookingPayload).not.toHaveProperty('people_count')

    const txPayload = txInsertMock.mock.calls[0][0]
    expect(txPayload.amount_in_cents).toBe(4_000_000)
    expect(txPayload.commission_amount_cents).toBe(600_000) // 15% of 4,000,000
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

  it('rolls back (deletes) the booking when the transaction insert fails', async () => {
    guideTourSingle.mockResolvedValue({ data: { id: TOUR_ID, price: 20000, capacity: 5, status: 'active', guide_id: 'guide-1' } })
    rpcMock.mockResolvedValue({ data: 15, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-8' }, error: null })
    txInsertMock.mockResolvedValue({ error: { message: 'insert failed' } })

    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(bookingDeleteEq).toHaveBeenCalledWith('id', 'booking-8')
  })
})
