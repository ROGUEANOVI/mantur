import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const bookingSingleMock = vi.fn()
const bookingUpdateSelectMock = vi.fn()
const upsertMock = vi.fn()
const getUserByIdMock = vi.fn()
const confirmRpcMock = vi.fn()
const markPaidRpcMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({ eq: () => ({ single: bookingSingleMock }) }),
          update: (payload: unknown) => ({
            eq: (_col1: string, id: string) => ({
              eq: (_col2: string, status: string) => ({
                select: () => bookingUpdateSelectMock(payload, id, status),
              }),
            }),
          }),
        }
      }
      if (table === 'provider_availability') {
        return { upsert: (payload: unknown, opts: unknown) => upsertMock(payload, opts) }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'confirm_package_prereserva') return confirmRpcMock(args)
      if (fn === 'mark_package_booking_paid') return markPaidRpcMock(args)
      throw new Error(`unexpected rpc: ${fn}`)
    },
    auth: { admin: { getUserById: (id: string) => getUserByIdMock(id) } },
  })),
}))

const sendConfirmedMock = vi.fn()
const sendCancelledMock = vi.fn()
const sendPaidMock = vi.fn()

vi.mock('@/lib/email/bookingEmails', () => ({
  sendPackagePrereservaConfirmedEmail: (...args: unknown[]) => sendConfirmedMock(...args),
  sendPackagePrereservaCancelledEmail: (...args: unknown[]) => sendCancelledMock(...args),
  sendPackageBookingPaidEmail: (...args: unknown[]) => sendPaidMock(...args),
}))

const {
  setProviderAvailability,
  confirmPackagePrereserva,
  cancelPackagePrereserva,
  markPackageBookingPaid,
} = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const BOOKING_ID = '11111111-1111-1111-1111-111111111111'
const PROVIDER_ID = '22222222-2222-2222-2222-222222222222'
const TOURIST_ID = '33333333-3333-3333-3333-333333333333'
const ADMIN_ID = 'admin-1'

const BOOKING_ROW = {
  id: BOOKING_ID,
  package_id: 'pkg-1',
  tourist_id: TOURIST_ID,
  booking_date: '2026-09-10',
  packages: { name: 'Ruta Serranía del Perijá' },
  profiles: { full_name: 'Ana Pérez' },
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  bookingSingleMock.mockResolvedValue({ data: BOOKING_ROW })
  getUserByIdMock.mockResolvedValue({ data: { user: { email: 'turista@example.com' } } })
})

describe('getAuthenticatedAdmin guard (shared by every action in this file)', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ bookingId: BOOKING_ID })
    await expect(confirmPackagePrereserva(fd)).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ bookingId: BOOKING_ID })
    await expect(confirmPackagePrereserva(fd)).rejects.toThrow('redirect:/')
  })
})

