import { describe, it, expect, vi, beforeEach } from 'vitest'

// The intake side of the role-request flow whose approval side is already
// covered in admin/actions.test.ts (approveRoleRequest). The metadata built
// here is exactly what that approval action later trusts to auto-provision
// a business/transporter/tourist_guide row — so the per-role required-field
// validation here is the only thing stopping an incomplete or malformed
// application from ever reaching an admin. Compliance-document upload
// (RNT/tarjeta profesional/SOAT/licencia) added alongside the metadata
// fields is the newest piece worth pinning down: file validation, the
// generated storage path shape, and the upload-rollback-on-later-failure
// behavior.

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
const storageUploadMock = vi.fn()
const storageRemoveMock = vi.fn()

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
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: File, opts: unknown) => storageUploadMock(bucket, path, file, opts),
        remove: (paths: string[]) => storageRemoveMock(bucket, paths),
      }),
    },
  })),
}))

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  roleRequestRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

const { submitRoleRequest } = await import('./actions')

function makeFile(name = 'doc.pdf', type = 'application/pdf', size = 1024) {
  return new File([new Uint8Array(size)], name, { type })
}

function formData(fields: Record<string, string | string[] | File>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
    else fd.set(k, v)
  }
  return fd
}

const USER_ID = 'user-1'
const FUTURE_DATE = '2099-01-01'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
  existingRequestMaybeSingle.mockResolvedValue({ data: null })
  checkRateLimitMock.mockResolvedValue(true)
  roleRequestInsertMock.mockResolvedValue({ error: null })
  storageUploadMock.mockResolvedValue({ error: null })
  storageRemoveMock.mockResolvedValue({ error: null })
})

const TRANSPORTER_COOPERATIVE_FIELDS = {
  license_plate: 'ABC-123',
  vehicle_type: 'moto',
  phone: '3001234567',
  transport_tier: 'cooperative',
  cooperative_name: 'TransManaure',
  cooperative_rnt_number: '99999',
  cooperative_habilitacion_number: 'HAB-001',
  cooperative_document: makeFile('coop.pdf'),
}

describe('rate limiting', () => {
  it('returns a rate-limit error and never checks the current role when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS })

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
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Tu cuenta ya tiene este rol.' })
  })

  it('rejects when a pending request for this role already exists', async () => {
    existingRequestMaybeSingle.mockResolvedValue({ data: { id: 'existing-request' } })
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Ya tienes una solicitud pendiente para este rol.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('scopes the insert to the session user_id, never a client-supplied one', async () => {
    const fd = formData({
      requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS,
      user_id: 'attacker-controlled-uuid',
    })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ success: true })
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: USER_ID }))
  })

  it('trims notes and stores null when blank', async () => {
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS, notes: '  hola  ' })
    await submitRoleRequest(fd)
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({ notes: 'hola' }))
  })

  it('returns a generic error and rolls back the uploaded document when the insert fails', async () => {
    roleRequestInsertMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(storageRemoveMock).toHaveBeenCalledWith('compliance-documents', [expect.stringMatching(/^user-1\/cooperativa-/)])
  })
})

