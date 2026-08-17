import { describe, it, expect, vi, beforeEach } from 'vitest'

// Covers the business/experience CRUD and image actions a business owner
// uses. The recurring pattern worth protecting here is ownership: every
// mutation must be scoped to businesses/experiences the caller actually
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

const authGetUser = vi.fn()
const profileSingle = vi.fn()

const businessInsertSingle = vi.fn()
const businessUpdateMock = vi.fn()
const businessDeleteEq = vi.fn()
const businessOwnershipSingle = vi.fn() // select('id').eq(id).eq(owner_id).single() — createExperience
const businessReactivateMaybeSingle = vi.fn() // select('id, verified')... .maybeSingle() — reactivateBusiness
const businessImagesMaybeSingle = vi.fn() // select('id, images')... .maybeSingle() — deleteBusinessImage
const businessMediaMaybeSingle = vi.fn() // select('id, images, videos')... .maybeSingle() — upload/requestBusinessVideoUpload/confirmBusinessVideoUpload
const businessVideosMaybeSingle = vi.fn() // select('id, videos')... .maybeSingle() — deleteBusinessVideo

const categoryLinksInsertMock = vi.fn()
const categoryLinksDeleteMock = vi.fn()

const experienceInsertMock = vi.fn()
const experienceUpdateSelect = vi.fn()
const experienceMaybeSingle = vi.fn() // select(...).eq(id).maybeSingle() — upload/deleteExperienceImage

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
        // createExperience uses .single(), requestExperienceVideoUpload uses
        // .maybeSingle() for the same "is this business mine" check — neither
        // revalidates a public negocio path, so no slug is needed here.
        return { eq: () => ({ eq: () => ({ single: businessOwnershipSingle, maybeSingle: businessOwnershipSingle }) }) }
      }
      if (cols === 'id, slug') {
        // uploadExperienceImage/deleteExperienceImage/confirmExperienceVideoUpload/
        // deleteExperienceVideo — same ownership check as above, but these do
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

function experiencesUserTable() {
  return {
    insert: (payload: unknown) => experienceInsertMock(payload),
    update: (payload: unknown) => ({
      eq: (col: string, val: string) => ({ select: () => experienceUpdateSelect(payload, col, val) }),
    }),
    select: () => ({ eq: () => ({ maybeSingle: experienceMaybeSingle }) }),
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
      if (table === 'experiences') return experiencesUserTable()
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const adminBusinessesUpdate = vi.fn()
const adminExperiencesUpdate = vi.fn()
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
      if (table === 'experiences') {
        return { update: (payload: unknown) => ({ eq: (col: string, val: string) => adminExperiencesUpdate(payload, col, val) }) }
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
  deactivateBusiness,
  reactivateBusiness,
  createExperience,
  updateExperience,
  toggleExperienceStatus,
  uploadBusinessImage,
  uploadExperienceImage,
  deleteExperienceImage,
  deleteBusinessImage,
  requestBusinessVideoUpload,
  confirmBusinessVideoUpload,
  deleteBusinessVideo,
  requestExperienceVideoUpload,
  confirmExperienceVideoUpload,
  deleteExperienceVideo,
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
const EXP_ID = '22222222-2222-2222-2222-222222222222'
const CAT_ID_1 = '33333333-3333-3333-3333-333333333333'
const CAT_ID_2 = '44444444-4444-4444-4444-444444444444'
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

describe('deactivateBusiness / reactivateBusiness', () => {
  it('deactivateBusiness silently returns (no redirect) for a non-UUID id', async () => {
    await deactivateBusiness('bad-id', new FormData())
    expect(redirectMock).not.toHaveBeenCalled()
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('deactivateBusiness scopes the update to id AND owner_id and redirects on success', async () => {
    businessUpdateMock.mockResolvedValue({ error: null })
    await expect(deactivateBusiness(BIZ_ID, new FormData())).rejects.toThrow('redirect:/mi-negocio')
    expect(businessUpdateMock).toHaveBeenCalledWith({ status: 'inactive' }, 'id', BIZ_ID, 'owner_id', USER_ID)
  })

  it('deactivateBusiness silently returns (no redirect) when the update fails (e.g. RLS blocks a non-owner)', async () => {
    businessUpdateMock.mockResolvedValue({ error: { message: 'rls blocked' } })
    await deactivateBusiness(BIZ_ID, new FormData())
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('reactivateBusiness silently returns (no redirect) for a non-UUID id', async () => {
    await reactivateBusiness('bad-id', new FormData())
    expect(redirectMock).not.toHaveBeenCalled()
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('reactivateBusiness silently returns when the admin update fails', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, verified: true } })
    adminBusinessesUpdate.mockResolvedValue({ error: { message: 'db error' } })
    await reactivateBusiness(BIZ_ID, new FormData())
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('reactivateBusiness restores a verified business directly to active', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, verified: true } })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await expect(reactivateBusiness(BIZ_ID, new FormData())).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}`)
    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ status: 'active' }, 'id', BIZ_ID)
  })

  it('reactivateBusiness sends an unverified business back to pending, not active', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: { id: BIZ_ID, verified: false } })
    adminBusinessesUpdate.mockResolvedValue({ error: null })

    await expect(reactivateBusiness(BIZ_ID, new FormData())).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}`)
    expect(adminBusinessesUpdate).toHaveBeenCalledWith({ status: 'pending' }, 'id', BIZ_ID)
  })

  it('reactivateBusiness does nothing when the business is not owned/not inactive', async () => {
    businessReactivateMaybeSingle.mockResolvedValue({ data: null })
    await reactivateBusiness(BIZ_ID, new FormData())
    expect(adminBusinessesUpdate).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

describe('createExperience', () => {
  it('rejects a non-UUID business_id before querying the DB', async () => {
    const fd = formData({ business_id: 'not-a-uuid', name: 'Tour', price: '10000' })
    const result = await createExperience(fd)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(businessOwnershipSingle).not.toHaveBeenCalled()
  })

  it('rejects when the business is not owned by the caller', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: null })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', price: '10000' })
    const result = await createExperience(fd)
    expect(result).toEqual({ error: 'Negocio no encontrado.' })
    expect(experienceInsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid price', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', price: '-5' })
    const result = await createExperience(fd)
    expect(result).toEqual({ error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' })
  })

  it('rejects an invalid capacity', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', price: '10000', capacity: '0' })
    const result = await createExperience(fd)
    expect(result).toEqual({ error: 'El cupo debe ser un número positivo.' })
  })

  it('rejects an invalid duration', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', price: '10000', duration_minutes: '0' })
    const result = await createExperience(fd)
    expect(result).toEqual({ error: 'La duración debe ser un número positivo.' })
  })

  it('returns a generic error when the insert fails', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    experienceInsertMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ business_id: BIZ_ID, name: 'Tour', price: '10000' })
    const result = await createExperience(fd)
    expect(result).toEqual({ error: 'No se pudo crear la experiencia. Intenta de nuevo.' })
  })

  it('creates the experience scoped to the owned business and redirects', async () => {
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    experienceInsertMock.mockResolvedValue({ error: null })

    const fd = formData({ business_id: BIZ_ID, name: 'Tour por el río', price: '15000', capacity: '10', duration_minutes: '60' })
    await expect(createExperience(fd)).rejects.toThrow(`redirect:/mi-negocio/${BIZ_ID}/experiencias`)

    expect(experienceInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ business_id: BIZ_ID, name: 'Tour por el río', price: 15000, capacity: 10, duration_minutes: 60, status: 'active' }),
    )
  })
})

