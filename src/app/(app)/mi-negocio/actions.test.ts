import { describe, it, expect, vi, beforeEach } from 'vitest'

// Covers the business/service CRUD and image actions a business owner
// uses. The recurring pattern worth protecting here is ownership: every
// mutation must be scoped to businesses/services the caller actually
// owns, either via an explicit .eq('owner_id', userId) filter (checked
// here) or by relying on RLS and detecting a silent block via an empty
// returned row set (also checked here, since that detection logic is easy
// to accidentally break).

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

// SERVICE_TYPE_ATTRIBUTE_FIELDS is real (imported actual) so createService's
// parseAttributes() behavior is exercised against the genuine field configs.
// One synthetic slug ('__test_required__') is added on top, purely so the
// "a required attribute field left blank returns an error" codepath can be
// exercised — none of the real slugs (tour_activity/lodging/event_rental/
// pasadia) currently mark any field `required: true`, so that branch of
// parseAttributes is otherwise unreachable through real data today.
vi.mock('@/lib/services/attributeConfig', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/attributeConfig')>(
    '@/lib/services/attributeConfig',
  )
  const extendedFields = {
    ...actual.SERVICE_TYPE_ATTRIBUTE_FIELDS,
    __test_required__: [
      { key: 'required_field', label: 'Campo requerido', kind: 'text' as const, required: true },
    ],
  }
  return {
    ...actual,
    SERVICE_TYPE_ATTRIBUTE_FIELDS: extendedFields,
    // getAttributeFields is a real function closing over the real (non-mocked)
    // SERVICE_TYPE_ATTRIBUTE_FIELDS constant, so spreading ...actual alone
    // would ignore the extended map above — re-implement it here against
    // extendedFields so createService actually sees __test_required__.
    getAttributeFields: (slug: string) =>
      Object.hasOwn(extendedFields, slug) ? extendedFields[slug as keyof typeof extendedFields] : [],
  }
})

const authGetUser = vi.fn()
const profileSingle = vi.fn()

const businessInsertSingle = vi.fn()
const businessUpdateMock = vi.fn()
const businessDeleteEq = vi.fn()
const businessOwnershipSingle = vi.fn() // select('id').eq(id).eq(owner_id).single() — createService
const businessReactivateMaybeSingle = vi.fn() // select('id, verified')... .maybeSingle() — toggleBusinessStatus (activate path)
const businessImagesMaybeSingle = vi.fn() // select('id, images')... .maybeSingle() — deleteBusinessImage
const businessMediaMaybeSingle = vi.fn() // select('id, images, videos')... .maybeSingle() — upload/requestBusinessVideoUpload/confirmBusinessVideoUpload
const businessVideosMaybeSingle = vi.fn() // select('id, videos')... .maybeSingle() — deleteBusinessVideo

const categoryLinksInsertMock = vi.fn()
const categoryLinksDeleteMock = vi.fn()

const serviceTypeSingle = vi.fn() // service_types: select('slug').eq(id).eq(is_active).single() — createService
const serviceInsertMock = vi.fn()
const serviceUpdateSelect = vi.fn()
const serviceMaybeSingle = vi.fn() // select(...).eq(id).maybeSingle() — upload/deleteServiceImage, request/confirmServiceVideoUpload, deleteServiceVideo
const existingServiceSingle = vi.fn() // select('service_types(slug)').eq(id).single() — updateService

function businessesUserTable() {
  return {
    insert: (payload: unknown) => ({ select: () => ({ single: () => businessInsertSingle(payload) }) }),
    update: (payload: unknown) => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => businessUpdateMock(payload, col1, val1, col2, val2),
      }),
    }),
    select: (cols: string) => {
      if (cols === 'id, verified') {
        return { eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: businessReactivateMaybeSingle }) }) }) }
      }
      if (cols === 'id') {
        // createService uses .single(), requestServiceVideoUpload uses
        // .maybeSingle() for the same "is this business mine" check — neither
        // revalidates a public negocio path, so no slug is needed here.
        return { eq: () => ({ eq: () => ({ single: businessOwnershipSingle, maybeSingle: businessOwnershipSingle }) }) }
      }
      if (cols === 'id, slug') {
        // uploadServiceImage/deleteServiceImage/confirmServiceVideoUpload/
        // deleteServiceVideo — same ownership check as above, but these do
        // revalidatePath(`/negocios/${owned.slug}`), so the select needs slug.
        return { eq: () => ({ eq: () => ({ maybeSingle: businessOwnershipSingle }) }) }
      }
      if (cols === 'id, images, slug') {
        return { eq: () => ({ eq: () => ({ maybeSingle: businessImagesMaybeSingle }) }) }
      }
      if (cols === 'id, images, videos') {
        // requestBusinessVideoUpload only — doesn't revalidate, no slug needed.
        return { eq: () => ({ eq: () => ({ maybeSingle: businessMediaMaybeSingle }) }) }
      }
      if (cols === 'id, images, videos, slug') {
        return { eq: () => ({ eq: () => ({ maybeSingle: businessMediaMaybeSingle }) }) }
      }
      if (cols === 'id, videos, slug') {
        return { eq: () => ({ eq: () => ({ maybeSingle: businessVideosMaybeSingle }) }) }
      }
      throw new Error(`unexpected businesses select: ${cols}`)
    },
    delete: () => ({ eq: (col: string, val: string) => businessDeleteEq(col, val) }),
  }
}

function servicesUserTable() {
  return {
    insert: (payload: unknown) => serviceInsertMock(payload),
    update: (payload: unknown) => ({
      eq: (col: string, val: string) => ({ select: () => serviceUpdateSelect(payload, col, val) }),
    }),
    select: (cols: string) => {
      if (cols === 'service_types(slug)') {
        // updateService re-reads the immutable service type slug via a join
        // instead of trusting a service_type_id on the update payload.
        return { eq: () => ({ single: existingServiceSingle }) }
      }
      return { eq: () => ({ maybeSingle: serviceMaybeSingle }) }
    },
  }
}

