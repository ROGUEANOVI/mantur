import { describe, it, expect, vi, beforeEach } from 'vitest'

// The intake side of the role-request flow whose approval side is already
// covered in admin/actions.test.ts (approveRoleRequest). The metadata built
// here is exactly what that approval action later trusts to auto-provision
// a business/transporter/tourist_guide row — so the per-role required-field
// validation here is the only thing stopping an incomplete or malformed
// application from ever reaching an admin.

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
const existingRequestMaybeSingle = vi.fn()
const roleRequestInsertMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      if (table === 'role_requests') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: existingRequestMaybeSingle }) }) }) }),
          insert: (payload: unknown) => roleRequestInsertMock(payload),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  })),
}))

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  roleRequestRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

const { submitRoleRequest } = await import('./actions')

function formData(fields: Record<string, string | string[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
    else fd.set(k, v)
  }
  return fd
}

const USER_ID = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
  existingRequestMaybeSingle.mockResolvedValue({ data: null })
  checkRateLimitMock.mockResolvedValue(true)
})

describe('rate limiting', () => {
  it('returns a rate-limit error and never checks the current role when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ requested_role: 'transporter', license_plate: 'ABC-123', vehicle_type: 'moto', phone: '3001234567' })

    const result = await submitRoleRequest(fd)

    expect(result).toEqual({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' })
    expect(checkRateLimitMock).toHaveBeenCalledWith({}, USER_ID)
    expect(profileSingle).not.toHaveBeenCalled()
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })
})

describe('auth guard', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ requested_role: 'transporter' })
    await expect(submitRoleRequest(fd)).rejects.toThrow('redirect:/login')
  })
})

describe('submitRoleRequest — general validation', () => {
  it('rejects a missing/invalid requested_role', async () => {
    const fd = formData({ requested_role: 'admin' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('rejects when the user already has the requested role', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'transporter' } })
    const fd = formData({ requested_role: 'transporter', license_plate: 'ABC-123', vehicle_type: 'moto', phone: '3001234567' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Tu cuenta ya tiene este rol.' })
  })

  it('rejects when a pending request for this role already exists', async () => {
    existingRequestMaybeSingle.mockResolvedValue({ data: { id: 'existing-request' } })
    const fd = formData({ requested_role: 'transporter', license_plate: 'ABC-123', vehicle_type: 'moto', phone: '3001234567' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Ya tienes una solicitud pendiente para este rol.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('scopes the insert to the session user_id, never a client-supplied one', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: null })
    const fd = formData({
      requested_role: 'transporter', license_plate: 'abc-123', vehicle_type: 'moto', phone: '3001234567',
      user_id: 'attacker-controlled-uuid',
    })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ success: true })
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: USER_ID }))
  })

  it('trims notes and stores null when blank', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ requested_role: 'transporter', license_plate: 'ABC-123', vehicle_type: 'moto', phone: '3001234567', notes: '  hola  ' })
    await submitRoleRequest(fd)
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({ notes: 'hola' }))
  })

  it('returns a generic error when the insert fails', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ requested_role: 'transporter', license_plate: 'ABC-123', vehicle_type: 'moto', phone: '3001234567' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('business_owner metadata', () => {
  const validFields = { business_name: 'Finca X', category_slugs: ['finca'], phone: '3001234567' }

  it.each([
    ['business_name', { ...validFields, business_name: '' }],
    ['category_slugs', { ...validFields, category_slugs: [] }],
    ['phone', { ...validFields, phone: '' }],
  ])('rejects when %s alone is missing (all other fields valid)', async (_field, fields) => {
    const fd = formData({ requested_role: 'business_owner', ...fields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('builds exactly the expected metadata shape on success — no extra client-supplied keys leak through', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: null })
    const fd = formData({
      requested_role: 'business_owner', business_name: '  Finca X  ',
      category_slugs: ['finca', 'balneario'], phone: '3001234567',
      role: 'admin', is_admin: 'true', // attacker-supplied noise — must not end up in metadata
    })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ success: true })
    const insertPayload = roleRequestInsertMock.mock.calls[0][0] as { metadata: unknown }
    expect(insertPayload.metadata).toEqual({ business_name: 'Finca X', category_slugs: ['finca', 'balneario'], phone: '3001234567' })
  })
})

describe('transporter metadata', () => {
  const validFields = { license_plate: 'ABC-123', vehicle_type: 'moto', phone: '3001234567' }

  it.each([
    ['license_plate', { ...validFields, license_plate: '' }],
    ['vehicle_type', { ...validFields, vehicle_type: '' }],
    ['phone', { ...validFields, phone: '' }],
  ])('rejects when %s alone is missing (all other fields valid)', async (_field, fields) => {
    const fd = formData({ requested_role: 'transporter', ...fields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('uppercases the license plate and builds the metadata on success', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ requested_role: 'transporter', license_plate: '  abc-123  ', vehicle_type: 'motocarro', phone: '3001234567' })
    await submitRoleRequest(fd)
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { license_plate: 'ABC-123', vehicle_type: 'motocarro', phone: '3001234567' },
    }))
  })
})

describe('tourist_guide metadata', () => {
  it('requires specialties, languages, a numeric experience_years, and bio', async () => {
    const fd = formData({ requested_role: 'tourist_guide', specialties: [], languages: [], experience_years: '', bio: '' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects a non-numeric experience_years', async () => {
    const fd = formData({
      requested_role: 'tourist_guide', specialties: ['ecotourism'], languages: ['spanish'],
      experience_years: 'muchos', bio: 'Guía local con experiencia',
    })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('builds the metadata correctly on success', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: null })
    const fd = formData({
      requested_role: 'tourist_guide', specialties: ['ecotourism', 'history_culture'], languages: ['spanish', 'english'],
      experience_years: '5', bio: 'Guía local con experiencia',
    })
    await submitRoleRequest(fd)
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { specialties: ['ecotourism', 'history_culture'], languages: ['spanish', 'english'], experience_years: 5, bio: 'Guía local con experiencia' },
    }))
  })

  // Documents current (lenient) behavior: parseInt("5abc", 10) === 5, which
  // passes Number.isFinite, so trailing garbage is silently coerced rather
  // than rejected. Not a security issue, but worth pinning down so a future
  // change to stricter numeric validation is a deliberate choice, not an
  // accidental behavior change this suite would otherwise miss either way.
  it('silently coerces a numeric-prefixed experience_years like "5abc" to 5, rather than rejecting it', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: null })
    const fd = formData({
      requested_role: 'tourist_guide', specialties: ['ecotourism'], languages: ['spanish'],
      experience_years: '5abc', bio: 'Guía local con experiencia',
    })
    await submitRoleRequest(fd)
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ experience_years: 5 }),
    }))
  })
})
