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
const experienceSingle = vi.fn()
const guideTourSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      }
      if (table === 'experiences') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: experienceSingle }) }) }) }
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
const bookingInsertMock = vi.fn(() => ({ select: () => ({ single: bookingInsertSingle }) }))
const txInsertMock = vi.fn()
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

const { createBooking, createGuideTourBooking } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const EXP_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'
const FUTURE_DATE = '2099-01-01'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
})

describe('getAuthenticatedTourist guard (shared by both booking actions)', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ experience_id: EXP_ID, people_count: '1', booking_date: FUTURE_DATE })

    await expect(createBooking(fd)).rejects.toThrow('redirect:/login')
    expect(experienceSingle).not.toHaveBeenCalled()
  })

  it('redirects to / when the authenticated user is not a tourist', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    const fd = formData({ experience_id: EXP_ID, people_count: '1', booking_date: FUTURE_DATE })

    await expect(createBooking(fd)).rejects.toThrow('redirect:/')
    expect(experienceSingle).not.toHaveBeenCalled()
  })
})

describe('createBooking', () => {
  it('rejects a non-UUID experience id without querying the DB', async () => {
    const fd = formData({ experience_id: 'not-a-uuid', people_count: '2', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(experienceSingle).not.toHaveBeenCalled()
  })

  it('rejects when the experience is missing or inactive', async () => {
    experienceSingle.mockResolvedValue({ data: null })
    const fd = formData({ experience_id: EXP_ID, people_count: '2', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'Esta experiencia no está disponible en este momento.' })
  })

  it('rejects zero people_count', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 50000, capacity: 10, status: 'active', business_id: 'biz-1' } })
    const fd = formData({ experience_id: EXP_ID, people_count: '0', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'El número de personas debe ser al menos 1.' })
  })

  it('rejects non-numeric people_count', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 50000, capacity: 10, status: 'active', business_id: 'biz-1' } })
    const fd = formData({ experience_id: EXP_ID, people_count: 'abc', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'El número de personas debe ser al menos 1.' })
  })

  it('rejects people_count above capacity', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 50000, capacity: 4, status: 'active', business_id: 'biz-1' } })
    const fd = formData({ experience_id: EXP_ID, people_count: '5', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'Supera el cupo máximo de esta experiencia.' })
  })

  it('allows people_count when capacity is null (no cap)', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 1000, capacity: null, status: 'active', business_id: 'biz-1' } })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ experience_id: EXP_ID, people_count: '500', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')
  })

  it('rejects a booking date in the past', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 50000, capacity: 10, status: 'active', business_id: 'biz-1' } })
    const fd = formData({ experience_id: EXP_ID, people_count: '2', booking_date: '2000-01-01' })
    const result = await createBooking(fd)
    expect(result).toEqual({ error: 'La fecha debe ser hoy o en el futuro.' })
  })

  it('computes total/cents/commission correctly and redirects to the confirmation page', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 45000, capacity: 10, status: 'active', business_id: 'biz-1' } })
    rpcMock.mockResolvedValue({ data: 10, error: null }) // 10% commission
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ experience_id: EXP_ID, people_count: '3', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')

    expect(rpcMock).toHaveBeenCalledWith('get_commission_rate', { p_service_type: 'experience' })

    const bookingPayload = bookingInsertMock.mock.calls[0][0]
    expect(bookingPayload.total_amount).toBe(135_000) // 45000 * 3

    const txPayload = txInsertMock.mock.calls[0][0]
    expect(txPayload.amount_in_cents).toBe(13_500_000) // 135000 * 100
    expect(txPayload.commission_amount_cents).toBe(1_350_000) // 10% of 13,500,000
  })

  it('ignores a client-supplied price/total/commission override and always uses the server-fetched price', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 45000, capacity: 10, status: 'active', business_id: 'biz-1' } })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    // An attacker tampering with the submitted form — none of these fields
    // exist in the real form, but a server action must ignore anything it
    // doesn't explicitly read, not just anything the UI happens to send.
    const fd = formData({
      experience_id: EXP_ID,
      people_count: '1',
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
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 9.99, capacity: 10, status: 'active', business_id: 'biz-1' } })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-1' }, error: null })
    txInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ experience_id: EXP_ID, people_count: '1', booking_date: FUTURE_DATE })
    await expect(createBooking(fd)).rejects.toThrow('redirect:/reservas/booking-1/confirmacion')

    const txPayload = txInsertMock.mock.calls[0][0]
    expect(txPayload.amount_in_cents).toBe(999)
    expect(txPayload.commission_amount_cents).toBe(100) // round(99.9) = 100, not 99
  })

  it('returns a generic error and never creates a booking when the commission RPC fails', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 50000, capacity: 10, status: 'active', business_id: 'biz-1' } })
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })

    const fd = formData({ experience_id: EXP_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(bookingInsertMock).not.toHaveBeenCalled()
  })

  it('rolls back (deletes) the booking when the transaction insert fails', async () => {
    experienceSingle.mockResolvedValue({ data: { id: EXP_ID, price: 50000, capacity: 10, status: 'active', business_id: 'biz-1' } })
    rpcMock.mockResolvedValue({ data: 10, error: null })
    bookingInsertSingle.mockResolvedValue({ data: { id: 'booking-99' }, error: null })
    txInsertMock.mockResolvedValue({ error: { message: 'insert failed' } })

    const fd = formData({ experience_id: EXP_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createBooking(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(bookingDeleteEq).toHaveBeenCalledWith('id', 'booking-99')
  })
})

describe('createGuideTourBooking', () => {
  it('reads the commission rate for "guide_tour", not "experience"', async () => {
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

    const txPayload = txInsertMock.mock.calls[0][0]
    expect(txPayload.amount_in_cents).toBe(4_000_000)
    expect(txPayload.commission_amount_cents).toBe(600_000) // 15% of 4,000,000
  })

  it('rejects when the tour is missing or inactive', async () => {
    guideTourSingle.mockResolvedValue({ data: null })
    const fd = formData({ guide_tour_id: TOUR_ID, people_count: '1', booking_date: FUTURE_DATE })
    const result = await createGuideTourBooking(fd)
    expect(result).toEqual({ error: 'Esta experiencia no está disponible en este momento.' })
  })
})