function serviceTypesUserTable() {
  return {
    select: () => ({ eq: () => ({ eq: () => ({ single: serviceTypeSingle }) }) }),
  }
}

function categoryLinksUserTable() {
  return {
    insert: (payload: unknown) => categoryLinksInsertMock(payload),
    delete: () => ({ eq: (col: string, val: string) => categoryLinksDeleteMock(col, val) }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      if (table === 'businesses') return businessesUserTable()
      if (table === 'business_category_links') return categoryLinksUserTable()
      if (table === 'services') return servicesUserTable()
      if (table === 'service_types') return serviceTypesUserTable()
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const adminBusinessesUpdate = vi.fn()
const adminServicesUpdate = vi.fn()
const storageUpload = vi.fn()
const storageGetPublicUrl = vi.fn()
const storageRemove = vi.fn()
const storageCreateSignedUploadUrl = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'businesses') {
        return { update: (payload: unknown) => ({ eq: (col: string, val: string) => adminBusinessesUpdate(payload, col, val) }) }
      }
      if (table === 'services') {
        return { update: (payload: unknown) => ({ eq: (col: string, val: string) => adminServicesUpdate(payload, col, val) }) }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: unknown, opts: unknown) => storageUpload(bucket, path, file, opts),
        getPublicUrl: (path: string) => storageGetPublicUrl(bucket, path),
        remove: (paths: string[]) => storageRemove(bucket, paths),
        createSignedUploadUrl: (path: string) => storageCreateSignedUploadUrl(bucket, path),
      }),
    },
  })),
}))

const {
  createBusiness,
  updateBusiness,
  toggleBusinessStatus,
  createService,
  updateService,
  toggleServiceStatus,
  uploadBusinessImage,
  uploadServiceImage,
  deleteServiceImage,
  deleteBusinessImage,
  requestBusinessVideoUpload,
  confirmBusinessVideoUpload,
  deleteBusinessVideo,
  requestServiceVideoUpload,
  confirmServiceVideoUpload,
  deleteServiceVideo,
} = await import('./actions')

function formData(fields: Record<string, string | string[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
    else fd.set(k, v)
  }
  return fd
}

function fakeImageFile(overrides: Partial<{ type: string; size: number }> = {}) {
  const size = overrides.size ?? 1024
  const type = overrides.type ?? 'image/jpeg'
  return new File([new Uint8Array(size)], 'photo.jpg', { type })
}

const BIZ_ID = '11111111-1111-1111-1111-111111111111'
const BIZ_SLUG = 'finca-la-esperanza'
const SERVICE_ID = '22222222-2222-2222-2222-222222222222'
const CAT_ID_1 = '33333333-3333-3333-3333-333333333333'
const CAT_ID_2 = '44444444-4444-4444-4444-444444444444'
const SERVICE_TYPE_ID = '55555555-5555-5555-5555-555555555555'
const USER_ID = 'owner-1'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
  storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.webp' } })
})

describe('getAuthenticatedOwner guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ name: 'X', category_ids: [CAT_ID_1] })
    await expect(createBusiness(fd)).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not a business_owner', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ name: 'X', category_ids: [CAT_ID_1] })
    await expect(createBusiness(fd)).rejects.toThrow('redirect:/')
  })
})

describe('createBusiness', () => {
  it('rejects a missing name', async () => {
    const fd = formData({ name: '  ', category_ids: [CAT_ID_1] })
    const result = await createBusiness(fd)
    expect(result).toEqual({ error: 'El nombre del negocio es obligatorio.' })
    expect(businessInsertSingle).not.toHaveBeenCalled()
  })

  it('rejects when no valid category ids are selected (non-UUID ids are filtered out)', async () => {
    const fd = formData({ name: 'Finca X', category_ids: ['not-a-uuid'] })
    const result = await createBusiness(fd)
    expect(result).toEqual({ error: 'Selecciona al menos una categoría.' })
  })

  it('creates the business with owner_id from the session and safe hardcoded defaults, then links categories', async () => {
    businessInsertSingle.mockResolvedValue({ data: { id: BIZ_ID }, error: null })
    categoryLinksInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ name: '  Finca X  ', category_ids: [CAT_ID_1, CAT_ID_2] })
    await expect(createBusiness(fd)).rejects.toThrow('redirect:/mi-negocio')

    expect(businessInsertSingle).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: USER_ID, name: 'Finca X', type: 'other', verified: false, status: 'pending' }),
    )
    expect(categoryLinksInsertMock).toHaveBeenCalledWith([
      { business_id: BIZ_ID, category_id: CAT_ID_1 },
      { business_id: BIZ_ID, category_id: CAT_ID_2 },
    ])
  })

  it('ignores client-supplied verified/status/owner_id overrides — hardcoded safe defaults always win', async () => {
    businessInsertSingle.mockResolvedValue({ data: { id: BIZ_ID }, error: null })
    categoryLinksInsertMock.mockResolvedValue({ error: null })

    // None of these fields exist in the real form, but the action only ever
    // reads name/description/address/phone/category_ids off formData — this
    // proves a naive "spread formData into the insert" regression would be
    // the only way to break this, and this test would catch it.
    const fd = formData({
      name: 'Finca X', category_ids: [CAT_ID_1],
      verified: 'true', status: 'active', owner_id: 'attacker-controlled-uuid',
    })
    await expect(createBusiness(fd)).rejects.toThrow('redirect:/mi-negocio')

    expect(businessInsertSingle).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: USER_ID, verified: false, status: 'pending' }),
    )
  })

  it('rolls back (deletes) the business when linking categories fails', async () => {
    businessInsertSingle.mockResolvedValue({ data: { id: BIZ_ID }, error: null })
    categoryLinksInsertMock.mockResolvedValue({ error: { message: 'insert failed' } })

    const fd = formData({ name: 'Finca X', category_ids: [CAT_ID_1] })
    const result = await createBusiness(fd)

    expect(result).toEqual({ error: 'No se pudo guardar las categorías. Intenta de nuevo.' })
    expect(businessDeleteEq).toHaveBeenCalledWith('id', BIZ_ID)
  })

  it('returns an error and never attempts category linking when the business insert fails', async () => {
    businessInsertSingle.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const fd = formData({ name: 'Finca X', category_ids: [CAT_ID_1] })
    const result = await createBusiness(fd)

    expect(result).toEqual({ error: 'No se pudo crear el negocio. Intenta de nuevo.' })
    expect(categoryLinksInsertMock).not.toHaveBeenCalled()
  })

  it('normalizes a formatted phone number before storing it', async () => {
    businessInsertSingle.mockResolvedValue({ data: { id: BIZ_ID }, error: null })
    categoryLinksInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ name: 'Finca X', category_ids: [CAT_ID_1], phone: '+57 300 123 4567' })
    await expect(createBusiness(fd)).rejects.toThrow('redirect:/mi-negocio')

    expect(businessInsertSingle).toHaveBeenCalledWith(expect.objectContaining({ phone: '3001234567' }))
  })

  it('rejects a phone number that is not a valid Colombian mobile, without inserting', async () => {
    const fd = formData({ name: 'Finca X', category_ids: [CAT_ID_1], phone: 'not-a-phone' })
    const result = await createBusiness(fd)

    expect(result).toEqual({ error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' })
    expect(businessInsertSingle).not.toHaveBeenCalled()
  })
})