describe('setProviderAvailability', () => {
  const baseFields = {
    bookingId: BOOKING_ID,
    providerType: 'business',
    providerId: PROVIDER_ID,
    date: '2026-09-10',
    status: 'unavailable',
  }

  it('rejects a non-UUID bookingId or providerId', async () => {
    const result = await setProviderAvailability(formData({ ...baseFields, bookingId: 'nope' }))
    expect(result).toEqual({ error: 'Reserva no encontrada.' })
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid providerType', async () => {
    const result = await setProviderAvailability(formData({ ...baseFields, providerType: 'other' }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('rejects an invalid status', async () => {
    const result = await setProviderAvailability(formData({ ...baseFields, status: 'maybe' }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('rejects a malformed date', async () => {
    const result = await setProviderAvailability(formData({ ...baseFields, date: 'not-a-date' }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('upserts with source admin_manual and the admin as resolved_by, then revalidates', async () => {
    upsertMock.mockResolvedValue({ error: null })
    const result = await setProviderAvailability(formData(baseFields))
    expect(result).toBeUndefined()
    expect(upsertMock).toHaveBeenCalledWith(
      {
        provider_type: 'business',
        provider_id: PROVIDER_ID,
        date: '2026-09-10',
        status: 'unavailable',
        source: 'admin_manual',
        notes: null,
        resolved_by: ADMIN_ID,
      },
      { onConflict: 'provider_type,provider_id,date' },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/paquetes/solicitudes')
  })

  it('maps an upsert error to the generic copy', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'db error' } })
    const result = await setProviderAvailability(formData(baseFields))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('confirmPackagePrereserva', () => {
  it('rejects a non-UUID bookingId', async () => {
    const result = await confirmPackagePrereserva(formData({ bookingId: 'nope' }))
    expect(result).toEqual({ error: 'Reserva no encontrada.' })
  })

  it('rejects when the booking does not exist or has no package_id', async () => {
    bookingSingleMock.mockResolvedValue({ data: null })
    const result = await confirmPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Reserva no encontrada.' })
    expect(confirmRpcMock).not.toHaveBeenCalled()
  })

  it('maps the provider_unavailable RPC error to friendly copy and sends no email', async () => {
    confirmRpcMock.mockResolvedValue({ data: null, error: { message: 'provider_unavailable' } })
    const result = await confirmPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Aún hay proveedores marcados como no disponibles para esta fecha.' })
    expect(sendConfirmedMock).not.toHaveBeenCalled()
  })

  it('maps the invalid_booking_state RPC error to friendly copy', async () => {
    confirmRpcMock.mockResolvedValue({ data: null, error: { message: 'invalid_booking_state' } })
    const result = await confirmPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Esta reserva ya no está en el estado esperado. Actualiza la página.' })
  })

  it('maps any other RPC error to the generic copy', async () => {
    confirmRpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await confirmPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('on success, sends the confirmed email to the tourist and revalidates', async () => {
    confirmRpcMock.mockResolvedValue({ data: 'tx-1', error: null })
    const result = await confirmPackagePrereserva(formData({ bookingId: BOOKING_ID }))

    expect(result).toBeUndefined()
    expect(confirmRpcMock).toHaveBeenCalledWith({ p_booking_id: BOOKING_ID })
    expect(getUserByIdMock).toHaveBeenCalledWith(TOURIST_ID)
    expect(sendConfirmedMock).toHaveBeenCalledWith('turista@example.com', {
      packageName: 'Ruta Serranía del Perijá',
      touristName: 'Ana Pérez',
      bookingDate: '2026-09-10',
      bookingId: BOOKING_ID,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/paquetes/solicitudes')
  })

  it('skips sending an email when the tourist has no resolvable email, but still succeeds', async () => {
    confirmRpcMock.mockResolvedValue({ data: 'tx-1', error: null })
    getUserByIdMock.mockResolvedValue({ data: { user: null } })
    const result = await confirmPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toBeUndefined()
    expect(sendConfirmedMock).not.toHaveBeenCalled()
  })
})

describe('cancelPackagePrereserva', () => {
  it('rejects a non-UUID bookingId', async () => {
    const result = await cancelPackagePrereserva(formData({ bookingId: 'nope' }))
    expect(result).toEqual({ error: 'Reserva no encontrada.' })
    expect(bookingUpdateSelectMock).not.toHaveBeenCalled()
  })

  it('rejects when the booking does not exist or has no package_id', async () => {
    bookingSingleMock.mockResolvedValue({ data: null })
    const result = await cancelPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Reserva no encontrada.' })
  })

  it('only updates a booking still in pending_availability, and reports invalid state when none matched', async () => {
    bookingUpdateSelectMock.mockResolvedValue({ data: [], error: null })
    const result = await cancelPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Esta reserva ya no está en el estado esperado. Actualiza la página.' })
    expect(bookingUpdateSelectMock).toHaveBeenCalledWith({ status: 'cancelled' }, BOOKING_ID, 'pending_availability')
    expect(sendCancelledMock).not.toHaveBeenCalled()
  })

  it('on success, sends the cancelled email to the tourist and revalidates', async () => {
    bookingUpdateSelectMock.mockResolvedValue({ data: [{ id: BOOKING_ID }], error: null })
    const result = await cancelPackagePrereserva(formData({ bookingId: BOOKING_ID }))

    expect(result).toBeUndefined()
    expect(sendCancelledMock).toHaveBeenCalledWith('turista@example.com', {
      packageName: 'Ruta Serranía del Perijá',
      touristName: 'Ana Pérez',
      bookingDate: '2026-09-10',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/paquetes/solicitudes')
  })

  it('maps an update error to the generic copy', async () => {
    bookingUpdateSelectMock.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const result = await cancelPackagePrereserva(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('markPackageBookingPaid', () => {
  it('rejects a non-UUID bookingId', async () => {
    const result = await markPackageBookingPaid(formData({ bookingId: 'nope' }))
    expect(result).toEqual({ error: 'Reserva no encontrada.' })
  })

  it('rejects when the booking does not exist or has no package_id', async () => {
    bookingSingleMock.mockResolvedValue({ data: null })
    const result = await markPackageBookingPaid(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Reserva no encontrada.' })
    expect(markPaidRpcMock).not.toHaveBeenCalled()
  })

  it('maps the invalid_booking_state RPC error to friendly copy', async () => {
    markPaidRpcMock.mockResolvedValue({ error: { message: 'invalid_booking_state' } })
    const result = await markPackageBookingPaid(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Esta reserva ya no está en el estado esperado. Actualiza la página.' })
    expect(sendPaidMock).not.toHaveBeenCalled()
  })

  it('maps any other RPC error to the generic copy', async () => {
    markPaidRpcMock.mockResolvedValue({ error: { message: 'boom' } })
    const result = await markPackageBookingPaid(formData({ bookingId: BOOKING_ID }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('on success, sends the paid email to the tourist and revalidates', async () => {
    markPaidRpcMock.mockResolvedValue({ error: null })
    const result = await markPackageBookingPaid(formData({ bookingId: BOOKING_ID }))

    expect(result).toBeUndefined()
    expect(markPaidRpcMock).toHaveBeenCalledWith({ p_booking_id: BOOKING_ID })
    expect(sendPaidMock).toHaveBeenCalledWith('turista@example.com', {
      packageName: 'Ruta Serranía del Perijá',
      touristName: 'Ana Pérez',
      bookingDate: '2026-09-10',
      bookingId: BOOKING_ID,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/paquetes/solicitudes')
  })
})