describe('business_owner metadata', () => {
  const validFields = {
    business_name: 'Finca X', category_slugs: ['finca'], phone: '3001234567',
    rnt_number: '12345', rnt_document: makeFile('rnt.pdf'),
  }

  it.each([
    ['business_name', { ...validFields, business_name: '' }],
    ['category_slugs', { ...validFields, category_slugs: [] }],
    ['phone', { ...validFields, phone: '' }],
    ['rnt_number', { ...validFields, rnt_number: '' }],
  ])('rejects when %s alone is missing (all other fields valid)', async (_field, fields) => {
    const fd = formData({ requested_role: 'business_owner', ...fields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('rejects when the RNT document is missing', async () => {
    const fd = new FormData()
    fd.set('requested_role', 'business_owner')
    fd.set('business_name', validFields.business_name)
    fd.append('category_slugs', 'finca')
    fd.set('phone', validFields.phone)
    fd.set('rnt_number', validFields.rnt_number)
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Adjunta el documento requerido.' })
    expect(storageUploadMock).not.toHaveBeenCalled()
  })

  it('rejects a document with an unsupported mime type', async () => {
    const fd = formData({ requested_role: 'business_owner', ...validFields, rnt_document: makeFile('rnt.txt', 'text/plain') })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Formato no válido. Usa PDF, JPEG, PNG o WebP.' })
    expect(storageUploadMock).not.toHaveBeenCalled()
  })

  it('rejects a document over 8MB', async () => {
    const fd = formData({ requested_role: 'business_owner', ...validFields, rnt_document: makeFile('rnt.pdf', 'application/pdf', 9 * 1024 * 1024) })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'El archivo no puede superar 8 MB.' })
    expect(storageUploadMock).not.toHaveBeenCalled()
  })

  it('returns an upload-failed error and does not insert when storage upload fails', async () => {
    storageUploadMock.mockResolvedValue({ error: { message: 'storage down' } })
    const fd = formData({ requested_role: 'business_owner', ...validFields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'No se pudo subir uno de los documentos. Intenta de nuevo.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('builds exactly the expected metadata shape on success — no extra client-supplied keys leak through', async () => {
    const fd = formData({
      requested_role: 'business_owner', business_name: '  Finca X  ',
      category_slugs: ['finca', 'balneario'], phone: '3001234567',
      rnt_number: '  12345  ', rnt_document: makeFile('rnt.pdf'),
      role: 'admin', is_admin: 'true', // attacker-supplied noise — must not end up in metadata
    })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ success: true })
    const insertPayload = roleRequestInsertMock.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(insertPayload.metadata).toEqual({
      business_name: 'Finca X',
      category_slugs: ['finca', 'balneario'],
      phone: '3001234567',
      lat: null,
      lng: null,
      rnt_number: '12345',
      rnt_document_path: expect.stringMatching(/^user-1\/rnt-\d+-[a-z0-9]+\.pdf$/),
    })
  })

  it('includes lat/lng in metadata when provided', async () => {
    const fd = formData({ requested_role: 'business_owner', ...validFields, lat: '11.7808', lng: '-72.9944' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ success: true })
    const insertPayload = roleRequestInsertMock.mock.calls[0][0] as { metadata: { lat: number; lng: number } }
    expect(insertPayload.metadata.lat).toBe(11.7808)
    expect(insertPayload.metadata.lng).toBe(-72.9944)
  })

  it('rejects non-numeric coordinates', async () => {
    const fd = formData({ requested_role: 'business_owner', ...validFields, lat: 'not-a-number', lng: '-72.9944' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Las coordenadas deben ser números válidos.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('normalizes a formatted phone number in the stored metadata', async () => {
    const fd = formData({ requested_role: 'business_owner', ...validFields, phone: '+57 300 123 4567' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ success: true })
    const insertPayload = roleRequestInsertMock.mock.calls[0][0] as { metadata: { phone: string } }
    expect(insertPayload.metadata.phone).toBe('3001234567')
  })

  it('rejects an invalid phone without inserting', async () => {
    const fd = formData({ requested_role: 'business_owner', ...validFields, phone: '123' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
    expect(storageUploadMock).not.toHaveBeenCalled()
  })
})

describe('transporter metadata — shared fields', () => {
  it.each([
    ['license_plate', { ...TRANSPORTER_COOPERATIVE_FIELDS, license_plate: '' }],
    ['vehicle_type', { ...TRANSPORTER_COOPERATIVE_FIELDS, vehicle_type: '' }],
    ['phone', { ...TRANSPORTER_COOPERATIVE_FIELDS, phone: '' }],
    ['transport_tier', { ...TRANSPORTER_COOPERATIVE_FIELDS, transport_tier: '' }],
  ])('rejects when %s alone is missing (all other fields valid)', async (_field, fields) => {
    const fd = formData({ requested_role: 'transporter', ...fields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects a transport_tier outside cooperative/independent', async () => {
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS, transport_tier: 'freelance' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Selecciona cómo prestas el servicio.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a license plate that does not match a Colombian plate shape', async () => {
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS, license_plate: 'not-a-plate' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Escribe una placa colombiana válida (ej: ABC123).' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a vehicle_type outside the known set, even if non-empty', async () => {
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS, vehicle_type: 'helicoptero' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Selecciona un tipo de vehículo válido.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('accepts the buseta vehicle_type (TransManaure runs busetas, not just motorcycles)', async () => {
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS, vehicle_type: 'buseta' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ success: true })
  })

  it('normalizes a phone with country code and formatting noise before storing it', async () => {
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS, phone: '+57 300 123 4567' })
    await submitRoleRequest(fd)
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ phone: '3001234567' }),
    }))
  })

  it('rejects an invalid phone without inserting', async () => {
    const fd = formData({ requested_role: 'transporter', ...TRANSPORTER_COOPERATIVE_FIELDS, phone: '123' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })
})

describe('transporter metadata — cooperative tier', () => {
  it.each([
    ['cooperative_name', { ...TRANSPORTER_COOPERATIVE_FIELDS, cooperative_name: '' }],
    ['cooperative_rnt_number', { ...TRANSPORTER_COOPERATIVE_FIELDS, cooperative_rnt_number: '' }],
    ['cooperative_habilitacion_number', { ...TRANSPORTER_COOPERATIVE_FIELDS, cooperative_habilitacion_number: '' }],
  ])('rejects when %s alone is missing', async (_field, fields) => {
    const fd = formData({ requested_role: 'transporter', ...fields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(storageUploadMock).not.toHaveBeenCalled()
  })

  it('rejects when the cooperative document is missing', async () => {
    const fd = new FormData()
    fd.set('requested_role', 'transporter')
    for (const [k, v] of Object.entries(TRANSPORTER_COOPERATIVE_FIELDS)) {
      if (k === 'cooperative_document') continue
      fd.set(k, v as string)
    }
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Adjunta el documento requerido.' })
  })

  it('builds the expected metadata (uppercased plate, tier fields, document path) on success', async () => {
    const fd = formData({ ...TRANSPORTER_COOPERATIVE_FIELDS, requested_role: 'transporter', license_plate: '  abc-123  ' })
    await submitRoleRequest(fd)
    const insertPayload = roleRequestInsertMock.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(insertPayload.metadata).toEqual({
      license_plate: 'ABC123',
      vehicle_type: 'moto',
      phone: '3001234567',
      transport_tier: 'cooperative',
      cooperative_name: 'TransManaure',
      cooperative_rnt_number: '99999',
      cooperative_habilitacion_number: 'HAB-001',
      cooperative_document_path: expect.stringMatching(/^user-1\/cooperativa-\d+-[a-z0-9]+\.pdf$/),
    })
  })
})

describe('transporter metadata — independent tier', () => {
  const INDEPENDENT_FIELDS = {
    license_plate: 'ABC-123',
    vehicle_type: 'moto',
    phone: '3001234567',
    transport_tier: 'independent',
    driver_license_number: '12345678',
    driver_license_expiry: FUTURE_DATE,
    driver_license_document: makeFile('licencia.jpg', 'image/jpeg'),
    soat_expiry_date: FUTURE_DATE,
    soat_document: makeFile('soat.jpg', 'image/jpeg'),
  }

  it.each([
    ['driver_license_number', { ...INDEPENDENT_FIELDS, driver_license_number: '' }],
  ])('rejects when %s alone is missing', async (_field, fields) => {
    const fd = formData({ requested_role: 'transporter', ...fields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects a garbage driver_license_expiry date', async () => {
    const fd = formData({ requested_role: 'transporter', ...INDEPENDENT_FIELDS, driver_license_expiry: 'not-a-date' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'La fecha de vencimiento debe ser válida y no puede ser una fecha pasada.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a driver_license_expiry that already passed', async () => {
    const fd = formData({ requested_role: 'transporter', ...INDEPENDENT_FIELDS, driver_license_expiry: '2020-01-01' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'La fecha de vencimiento debe ser válida y no puede ser una fecha pasada.' })
  })

  it('rejects a soat_expiry_date that already passed', async () => {
    const fd = formData({ requested_role: 'transporter', ...INDEPENDENT_FIELDS, soat_expiry_date: '2020-01-01' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'La fecha de vencimiento debe ser válida y no puede ser una fecha pasada.' })
  })

  it('rolls back the driver-license upload when the soat upload fails', async () => {
    storageUploadMock
      .mockResolvedValueOnce({ error: null }) // driver_license_document upload succeeds
      .mockResolvedValueOnce({ error: { message: 'storage down' } }) // soat_document upload fails
    const fd = formData({ requested_role: 'transporter', ...INDEPENDENT_FIELDS })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'No se pudo subir uno de los documentos. Intenta de nuevo.' })
    expect(storageRemoveMock).toHaveBeenCalledWith('compliance-documents', [expect.stringMatching(/^user-1\/licencia-/)])
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('builds the expected metadata (dates, document paths) on success', async () => {
    const fd = formData({ requested_role: 'transporter', ...INDEPENDENT_FIELDS })
    await submitRoleRequest(fd)
    const insertPayload = roleRequestInsertMock.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(insertPayload.metadata).toEqual({
      license_plate: 'ABC123',
      vehicle_type: 'moto',
      phone: '3001234567',
      transport_tier: 'independent',
      driver_license_number: '12345678',
      driver_license_expiry: FUTURE_DATE,
      driver_license_document_path: expect.stringMatching(/^user-1\/licencia-\d+-[a-z0-9]+\.jpg$/),
      soat_expiry_date: FUTURE_DATE,
      soat_document_path: expect.stringMatching(/^user-1\/soat-\d+-[a-z0-9]+\.jpg$/),
    })
  })
})

describe('tourist_guide metadata', () => {
  const validFields = {
    specialties: ['ecotourism'], languages: ['spanish'], experience_years: '5',
    bio: 'Guía local con experiencia', phone: '3001234567',
    rnt_number: '54321', rnt_document: makeFile('rnt.pdf'),
    tarjeta_profesional_number: 'TP-1', tarjeta_profesional_document: makeFile('tp.pdf'),
  }

  it('requires specialties, languages, a numeric experience_years, bio, phone, RNT, and tarjeta profesional', async () => {
    const fd = formData({ requested_role: 'tourist_guide', specialties: [], languages: [], experience_years: '', bio: '', phone: '' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects a non-numeric experience_years', async () => {
    const fd = formData({ requested_role: 'tourist_guide', ...validFields, experience_years: 'muchos' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects when rnt_number is missing', async () => {
    const fd = formData({ requested_role: 'tourist_guide', ...validFields, rnt_number: '' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects when tarjeta_profesional_number is missing', async () => {
    const fd = formData({ requested_role: 'tourist_guide', ...validFields, tarjeta_profesional_number: '' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('rejects an invalid phone without inserting', async () => {
    const fd = formData({ requested_role: 'tourist_guide', ...validFields, phone: '123' })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('rolls back the RNT upload when the tarjeta profesional upload fails', async () => {
    storageUploadMock
      .mockResolvedValueOnce({ error: null }) // rnt_document upload succeeds
      .mockResolvedValueOnce({ error: { message: 'storage down' } }) // tarjeta_profesional_document upload fails
    const fd = formData({ requested_role: 'tourist_guide', ...validFields })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'No se pudo subir uno de los documentos. Intenta de nuevo.' })
    expect(storageRemoveMock).toHaveBeenCalledWith('compliance-documents', [expect.stringMatching(/^user-1\/rnt-/)])
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('builds the metadata correctly on success, including the normalized phone and document paths', async () => {
    const fd = formData({
      requested_role: 'tourist_guide', specialties: ['ecotourism', 'history_culture'], languages: ['spanish', 'english'],
      experience_years: '5', bio: 'Guía local con experiencia', phone: '300 123 4567',
      rnt_number: '54321', rnt_document: makeFile('rnt.pdf'),
      tarjeta_profesional_number: 'TP-1', tarjeta_profesional_document: makeFile('tp.pdf'),
    })
    await submitRoleRequest(fd)
    const insertPayload = roleRequestInsertMock.mock.calls[0][0] as { metadata: Record<string, unknown> }
    expect(insertPayload.metadata).toEqual({
      specialties: ['ecotourism', 'history_culture'], languages: ['spanish', 'english'],
      experience_years: 5, bio: 'Guía local con experiencia', phone: '3001234567',
      rnt_number: '54321', rnt_document_path: expect.stringMatching(/^user-1\/rnt-\d+-[a-z0-9]+\.pdf$/),
      tarjeta_profesional_number: 'TP-1', tarjeta_profesional_document_path: expect.stringMatching(/^user-1\/tarjeta-profesional-\d+-[a-z0-9]+\.pdf$/),
    })
  })

  // Documents current (lenient) behavior: parseInt("5abc", 10) === 5, which
  // passes Number.isFinite, so trailing garbage is silently coerced rather
  // than rejected. Not a security issue, but worth pinning down so a future
  // change to stricter numeric validation is a deliberate choice, not an
  // accidental behavior change this suite would otherwise miss either way.
  it('silently coerces a numeric-prefixed experience_years like "5abc" to 5, rather than rejecting it', async () => {
    const fd = formData({ requested_role: 'tourist_guide', ...validFields, experience_years: '5abc' })
    await submitRoleRequest(fd)
    expect(roleRequestInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ experience_years: 5 }),
    }))
  })

  it.each([
    ['negative', '-1'],
    ['over the 60-year cap', '61'],
  ])('rejects experience_years that is %s', async (_label, years) => {
    const fd = formData({ requested_role: 'tourist_guide', ...validFields, experience_years: years })
    const result = await submitRoleRequest(fd)
    expect(result).toEqual({ error: 'Los años de experiencia deben estar entre 0 y 60.' })
    expect(roleRequestInsertMock).not.toHaveBeenCalled()
  })

  it('accepts experience_years at the boundaries (0 and 60)', async () => {
    for (const years of ['0', '60']) {
      roleRequestInsertMock.mockClear()
      const fd = formData({ requested_role: 'tourist_guide', ...validFields, experience_years: years })
      const result = await submitRoleRequest(fd)
      expect(result).toEqual({ success: true })
    }
  })
})