describe('updateBusiness', () => {
  it('rejects a non-UUID businessId before any auth/query', async () => {
    const fd = formData({ name: 'X', category_ids: [CAT_ID_1] })
    const result = await updateBusiness('not-a-uuid', fd)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('updates the business scoped to id AND owner_id, then replaces category links', async () => {
    businessUpdateMock.mockResolvedValue({ error: null })
    categoryLinksDeleteMock.mockResolvedValue({ error: null })
    categoryLinksInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ name: 'Nuevo nombre', category_ids: [CAT_ID_2] })
    await expect(updateBusiness(BIZ_ID, fd)).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}`)

    expect(businessUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Nuevo nombre' }),
      'id', BIZ_ID, 'owner_id', USER_ID,
    )
    expect(categoryLinksDeleteMock).toHaveBeenCalledWith('business_id', BIZ_ID)
    expect(categoryLinksInsertMock).toHaveBeenCalledWith([{ business_id: BIZ_ID, category_id: CAT_ID_2 }])
  })

  it('returns a generic error when the update fails (e.g. RLS blocks a non-owner)', async () => {
    businessUpdateMock.mockResolvedValue({ error: { message: 'rls blocked' } })
    const fd = formData({ name: 'Nuevo nombre', category_ids: [CAT_ID_1] })
    const result = await updateBusiness(BIZ_ID, fd)

    expect(result).toEqual({ error: 'No se pudo actualizar el negocio. Intenta de nuevo.' })
    expect(categoryLinksDeleteMock).not.toHaveBeenCalled()
  })

  it('normalizes a formatted phone number before storing it', async () => {
    businessUpdateMock.mockResolvedValue({ error: null })
    categoryLinksDeleteMock.mockResolvedValue({ error: null })
    categoryLinksInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ name: 'Nuevo nombre', category_ids: [CAT_ID_1], phone: '+57 300 123 4567' })
    await expect(updateBusiness(BIZ_ID, fd)).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}`)

    expect(businessUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '3001234567' }),
      'id', BIZ_ID, 'owner_id', USER_ID,
    )
  })

  it('rejects a phone number that is not a valid Colombian mobile, without updating', async () => {
    const fd = formData({ name: 'Nuevo nombre', category_ids: [CAT_ID_1], phone: 'not-a-phone' })
    const result = await updateBusiness(BIZ_ID, fd)

    expect(result).toEqual({ error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' })
    expect(businessUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects a missing name', async () => {
    const fd = formData({ name: '  ', category_ids: [CAT_ID_1] })
    const result = await updateBusiness(BIZ_ID, fd)
    expect(result).toEqual({ error: 'El nombre del negocio es obligatorio.' })
    expect(businessUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects when no valid category ids are selected', async () => {
    const fd = formData({ name: 'Nuevo nombre', category_ids: ['not-a-uuid'] })
    const result = await updateBusiness(BIZ_ID, fd)
    expect(result).toEqual({ error: 'Selecciona al menos una categoría.' })
    expect(businessUpdateMock).not.toHaveBeenCalled()
  })
})

describe('toggleBusinessStatus', () => {
  it('returns an error for a non-UUID id, without touching auth', async () => {
    const result = await toggleBusinessStatus('bad-id', 'active')
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('deactivates: scopes the update to id AND owner_id, no redirect', async () => {
    businessUpdateMock.mockResolvedValue({ error: null })
    const result = await toggleBusinessStatus(BIZ_ID, 'active')
    expect(result).toBeUndefined()
    expect(businessUpdateMock).toHaveBeenCalledWith({ status: 'inactive' }, 'id', BIZ_ID, 'owner_id', USER_ID)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('deactivates: returns an error when the update fails (e.g. RLS blocks a non-owner)', async () => {
    businessUpdateMock.mockResolvedValue({ error: { message: 'rls blocked' } })
    const result = await toggleBusinessStatus(BIZ_ID, 'active')
    expect(result).toEqual({ error: 'No se pudo desactivar el negocio. Intenta de nuevo.' })
  })

  it('activates: returns an error when the admin update fails', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, verified: true } })
    adminBusinessesUpdate.mockResolvedValue({ error: { message: 'db error' } })
    const result = await toggleBusinessStatus(BIZ_ID, 'inactive')
    expect(result).toEqual({ error: 'No se pudo activar el negocio. Intenta de nuevo.' })
  })

  it('activates: restores a verified business directly to active, no redirect', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, verified: true } })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    const result = await toggleBusinessStatus(BIZ_ID, 'inactive')
    expect(result).toBeUndefined()
    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ status: 'active' }, 'id', BIZ_ID)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('activates: sends an unverified business back to pending, not active', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, verified: false } })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    const result = await toggleBusinessStatus(BIZ_ID, 'inactive')
    expect(result).toBeUndefined()
    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ status: 'pending' }, 'id', BIZ_ID)
  })

  it('activates: returns an error when the business is not owned/not inactive', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: null })
    const result = await toggleBusinessStatus(BIZ_ID, 'inactive')
    expect(result).toEqual({ error: 'No se pudo activar el negocio. Intenta de nuevo.' })
    expect(adminBusinessesUpdate).not.toHaveBeenCalled()
  })

  it('returns an error for any other current status (e.g. pending — nothing to toggle yet)', async () => {
    const result = await toggleBusinessStatus(BIZ_ID, 'pending')
    expect(result).toEqual({ error: 'No se pudo actualizar el estado del negocio.' })
  })
})

