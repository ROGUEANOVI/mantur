import { describe, it, expect, vi, beforeEach } from 'vitest'

// The slug auto-generation (accent stripping, character filtering, reserved
// words) and pricing_unit validation are the pieces of real logic in this
// file worth pinning down precisely.

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

const maxSortOrderSingle = vi.fn()
const serviceTypeInsertMock = vi.fn()
const toggleUpdateMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table !== 'service_types') throw new Error(`unexpected table on admin client: ${table}`)
      return {
        select: () => ({ order: () => ({ limit: () => ({ single: maxSortOrderSingle }) }) }),
        insert: (payload: unknown) => serviceTypeInsertMock(payload),
        update: (payload: unknown) => ({ eq: (col: string, val: string) => toggleUpdateMock(payload, col, val) }),
      }
    },
  })),
}))

const { createServiceType, toggleServiceTypeActive } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  maxSortOrderSingle.mockResolvedValue({ data: { sort_order: 3 } })
})

describe('getAuthenticatedAdmin guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ name: 'Pasadía', pricing_unit: 'per_person' })
    await expect(createServiceType(fd)).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    const fd = formData({ name: 'Pasadía', pricing_unit: 'per_person' })
    await expect(createServiceType(fd)).rejects.toThrow('redirect:/')
  })

  it('redirects to / when a non-admin calls toggleServiceTypeActive', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ id: 'st-1', is_active: 'true' })
    await expect(toggleServiceTypeActive(fd)).rejects.toThrow('redirect:/')
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })
})

describe('createServiceType — validation', () => {
  it('rejects a missing name', async () => {
    const fd = formData({ name: '  ', pricing_unit: 'per_person' })
    const result = await createServiceType(fd)
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(serviceTypeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a missing pricing_unit', async () => {
    const fd = formData({ name: 'Pasadía' })
    const result = await createServiceType(fd)
    expect(result).toEqual({ error: 'La unidad de precio es obligatoria.' })
    expect(serviceTypeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized pricing_unit', async () => {
    const fd = formData({ name: 'Pasadía', pricing_unit: 'per_week' })
    const result = await createServiceType(fd)
    expect(result).toEqual({ error: 'La unidad de precio es obligatoria.' })
    expect(serviceTypeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a name that slugifies to a reserved word', async () => {
    const fd = formData({ name: '__proto__', pricing_unit: 'per_person' })
    const result = await createServiceType(fd)
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(serviceTypeInsertMock).not.toHaveBeenCalled()
  })

  it('generates a lowercase, underscore-separated slug and strips accents', async () => {
    serviceTypeInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Excursión guiada', pricing_unit: 'per_person' })
    await createServiceType(fd)
    expect(serviceTypeInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'excursion_guiada', pricing_unit: 'per_person' }),
    )
  })
})

describe('createServiceType — sort order and errors', () => {
  it('places the new type after the current max sort_order', async () => {
    maxSortOrderSingle.mockResolvedValue({ data: { sort_order: 7 } })
    serviceTypeInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Pasadía', pricing_unit: 'per_person' })
    await createServiceType(fd)
    expect(serviceTypeInsertMock).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 8 }))
  })

  it('maps a unique-constraint violation (23505) to the slugTaken copy', async () => {
    serviceTypeInsertMock.mockResolvedValue({ error: { code: '23505' } })
    const fd = formData({ name: 'Pasadía', pricing_unit: 'per_person' })
    const result = await createServiceType(fd)
    expect(result).toEqual({ error: 'Ya existe un tipo de servicio con ese slug.' })
  })

  it('maps any other insert error to the generic copy', async () => {
    serviceTypeInsertMock.mockResolvedValue({ error: { code: '99999' } })
    const fd = formData({ name: 'Pasadía', pricing_unit: 'per_person' })
    const result = await createServiceType(fd)
    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
  })

  it('returns success on a clean insert', async () => {
    serviceTypeInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Pasadía', pricing_unit: 'per_person' })
    const result = await createServiceType(fd)
    expect(result).toEqual({ success: true })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/tipos-servicio')
  })
})

describe('toggleServiceTypeActive', () => {
  it('does nothing when id is missing', async () => {
    const fd = formData({ is_active: 'true' })
    await toggleServiceTypeActive(fd)
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('flips is_active to false when currently true', async () => {
    const fd = formData({ id: 'st-1', is_active: 'true' })
    await toggleServiceTypeActive(fd)
    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_active: false }, 'id', 'st-1')
  })

  it('flips is_active to true when currently false', async () => {
    const fd = formData({ id: 'st-1', is_active: 'false' })
    await toggleServiceTypeActive(fd)
    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_active: true }, 'id', 'st-1')
  })
})