describe('updateExperience', () => {
  it('rejects a non-UUID experienceId', async () => {
    const fd = formData({ name: 'X', price: '1000' })
    const result = await updateExperience('bad-id', fd)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects an invalid price', async () => {
    const fd = formData({ name: 'X', price: 'abc' })
    const result = await updateExperience(EXP_ID, fd)
    expect(result).toEqual({ error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' })
  })

  it('updates on success (row returned) with no redirect, just revalidation', async () => {
    experienceUpdateSelect.mockResolvedValue({ data: [{ id: EXP_ID }], error: null })
    const fd = formData({ name: 'Tour actualizado', price: '20000' })

    await updateExperience(EXP_ID, fd)

    expect(experienceUpdateSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tour actualizado', price: 20000 }), 'id', EXP_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-negocio', 'layout')
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('treats a silent RLS block (no error, zero rows) as a failure', async () => {
    experienceUpdateSelect.mockResolvedValue({ data: [], error: null })
    const fd = formData({ name: 'Tour actualizado', price: '20000' })

    const result = await updateExperience(EXP_ID, fd)
    expect(result).toEqual({ error: 'No se pudo actualizar la experiencia. Intenta de nuevo.' })
  })

  it('rejects an invalid capacity', async () => {
    const fd = formData({ name: 'Tour', price: '20000', capacity: '0' })
    const result = await updateExperience(EXP_ID, fd)
    expect(result).toEqual({ error: 'El cupo debe ser un número positivo.' })
  })

  it('rejects an invalid duration', async () => {
    const fd = formData({ name: 'Tour', price: '20000', duration_minutes: '0' })
    const result = await updateExperience(EXP_ID, fd)
    expect(result).toEqual({ error: 'La duración debe ser un número positivo.' })
  })
})

describe('toggleExperienceStatus', () => {
  it('rejects a non-UUID experienceId', async () => {
    const result = await toggleExperienceStatus('bad-id', 'active')
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
  })

  it('flips active to inactive', async () => {
    experienceUpdateSelect.mockResolvedValue({ data: [{ id: EXP_ID }], error: null })
    await toggleExperienceStatus(EXP_ID, 'active')
    expect(experienceUpdateSelect).toHaveBeenCalledWith({ status: 'inactive' }, 'id', EXP_ID)
  })

  it('flips inactive to active', async () => {
    experienceUpdateSelect.mockResolvedValue({ data: [{ id: EXP_ID }], error: null })
    await toggleExperienceStatus(EXP_ID, 'inactive')
    expect(experienceUpdateSelect).toHaveBeenCalledWith({ status: 'active' }, 'id', EXP_ID)
  })

  it('treats a silent RLS block as a failure', async () => {
    experienceUpdateSelect.mockResolvedValue({ data: [], error: null })
    const result = await toggleExperienceStatus(EXP_ID, 'active')
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

describe('uploadExperienceImage / deleteExperienceImage — two-level ownership (experience -> business)', () => {
  it('uploadExperienceImage rejects a non-UUID experienceId before any auth check', async () => {
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadExperienceImage('not-a-uuid', fd)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('uploadExperienceImage rejects an invalid file type', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })

    const fd = formData({})
    fd.set('image', fakeImageFile({ type: 'application/pdf' }))
    const result = await uploadExperienceImage(EXP_ID, fd)

    expect(result).toEqual({ error: 'Formato no válido. Usa JPEG, PNG o WebP.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('treats an experience with no images field yet as having zero images', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: undefined, business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageUpload.mockResolvedValue({ error: null })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadExperienceImage(EXP_ID, fd)

    expect(adminExperiencesUpdate).toHaveBeenCalledWith(
      { images: ['https://cdn.example.com/photo.webp'] }, 'id', EXP_ID,
    )
  })

  it('uploadExperienceImage returns an error when the storage upload itself fails', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageUpload.mockResolvedValue({ error: { message: 'storage down' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadExperienceImage(EXP_ID, fd)

    expect(result).toEqual({ error: 'No se pudo subir la imagen. Intenta de nuevo.' })
    expect(adminExperiencesUpdate).not.toHaveBeenCalled()
  })

  it('uploadExperienceImage rejects when the experience does not exist', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: null })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadExperienceImage(EXP_ID, fd)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadExperienceImage rejects when the experience exists but its business is not owned by the caller', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadExperienceImage(EXP_ID, fd)

    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('rejects once the experience already has 10 combined photos and videos', async () => {
    experienceMaybeSingle.mockResolvedValue({
      data: { id: EXP_ID, images: Array(6).fill('https://x/img.webp'), videos: Array(4).fill('https://x/vid.mp4'), business_id: BIZ_ID },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadExperienceImage(EXP_ID, fd)

    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por actividad.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadExperienceImage appends the new URL to the experience images array on success', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: ['https://x/old.webp'], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    storageUpload.mockResolvedValue({ error: null })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadExperienceImage(EXP_ID, fd)

    expect(adminExperiencesUpdate).toHaveBeenCalledWith(
      { images: ['https://x/old.webp', 'https://cdn.example.com/photo.webp'] }, 'id', EXP_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('uploadExperienceImage removes the just-uploaded file from storage when saving the DB row fails (rollback)', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageUpload.mockResolvedValue({ error: null })
    adminExperiencesUpdate.mockResolvedValue({ error: { message: 'db error' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadExperienceImage(EXP_ID, fd)

    expect(result).toEqual({ error: 'No se pudo guardar la imagen.' })
    expect(storageRemove).toHaveBeenCalled()
  })

  it('deleteExperienceImage removes the file from storage and filters the URL out of the images array', async () => {
    experienceMaybeSingle.mockResolvedValue({
      data: { id: EXP_ID, business_id: BIZ_ID, images: ['https://x.supabase.co/storage/v1/object/public/business-images/experiences/e1/a.webp', 'https://x/keep.webp'] },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    await deleteExperienceImage(EXP_ID, 'https://x.supabase.co/storage/v1/object/public/business-images/experiences/e1/a.webp')

    expect(storageRemove).toHaveBeenCalledWith('business-images', ['experiences/e1/a.webp'])
    expect(adminExperiencesUpdate).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, 'id', EXP_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('deleteExperienceImage rejects when the caller does not own the experience\'s business', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, business_id: BIZ_ID, images: [] } })
    businessOwnershipSingle.mockResolvedValue({ data: null })

    const result = await deleteExperienceImage(EXP_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(adminExperiencesUpdate).not.toHaveBeenCalled()
  })

  it('deleteExperienceImage rejects a non-UUID experienceId before any auth check', async () => {
    const result = await deleteExperienceImage('not-a-uuid', 'https://x/a.webp')
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('deleteExperienceImage rejects when the experience does not exist', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: null })
    const result = await deleteExperienceImage(EXP_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(storageRemove).not.toHaveBeenCalled()
  })

  it('deleteExperienceImage skips storage removal when the URL does not match the bucket path (still filters it out)', async () => {
    experienceMaybeSingle.mockResolvedValue({
      data: { id: EXP_ID, business_id: BIZ_ID, images: ['https://cdn.other.com/random.webp', 'https://x/keep.webp'] },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    await deleteExperienceImage(EXP_ID, 'https://cdn.other.com/random.webp')

    expect(storageRemove).not.toHaveBeenCalled()
    expect(adminExperiencesUpdate).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, 'id', EXP_ID)
  })

  it('deleteExperienceImage treats a missing images field as an empty array', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, business_id: BIZ_ID, images: undefined } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    await deleteExperienceImage(EXP_ID, 'https://x/whatever.webp')

    expect(adminExperiencesUpdate).toHaveBeenCalledWith({ images: [] }, 'id', EXP_ID)
  })
})

describe('requestExperienceVideoUpload', () => {
  it('rejects a non-UUID experienceId before any auth check', async () => {
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestExperienceVideoUpload('not-a-uuid', fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the experience does not exist', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: null })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestExperienceVideoUpload(EXP_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects when the experience exists but its business is not owned by the caller', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: null })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestExperienceVideoUpload(EXP_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects once the experience already has 10 combined photos and videos', async () => {
    experienceMaybeSingle.mockResolvedValue({
      data: { id: EXP_ID, images: Array(10).fill('https://x/img.webp'), videos: [], business_id: BIZ_ID },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestExperienceVideoUpload(EXP_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por actividad.' })
  })

  it('rejects a video with an unsupported mime type', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    const { fileName, fileSize } = fakeVideoMeta()
    const result = await requestExperienceVideoUpload(EXP_ID, fileName, 'video/avi', fileSize)
    expect(result).toEqual({ error: 'Formato no válido. Usa MP4, WebM o QuickTime.' })
  })

  it('returns the signed upload token, path, and public URL on success', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    storageCreateSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok-1', path: `experiences/${EXP_ID}/clip.mp4`, signedUrl: 'https://x/signed' },
      error: null,
    })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestExperienceVideoUpload(EXP_ID, fileName, fileType, fileSize)

    expect(result).toEqual({
      token: 'tok-1',
      path: `experiences/${EXP_ID}/clip.mp4`,
      publicUrl: 'https://cdn.example.com/photo.webp',
    })
    expect(storageCreateSignedUploadUrl).toHaveBeenCalledWith('business-videos', expect.stringContaining(`experiences/${EXP_ID}/`))
  })
})

describe('confirmExperienceVideoUpload', () => {
  it('rejects a path that does not belong to this experience, before any auth check', async () => {
    const result = await confirmExperienceVideoUpload(EXP_ID, 'experiences/some-other-id/clip.mp4')
    expect(result).toEqual({ error: 'Video no válido.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the experience exists but its business is not owned by the caller', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: null })
    const result = await confirmExperienceVideoUpload(EXP_ID, `experiences/${EXP_ID}/clip.mp4`)
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(adminExperiencesUpdate).not.toHaveBeenCalled()
  })

  it('appends the server-derived public URL (not the raw path) to the existing videos array on success', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], videos: ['https://x/old.mp4'], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    await confirmExperienceVideoUpload(EXP_ID, `experiences/${EXP_ID}/new.mp4`)

    expect(adminExperiencesUpdate).toHaveBeenCalledWith(
      { videos: ['https://x/old.mp4', 'https://cdn.example.com/photo.webp'] }, 'id', EXP_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('returns an error when saving the DB row fails', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, images: [], videos: [], business_id: BIZ_ID } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminExperiencesUpdate.mockResolvedValue({ error: { message: 'db error' } })

    const result = await confirmExperienceVideoUpload(EXP_ID, `experiences/${EXP_ID}/new.mp4`)

    expect(result).toEqual({ error: 'No se pudo guardar el video.' })
  })
})

describe('deleteExperienceVideo', () => {
  it('rejects when the caller does not own the experience\'s business', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, business_id: BIZ_ID, videos: [] } })
    businessOwnershipSingle.mockResolvedValue({ data: null })

    const result = await deleteExperienceVideo(EXP_ID, 'https://x/a.mp4')
    expect(result).toEqual({ error: 'Experiencia no encontrada.' })
    expect(adminExperiencesUpdate).not.toHaveBeenCalled()
  })

  it('removes the file from the video bucket and filters the URL out of the videos array', async () => {
    experienceMaybeSingle.mockResolvedValue({
      data: { id: EXP_ID, business_id: BIZ_ID, videos: ['https://x.supabase.co/storage/v1/object/public/business-videos/experiences/e1/a.mp4', 'https://x/keep.mp4'] },
    })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID, slug: BIZ_SLUG } })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    await deleteExperienceVideo(EXP_ID, 'https://x.supabase.co/storage/v1/object/public/business-videos/experiences/e1/a.mp4')

    expect(storageRemove).toHaveBeenCalledWith('business-videos', ['experiences/e1/a.mp4'])
    expect(adminExperiencesUpdate).toHaveBeenCalledWith({ videos: ['https://x/keep.mp4'] }, 'id', EXP_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/negocios/${BIZ_SLUG}`)
  })

  it('treats a missing videos field as an empty array', async () => {
    experienceMaybeSingle.mockResolvedValue({ data: { id: EXP_ID, business_id: BIZ_ID, videos: undefined } })
    businessOwnershipSingle.mockResolvedValue({ data: { id: BIZ_ID } })
    adminExperiencesUpdate.mockResolvedValue({ error: null })

    await deleteExperienceVideo(EXP_ID, 'https://x/whatever.mp4')

    expect(adminExperiencesUpdate).toHaveBeenCalledWith({ videos: [] }, 'id', EXP_ID)
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