describe('createService', () => {
  it('rejects a non-UUID business_id before querying the DB', async () => {
    const fd = formData({ business_id: 'not-a-uuid', name: 'Tour', base_price: '10000', service_type_id: SERVICE_TYPE_ID })
    const result = await createService(fd)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(businessOwnershipSingle).not.toHaveBeenCalled()
  })

  it('rejects when the business is not owned by the caller', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: null })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', base_price: '10000', service_type_id: SERVICE_TYPE_ID })
    const result = await createService(fd)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(serviceInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a missing/invalid service_type_id, without querying service_types', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', base_price: '10000', service_type_id: 'not-a-uuid' })
    const result = await createService(fd)
    expect(result).toEqual({ error: 'Tipo de servicio no válido.' })
    expect(serviceTypeSingle).not.toHaveBeenCalled()
  })

  it('rejects an unknown or inactive service_type_id', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: null })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', base_price: '10000', service_type_id: SERVICE_TYPE_ID })
    const result = await createService(fd)
    expect(result).toEqual({ error: 'Tipo de servicio no válido.' })
    expect(serviceInsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid price', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: { slug: 'tour_activity' } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', base_price: '-5', service_type_id: SERVICE_TYPE_ID })
    const result = await createService(fd)
    expect(result).toEqual({ error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' })
  })

  it('rejects an invalid capacity', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: { slug: 'tour_activity' } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', base_price: '10000', capacity: '0', service_type_id: SERVICE_TYPE_ID })
    const result = await createService(fd)
    expect(result).toEqual({ error: 'El cupo debe ser un número positivo.' })
  })

  it('parses attr_* fields scoped to the resolved slug into the attributes column', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: { slug: 'tour_activity' } })
    serviceInsertMock.mockResolvedValue({ error: null })

    const fd = formData({
      business_id: BIZ_ID, name: 'Tour por el río', base_price: '15000', capacity: '10',
      service_type_id: SERVICE_TYPE_ID, attr_duration_minutes: '90', attr_meeting_point: 'Parque principal',
    })
    await expect(createService(fd)).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}/servicios`)

    expect(serviceInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: BIZ_ID,
        service_type_id: SERVICE_TYPE_ID,
        name: 'Tour por el río',
        base_price: 15000,
        capacity: 10,
        attributes: { duration_minutes: 90, meeting_point: 'Parque principal' },
        status: 'active',
      }),
    )
  })

  it('ignores attr_* fields that belong to a different service type than the resolved slug', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: { slug: 'tour_activity' } })
    serviceInsertMock.mockResolvedValue({ error: null })

    // attr_rooms belongs to the 'lodging' field config, not 'tour_activity' —
    // parseAttributes only reads keys defined for the resolved slug.
    const fd = formData({
      business_id: BIZ_ID, name: 'Tour', base_price: '10000', service_type_id: SERVICE_TYPE_ID,
      attr_rooms: '3',
    })
    await expect(createService(fd)).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}/servicios`)

    expect(serviceInsertMock).toHaveBeenCalledWith(expect.objectContaining({ attributes: {} }))
  })

  it('returns the field-specific error when a required attribute field is left blank', async () => {
    // No real service type currently marks a field required — this exercises
    // that (real, unmodified) parseAttributes codepath via a synthetic slug
    // added only in this test file's mock of attributeConfig.
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: { slug: '__test_required__' } })

    const fd = formData({ business_id: BIZ_ID, name: 'Tour', base_price: '10000', service_type_id: SERVICE_TYPE_ID })
    const result = await createService(fd)

    expect(result).toEqual({ error: 'Campo requerido es requerido.' })
    expect(serviceInsertMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the insert fails', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: { slug: 'tour_activity' } })
    serviceInsertMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', base_price: '10000', service_type_id: SERVICE_TYPE_ID })
    const result = await createService(fd)
    expect(result).toEqual({ error: 'No se pudo crear el servicio. Intenta de nuevo.' })
  })

  it('creates the service scoped to the owned business and redirects', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    serviceTypeSingle.mockResolvedValue({ data: { slug: 'tour_activity' } })
    serviceInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ business_id: BIZ_ID, name: 'Tour por el río', base_price: '15000', capacity: '10', service_type_id: SERVICE_TYPE_ID })
    await expect(createService(fd)).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}/servicios`)

    expect(serviceInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: BIZ_ID, service_type_id: SERVICE_TYPE_ID, name: 'Tour por el río', base_price: 15000, capacity: 10, status: 'active',
      }),
    )
  })
})

describe('updateService', () => {
  it('rejects a non-UUID serviceId', async () => {
    const fd = formData({ name: 'X', base_price: '1000' })
    const result = await updateService('bad-id', fd)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the service (or its service type join) cannot be resolved', async () => {
    existingServiceSingle.mockResolvedValue({ data: null })
    const fd = formData({ name: 'X', base_price: '1000' })
    const result = await updateService(SERVICE_ID, fd)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(serviceUpdateSelect).not.toHaveBeenCalled()
  })

  it('rejects an invalid price', async () => {
    existingServiceSingle.mockResolvedValue({ data: { service_types: { slug: 'tour_activity' } } })
    const fd = formData({ name: 'X', base_price: 'abc' })
    const result = await updateService(SERVICE_ID, fd)
    expect(result).toEqual({ error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' })
  })

  it('updates on success (row returned) with no redirect, just revalidation', async () => {
    existingServiceSingle.mockResolvedValue({ data: { service_types: { slug: 'tour_activity' } } })
    serviceUpdateSelect.mockResolvedValue({ data: [{ id: SERVICE_ID }], error: null })
    const fd = formData({ name: 'Tour actualizado', base_price: '20000' })

    await updateService(SERVICE_ID, fd)

    expect(serviceUpdateSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tour actualizado', base_price: 20000 }), 'id', SERVICE_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-negocio', 'layout')
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('treats a silent RLS block (no error, zero rows) as a failure', async () => {
    existingServiceSingle.mockResolvedValue({ data: { service_types: { slug: 'tour_activity' } } })
    serviceUpdateSelect.mockResolvedValue({ data: [], error: null })
    const fd = formData({ name: 'Tour actualizado', base_price: '20000' })

    const result = await updateService(SERVICE_ID, fd)
    expect(result).toEqual({ error: 'No se pudo actualizar el servicio. Intenta de nuevo.' })
  })

  it('rejects an invalid capacity', async () => {
    existingServiceSingle.mockResolvedValue({ data: { service_types: { slug: 'tour_activity' } } })
    const fd = formData({ name: 'Tour', base_price: '20000', capacity: '0' })
    const result = await updateService(SERVICE_ID, fd)
    expect(result).toEqual({ error: 'El cupo debe ser un número positivo.' })
  })

  it('re-reads the service type slug from the existing row rather than trusting the form — the type is immutable after creation', async () => {
    existingServiceSingle.mockResolvedValue({ data: { service_types: { slug: 'lodging' } } })
    serviceUpdateSelect.mockResolvedValue({ data: [{ id: SERVICE_ID }], error: null })

    // A client-supplied service_type_id (and attrs for a type other than the
    // real one) must be ignored — only attr_* fields for the real ('lodging')
    // slug are parsed.
    const fd = formData({
      name: 'Cabaña', base_price: '80000', service_type_id: SERVICE_TYPE_ID,
      attr_rooms: '2', attr_beds: '4', attr_duration_minutes: '999',
    })
    await updateService(SERVICE_ID, fd)

    expect(serviceUpdateSelect).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: { rooms: 2, beds: 4 } }), 'id', SERVICE_ID,
    )
  })
})

describe('toggleServiceStatus', () => {
  it('rejects a non-UUID serviceId', async () => {
    const result = await toggleServiceStatus('bad-id', 'active')
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
  })

  it('flips active to inactive', async () => {
    serviceUpdateSelect.mockResolvedValue({ data: [{ id: SERVICE_ID }], error: null })
    await toggleServiceStatus(SERVICE_ID, 'active')
    expect(serviceUpdateSelect).toHaveBeenCalledWith({ status: 'inactive' }, 'id', SERVICE_ID)
  })

  it('flips inactive to active', async () => {
    serviceUpdateSelect.mockResolvedValue({ data: [{ id: SERVICE_ID }], error: null })
    await toggleServiceStatus(SERVICE_ID, 'inactive')
    expect(serviceUpdateSelect).toHaveBeenCalledWith({ status: 'active' }, 'id', SERVICE_ID)
  })

  it('treats a silent RLS block as a failure', async () => {
    serviceUpdateSelect.mockResolvedValue({ data: [], error: null })
    const result = await toggleServiceStatus(SERVICE_ID, 'active')
    expect(result).toEqual({ error: 'No se pudo actualizar el estado. Intenta de nuevo.' })
  })
})

describe('uploadBusinessImage', () => {
  it('rejects a non-UUID businessId before any auth check', async () => {
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadBusinessImage('not-a-uuid', fd)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the business is not owned by the caller', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: null })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadBusinessImage(BIZ_ID, fd)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('treats a business with no images/videos fields yet as having zero media', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: undefined, videos: undefined } })
    storageUpload.mockResolvedValue({ error: null })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadBusinessImage(BIZ_ID, fd)

    expect(adminBusinessesUpdate).toHaveBeenCalledWith(
      { images: ['https://cdn.example.com/photo.webp'] }, 'id', BIZ_ID,
    )
  })

  it('rejects once the business already has 10 combined photos and videos', async () => {
    businessMediaMaybeSingle.mockResolvedValue({
      data: { id: BIZ_ID, images: Array(7).fill('https://x/img.webp'), videos: Array(3).fill('https://x/vid.mp4') },
    })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadBusinessImage(BIZ_ID, fd)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por negocio.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('rejects when no image file is provided', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    const fd = formData({})
    const result = await uploadBusinessImage(BIZ_ID, fd)
    expect(result).toEqual({ error: 'Selecciona una imagen.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('returns an error when the storage upload itself fails', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    storageUpload.mockResolvedValue({ error: { message: 'storage down' } })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadBusinessImage(BIZ_ID, fd)
    expect(result).toEqual({ error: 'No se pudo subir la imagen. Intenta de nuevo.' })
    expect(adminBusinessesUpdate).not.toHaveBeenCalled()
  })

  it('rejects a file that is not jpeg/png/webp', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    const fd = formData({})
    fd.set('image', fakeImageFile({ type: 'application/pdf' }))
    const result = await uploadBusinessImage(BIZ_ID, fd)
    expect(result).toEqual({ error: 'Formato no válido. Usa JPEG, PNG o WebP.' })
  })

  it('rejects a file over 5MB', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    const fd = formData({})
    fd.set('image', fakeImageFile({ size: 6 * 1024 * 1024 }))
    const result = await uploadBusinessImage(BIZ_ID, fd)
    expect(result).toEqual({ error: 'La imagen no puede superar 5 MB.' })
  })

  it('uploads and appends the new URL to the existing images array', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG, images: ['https://x/old.webp'], videos: [] } })
    storageUpload.mockResolvedValue({ error: null })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadBusinessImage(BIZ_ID, fd)

    expect(adminBusinessesUpdate).toHaveBeenCalledWith(
      { images: ['https://x/old.webp', 'https://cdn.example.com/photo.webp'] }, 'id', BIZ_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('removes the just-uploaded file from storage when saving the DB row fails (rollback)', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    storageUpload.mockResolvedValue({ error: null })
    adminBusinessesUpdate.mockResolvedValue({ error: { message: 'db error' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadBusinessImage(BIZ_ID, fd)

    expect(result).toEqual({ error: 'No se pudo guardar la imagen.' })
    expect(storageRemove).toHaveBeenCalled()
  })
})

function fakeVideoMeta(overrides: Partial<{ fileType: string; fileSize: number }> = {}) {
  return {
    fileName: 'clip.mp4',
    fileType: overrides.fileType ?? 'video/mp4',
    fileSize: overrides.fileSize ?? 10 * 1024 * 1024,
  }
}

describe('requestBusinessVideoUpload', () => {
  it('rejects a non-UUID businessId before any auth check', async () => {
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestBusinessVideoUpload('not-a-uuid', fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the business is not owned by the caller', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: null })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestBusinessVideoUpload(BIZ_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects once the business already has 10 combined photos and videos', async () => {
    businessMediaMaybeSingle.mockResolvedValue({
      data: { id: BIZ_ID, images: Array(5).fill('https://x/img.webp'), videos: Array(5).fill('https://x/vid.mp4') },
    })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestBusinessVideoUpload(BIZ_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por negocio.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects a video with an unsupported mime type', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    const { fileName, fileSize } = fakeVideoMeta()
    const result = await requestBusinessVideoUpload(BIZ_ID, fileName, 'video/avi', fileSize)
    expect(result).toEqual({ error: 'Formato no válido. Usa MP4, WebM o QuickTime.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects a video over 50MB', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    const { fileName, fileType } = fakeVideoMeta()
    const result = await requestBusinessVideoUpload(BIZ_ID, fileName, fileType, 51 * 1024 * 1024)
    expect(result).toEqual({ error: 'El video no puede superar 50 MB.' })
  })

  it('returns an error when creating the signed URL fails', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    storageCreateSignedUploadUrl.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestBusinessVideoUpload(BIZ_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'No se pudo iniciar la subida del video. Intenta de nuevo.' })
  })

  it('returns the signed upload token, path, and public URL on success', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    storageCreateSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok-1', path: `businesses/${BIZ_ID}/clip.mp4`, signedUrl: 'https://x/signed' },
      error: null,
    })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestBusinessVideoUpload(BIZ_ID, fileName, fileType, fileSize)

    expect(result).toEqual({
      token: 'tok-1',
      path: `businesses/${BIZ_ID}/clip.mp4`,
      publicUrl: 'https://cdn.example.com/photo.webp',
    })
    expect(storageCreateSignedUploadUrl).toHaveBeenCalledWith('business-videos', expect.stringContaining(`businesses/${BIZ_ID}/`))
  })
})

describe('confirmBusinessVideoUpload', () => {
  it('rejects a non-UUID businessId before any auth check', async () => {
    const result = await confirmBusinessVideoUpload('not-a-uuid', `businesses/not-a-uuid/clip.mp4`)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects a path that does not belong to this business, before any auth check', async () => {
    const result = await confirmBusinessVideoUpload(BIZ_ID, 'businesses/some-other-id/clip.mp4')
    expect(result).toEqual({ error: 'Video no válido.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the business is not owned by the caller', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: null })
    const result = await confirmBusinessVideoUpload(BIZ_ID, `businesses/${BIZ_ID}/clip.mp4`)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(adminBusinessesUpdate).not.toHaveBeenCalled()
  })

  it('rejects once the business already has 10 combined photos and videos', async () => {
    businessMediaMaybeSingle.mockResolvedValue({
      data: { id: BIZ_ID, images: Array(10).fill('https://x/img.webp'), videos: [] },
    })
    const result = await confirmBusinessVideoUpload(BIZ_ID, `businesses/${BIZ_ID}/clip.mp4`)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por negocio.' })
    expect(adminBusinessesUpdate).not.toHaveBeenCalled()
  })

  it('appends the server-derived public URL (not the raw path) to the existing videos array on success', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG, images: [], videos: ['https://x/old.mp4'] } })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await confirmBusinessVideoUpload(BIZ_ID, `businesses/${BIZ_ID}/new.mp4`)

    expect(adminBusinessesUpdate).toHaveBeenCalledWith(
      { videos: ['https://x/old.mp4', 'https://cdn.example.com/photo.webp'] }, 'id', BIZ_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('returns an error when saving the DB row fails', async () => {
    businessMediaMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: [], videos: [] } })
    adminBusinessesUpdate.mockResolvedValue({ error: { message: 'db error' } })

    const result = await confirmBusinessVideoUpload(BIZ_ID, `businesses/${BIZ_ID}/new.mp4`)

    expect(result).toEqual({ error: 'No se pudo guardar el video.' })
  })
})

describe('deleteBusinessVideo', () => {
  it('rejects a non-UUID businessId before any auth check', async () => {
    const result = await deleteBusinessVideo('not-a-uuid', 'https://x/a.mp4')
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the business is not owned by the caller', async () => {
    businessVideosMaybeSingle.mockResolvedValue({ data: null })
    const result = await deleteBusinessVideo(BIZ_ID, 'https://x/a.mp4')
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(adminBusinessesUpdate).not.toHaveBeenCalled()
  })

  it('removes the file from the video bucket and filters the URL out of the videos array', async () => {
    businessVideosMaybeSingle.mockResolvedValue({
      data: { id: BIZ_ID, slug: BIZ_SLUG, videos: ['https://x.supabase.co/storage/v1/object/public/business-videos/businesses/b1/a.mp4', 'https://x/keep.mp4'] },
    })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await deleteBusinessVideo(BIZ_ID, 'https://x.supabase.co/storage/v1/object/public/business-videos/businesses/b1/a.mp4')

    expect(storageRemove).toHaveBeenCalledWith('business-videos', ['businesses/b1/a.mp4'])
    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ videos: ['https://x/keep.mp4'] }, 'id', BIZ_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('treats a missing videos field as an empty array', async () => {
    businessVideosMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, videos: undefined } })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await deleteBusinessVideo(BIZ_ID, 'https://x/whatever.mp4')

    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ videos: [] }, 'id', BIZ_ID)
  })
})

describe('uploadServiceImage / deleteServiceImage — two-level ownership (service -> business)', () => {
  it('uploadServiceImage rejects a non-UUID serviceId before any auth check', async () => {
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadServiceImage('not-a-uuid', fd)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('uploadServiceImage rejects an invalid file type', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })

    const fd = formData({})
    fd.set('image', fakeImageFile({ type: 'application/pdf' }))
    const result = await uploadServiceImage(SERVICE_ID, fd)

    expect(result).toEqual({ error: 'Formato no válido. Usa JPEG, PNG o WebP.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('treats a service with no images field yet as having zero images', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: undefined, business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageUpload.mockResolvedValue({ error: null })
    adminServicesUpdate.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadServiceImage(SERVICE_ID, fd)

    expect(adminServicesUpdate).toHaveBeenCalledWith(
      { images: ['https://cdn.example.com/photo.webp'] }, 'id', SERVICE_ID,
    )
  })

  it('uploadServiceImage returns an error when the storage upload itself fails', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageUpload.mockResolvedValue({ error: { message: 'storage down' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadServiceImage(SERVICE_ID, fd)

    expect(result).toEqual({ error: 'No se pudo subir la imagen. Intenta de nuevo.' })
    expect(adminServicesUpdate).not.toHaveBeenCalled()
  })

  it('uploadServiceImage rejects when the service does not exist', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: null })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadServiceImage(SERVICE_ID, fd)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadServiceImage rejects when the service exists but its business is not owned by the caller', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadServiceImage(SERVICE_ID, fd)

    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('rejects once the service already has 10 combined photos and videos', async () => {
    serviceMaybeSingle.mockResolvedValue({
      data: { id: SERVICE_ID, images: Array(6).fill('https://x/img.webp'), videos: Array(4).fill('https://x/vid.mp4'), business_id: BIZ_ID },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadServiceImage(SERVICE_ID, fd)

    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por servicio.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadServiceImage appends the new URL to the service images array on success', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: ['https://x/old.webp'], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    storageUpload.mockResolvedValue({ error: null })
    adminServicesUpdate.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadServiceImage(SERVICE_ID, fd)

    expect(adminServicesUpdate).toHaveBeenCalledWith(
      { images: ['https://x/old.webp', 'https://cdn.example.com/photo.webp'] }, 'id', SERVICE_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('uploadServiceImage removes the just-uploaded file from storage when saving the DB row fails (rollback)', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageUpload.mockResolvedValue({ error: null })
    adminServicesUpdate.mockResolvedValue({ error: { message: 'db error' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadServiceImage(SERVICE_ID, fd)

    expect(result).toEqual({ error: 'No se pudo guardar la imagen.' })
    expect(storageRemove).toHaveBeenCalled()
  })

  it('deleteServiceImage removes the file from storage and filters the URL out of the images array', async () => {
    serviceMaybeSingle.mockResolvedValue({
      data: { id: SERVICE_ID, business_id: BIZ_ID, images: ['https://x.supabase.co/storage/v1/object/public/business-images/services/s1/a.webp', 'https://x/keep.webp'] },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    adminServicesUpdate.mockResolvedValue({ error: null })

    await deleteServiceImage(SERVICE_ID, 'https://x.supabase.co/storage/v1/object/public/business-images/services/s1/a.webp')

    expect(storageRemove).toHaveBeenCalledWith('business-images', ['services/s1/a.webp'])
    expect(adminServicesUpdate).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, 'id', SERVICE_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('deleteServiceImage rejects when the caller does not own the service\'s business', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, business_id: BIZ_ID, images: [] } })
    businessOwnershipSingle.mockResolvedValue({ data: null })

    const result = await deleteServiceImage(SERVICE_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(adminServicesUpdate).not.toHaveBeenCalled()
  })

  it('deleteServiceImage rejects a non-UUID serviceId before any auth check', async () => {
    const result = await deleteServiceImage('not-a-uuid', 'https://x/a.webp')
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('deleteServiceImage rejects when the service does not exist', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: null })
    const result = await deleteServiceImage(SERVICE_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(storageRemove).not.toHaveBeenCalled()
  })

  it('deleteServiceImage skips storage removal when the URL does not match the bucket path (still filters it out)', async () => {
    serviceMaybeSingle.mockResolvedValue({
      data: { id: SERVICE_ID, business_id: BIZ_ID, images: ['https://cdn.other.com/random.webp', 'https://x/keep.webp'] },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminServicesUpdate.mockResolvedValue({ error: null })

    await deleteServiceImage(SERVICE_ID, 'https://cdn.other.com/random.webp')

    expect(storageRemove).not.toHaveBeenCalled()
    expect(adminServicesUpdate).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, 'id', SERVICE_ID)
  })

  it('deleteServiceImage treats a missing images field as an empty array', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, business_id: BIZ_ID, images: undefined } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminServicesUpdate.mockResolvedValue({ error: null })

    await deleteServiceImage(SERVICE_ID, 'https://x/whatever.webp')

    expect(adminServicesUpdate).toHaveBeenCalledWith({ images: [] }, 'id', SERVICE_ID)
  })
})

describe('requestServiceVideoUpload', () => {
  it('rejects a non-UUID serviceId before any auth check', async () => {
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestServiceVideoUpload('not-a-uuid', fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the service does not exist', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: null })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestServiceVideoUpload(SERVICE_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects when the service exists but its business is not owned by the caller', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: null })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestServiceVideoUpload(SERVICE_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects once the service already has 10 combined photos and videos', async () => {
    serviceMaybeSingle.mockResolvedValue({
      data: { id: SERVICE_ID, images: Array(10).fill('https://x/img.webp'), videos: [], business_id: BIZ_ID },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestServiceVideoUpload(SERVICE_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por servicio.' })
  })

  it('rejects a video with an unsupported mime type', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const { fileName, fileSize } = fakeVideoMeta()
    const result = await requestServiceVideoUpload(SERVICE_ID, fileName, 'video/avi', fileSize)
    expect(result).toEqual({ error: 'Formato no válido. Usa MP4, WebM o QuickTime.' })
  })

  it('returns the signed upload token, path, and public URL on success', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageCreateSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok-1', path: `services/${SERVICE_ID}/clip.mp4`, signedUrl: 'https://x/signed' },
      error: null,
    })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestServiceVideoUpload(SERVICE_ID, fileName, fileType, fileSize)

    expect(result).toEqual({
      token: 'tok-1',
      path: `services/${SERVICE_ID}/clip.mp4`,
      publicUrl: 'https://cdn.example.com/photo.webp',
    })
    expect(storageCreateSignedUploadUrl).toHaveBeenCalledWith('business-videos', expect.stringContaining(`services/${SERVICE_ID}/`))
  })
})

describe('confirmServiceVideoUpload', () => {
  it('rejects a path that does not belong to this service, before any auth check', async () => {
    const result = await confirmServiceVideoUpload(SERVICE_ID, 'services/some-other-id/clip.mp4')
    expect(result).toEqual({ error: 'Video no válido.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the service exists but its business is not owned by the caller', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: null })
    const result = await confirmServiceVideoUpload(SERVICE_ID, `services/${SERVICE_ID}/clip.mp4`)
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(adminServicesUpdate).not.toHaveBeenCalled()
  })

  it('appends the server-derived public URL (not the raw path) to the existing videos array on success', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], videos: ['https://x/old.mp4'], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    adminServicesUpdate.mockResolvedValue({ error: null })

    await confirmServiceVideoUpload(SERVICE_ID, `services/${SERVICE_ID}/new.mp4`)

    expect(adminServicesUpdate).toHaveBeenCalledWith(
      { videos: ['https://x/old.mp4', 'https://cdn.example.com/photo.webp'] }, 'id', SERVICE_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('returns an error when saving the DB row fails', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminServicesUpdate.mockResolvedValue({ error: { message: 'db error' } })

    const result = await confirmServiceVideoUpload(SERVICE_ID, `services/${SERVICE_ID}/new.mp4`)

    expect(result).toEqual({ error: 'No se pudo guardar el video.' })
  })
})

describe('deleteServiceVideo', () => {
  it('rejects when the caller does not own the service\'s business', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, business_id: BIZ_ID, videos: [] } })
    businessOwnershipSingle.mockResolvedValue({ data: null })

    const result = await deleteServiceVideo(SERVICE_ID, 'https://x/a.mp4')
    expect(result).toEqual({ error: 'Servicio no encontrado.' })
    expect(adminServicesUpdate).not.toHaveBeenCalled()
  })

  it('removes the file from the video bucket and filters the URL out of the videos array', async () => {
    serviceMaybeSingle.mockResolvedValue({
      data: { id: SERVICE_ID, business_id: BIZ_ID, videos: ['https://x.supabase.co/storage/v1/object/public/business-videos/services/s1/a.mp4', 'https://x/keep.mp4'] },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    adminServicesUpdate.mockResolvedValue({ error: null })

    await deleteServiceVideo(SERVICE_ID, 'https://x.supabase.co/storage/v1/object/public/business-videos/services/s1/a.mp4')

    expect(storageRemove).toHaveBeenCalledWith('business-videos', ['services/s1/a.mp4'])
    expect(adminServicesUpdate).toHaveBeenCalledWith({ videos: ['https://x/keep.mp4'] }, 'id', SERVICE_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('treats a missing videos field as an empty array', async () => {
    serviceMaybeSingle.mockResolvedValue({ data: { id: SERVICE_ID, business_id: BIZ_ID, videos: undefined } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminServicesUpdate.mockResolvedValue({ error: null })

    await deleteServiceVideo(SERVICE_ID, 'https://x/whatever.mp4')

    expect(adminServicesUpdate).toHaveBeenCalledWith({ videos: [] }, 'id', SERVICE_ID)
  })
})

describe('deleteBusinessImage', () => {
  it('rejects a non-UUID businessId before any auth check', async () => {
    const result = await deleteBusinessImage('not-a-uuid', 'https://x/a.webp')
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the business is not owned by the caller', async () => {
    businessImagesMaybeSingle.mockResolvedValue({ data: null })
    const result = await deleteBusinessImage(BIZ_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(adminBusinessesUpdate).not.toHaveBeenCalled()
  })

  it('removes the file from storage and filters the URL out of the images array', async () => {
    businessImagesMaybeSingle.mockResolvedValue({
      data: { id: BIZ_ID, slug: BIZ_SLUG, images: ['https://x.supabase.co/storage/v1/object/public/business-images/businesses/b1/a.webp', 'https://x/keep.webp'] },
    })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await deleteBusinessImage(BIZ_ID, 'https://x.supabase.co/storage/v1/object/public/business-images/businesses/b1/a.webp')

    expect(storageRemove).toHaveBeenCalledWith('business-images', ['businesses/b1/a.webp'])
    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, 'id', BIZ_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('skips storage removal when the URL does not match the bucket path (still filters it out)', async () => {
    businessImagesMaybeSingle.mockResolvedValue({
      data: { id: BIZ_ID, images: ['https://cdn.other.com/random.webp', 'https://x/keep.webp'] },
    })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await deleteBusinessImage(BIZ_ID, 'https://cdn.other.com/random.webp')

    expect(storageRemove).not.toHaveBeenCalled()
    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, 'id', BIZ_ID)
  })

  it('treats a missing images field as an empty array', async () => {
    businessImagesMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, images: undefined } })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await deleteBusinessImage(BIZ_ID, 'https://x/whatever.webp')

    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ images: [] }, 'id', BIZ_ID)
  })
})
