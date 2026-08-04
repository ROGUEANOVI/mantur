import { describe, it, expect, vi, beforeEach } from 'vitest'

// Targets the admin server actions with the most business risk: the
// approve/reject business gate, commission-rate editing (money-adjacent —
// this is the number every future transaction reads), and role-request
// approval (auto-provisions businesses/transporters/tourist_guides from
// applicant-supplied metadata). Supabase and Next.js navigation/cache are
// fully mocked — nothing here touches a real database or RLS policy.

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
const adminProfileSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: adminProfileSingle }) }) }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const businessesUpdateSelect = vi.fn()
const businessesUpdateAwait = vi.fn()
const businessInsertSingle = vi.fn()
const businessInsertAwait = vi.fn()
const commissionUpdateSelect = vi.fn()
const roleRequestSingle = vi.fn()
const roleRequestStatusUpdate = vi.fn()
const cancelOtherPending = vi.fn()
const profileRoleUpdate = vi.fn()
const categoriesSelect = vi.fn()
const categoryLinksInsert = vi.fn()
const transportersInsert = vi.fn()
const touristGuidesInsert = vi.fn()

const placeInsertAwait = vi.fn()
const placeUpdateSelect = vi.fn()
const placeUpdateAwait = vi.fn()
const placeDeleteEq = vi.fn()
const placeImagesMaybeSingle = vi.fn()
const storageUpload = vi.fn()
const storageGetPublicUrl = vi.fn()
const storageRemove = vi.fn()

function businessesUpdateChain(payload: unknown) {
  return {
    eq: (col: string, val: string) => ({
      select: () => businessesUpdateSelect(payload, col, val),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(businessesUpdateAwait(payload, col, val))),
    }),
  }
}

function businessesInsertChain(payload: unknown) {
  return {
    select: () => ({ single: () => businessInsertSingle(payload) }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(businessInsertAwait(payload))),
  }
}

function placeUpdateChain(payload: unknown) {
  return {
    eq: (col: string, val: string) => ({
      select: () => placeUpdateSelect(payload, col, val),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(placeUpdateAwait(payload, col, val))),
    }),
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      switch (table) {
        case 'businesses':
          return {
            update: (payload: unknown) => businessesUpdateChain(payload),
            insert: (payload: unknown) => businessesInsertChain(payload),
          }
        case 'commission_config':
          return {
            update: (payload: unknown) => ({
              eq: (col: string, val: string) => ({ select: () => commissionUpdateSelect(payload, col, val) }),
            }),
          }
        case 'role_requests':
          return {
            select: () => ({ eq: () => ({ single: roleRequestSingle }) }),
            update: (payload: unknown) => ({
              eq: (col: string, val: string) => {
                if (col === 'id') {
                  roleRequestStatusUpdate(payload, val)
                  return Promise.resolve({ error: null })
                }
                // cancel-other-pending: .eq('user_id', ...).eq('status', 'pending').neq('id', ...)
                return {
                  eq: (col2: string, val2: string) => ({
                    neq: (col3: string, val3: string) =>
                      cancelOtherPending(payload, { [col]: val }, { [col2]: val2 }, { [col3]: val3 }),
                  }),
                }
              },
            }),
          }
        case 'profiles':
          return { update: (payload: unknown) => ({ eq: (col: string, val: string) => profileRoleUpdate(payload, col, val) }) }
        case 'business_categories':
          return {
            select: () => ({
              in: (col: string, vals: string[]) => ({
                eq: (col2: string, val2: boolean) => categoriesSelect(col, vals, col2, val2),
              }),
            }),
          }
        case 'business_category_links':
          return { insert: (payload: unknown) => categoryLinksInsert(payload) }
        case 'transporters':
          return { insert: (payload: unknown) => transportersInsert(payload) }
        case 'tourist_guides':
          return { insert: (payload: unknown) => touristGuidesInsert(payload) }
        case 'places':
          return {
            insert: (payload: unknown) => placeInsertAwait(payload),
            update: (payload: unknown) => placeUpdateChain(payload),
            delete: () => ({ eq: (col: string, val: string) => placeDeleteEq(col, val) }),
            select: () => ({ eq: () => ({ maybeSingle: placeImagesMaybeSingle }) }),
          }
        default:
          throw new Error(`unexpected table on admin client: ${table}`)
      }
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: unknown, opts: unknown) => storageUpload(bucket, path, file, opts),
        getPublicUrl: (path: string) => storageGetPublicUrl(bucket, path),
        remove: (paths: string[]) => storageRemove(bucket, paths),
      }),
    },
  })),
}))

const {
  approveBusiness,
  rejectBusiness,
  forceDeactivateBusiness,
  forceActivateBusiness,
  toggleFeaturedBusiness,
  createBusinessAsAdmin,
  updateCommissionRate,
  approveRoleRequest,
  rejectRoleRequest,
  createPlace,
  updatePlace,
  deletePlace,
  uploadPlaceImage,
  deletePlaceImage,
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
  return new File([new Uint8Array(overrides.size ?? 1024)], 'photo.jpg', { type: overrides.type ?? 'image/jpeg' })
}

const BIZ_ID = '11111111-1111-1111-1111-111111111111'
const CONFIG_ID = '22222222-2222-2222-2222-222222222222'
const REQUEST_ID = '33333333-3333-3333-3333-333333333333'
const USER_ID = '44444444-4444-4444-4444-444444444444'
const ADMIN_ID = 'admin-1'
const OWNER_ID = '55555555-5555-5555-5555-555555555555'
const PLACE_ID = '66666666-6666-6666-6666-666666666666'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } })
  adminProfileSingle.mockResolvedValue({ data: { role: 'admin' } })
  storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.webp' } })
})

describe('getAuthenticatedAdmin guard (shared by every action in this file)', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    const fd = formData({ businessId: BIZ_ID })
    await expect(approveBusiness(fd)).rejects.toThrow('redirect:/login')
    expect(businessesUpdateSelect).not.toHaveBeenCalled()
  })

  it('redirects to / when the authenticated user is not an admin', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ businessId: BIZ_ID })
    await expect(approveBusiness(fd)).rejects.toThrow('redirect:/')
    expect(businessesUpdateSelect).not.toHaveBeenCalled()
  })
})

describe('approveBusiness / rejectBusiness', () => {
  it('redirects without querying the DB when businessId is not a UUID', async () => {
    const fd = formData({ businessId: 'not-a-uuid' })
    await expect(approveBusiness(fd)).rejects.toThrow('redirect:/admin/negocios')
    expect(businessesUpdateSelect).not.toHaveBeenCalled()
  })

  it('approveBusiness sets status=active and verified=true, targeting the right business', async () => {
    businessesUpdateSelect.mockResolvedValue({ data: [{ id: BIZ_ID }], error: null })
    const fd = formData({ businessId: BIZ_ID })
    await approveBusiness(fd)

    expect(businessesUpdateSelect).toHaveBeenCalledWith({ status: 'active', verified: true }, 'id', BIZ_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/negocios')
    expect(revalidatePathMock).toHaveBeenCalledWith('/negocios')
  })

  it('rejectBusiness sets status=rejected and verified=false, targeting the right business', async () => {
    businessesUpdateSelect.mockResolvedValue({ data: [{ id: BIZ_ID }], error: null })
    const fd = formData({ businessId: BIZ_ID })
    await rejectBusiness(fd)

    expect(businessesUpdateSelect).toHaveBeenCalledWith({ status: 'rejected', verified: false }, 'id', BIZ_ID)
  })

  it('redirects when the update fails to find a matching row', async () => {
    businessesUpdateSelect.mockResolvedValue({ data: [], error: null })
    const fd = formData({ businessId: BIZ_ID })
    await expect(approveBusiness(fd)).rejects.toThrow('redirect:/admin/negocios')
  })

  it('redirects to / when a non-admin calls rejectBusiness', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    const fd = formData({ businessId: BIZ_ID })
    await expect(rejectBusiness(fd)).rejects.toThrow('redirect:/')
    expect(businessesUpdateSelect).not.toHaveBeenCalled()
  })
})

describe('updateCommissionRate', () => {
  it('rejects a non-UUID configId', async () => {
    const fd = formData({ configId: 'bad-id', rate: '10' })
    const result = await updateCommissionRate(fd)
    expect(result).toEqual({ error: 'Configuración no encontrada.' })
    expect(commissionUpdateSelect).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric rate', async () => {
    const fd = formData({ configId: CONFIG_ID, rate: 'abc' })
    const result = await updateCommissionRate(fd)
    expect(result).toEqual({ error: 'La tasa debe ser un número entre 0 y 100.' })
  })

  it('rejects a negative rate', async () => {
    const fd = formData({ configId: CONFIG_ID, rate: '-1' })
    const result = await updateCommissionRate(fd)
    expect(result).toEqual({ error: 'La tasa debe ser un número entre 0 y 100.' })
  })

  it('rejects a rate above 100', async () => {
    const fd = formData({ configId: CONFIG_ID, rate: '100.5' })
    const result = await updateCommissionRate(fd)
    expect(result).toEqual({ error: 'La tasa debe ser un número entre 0 y 100.' })
  })

  it('accepts the boundary values 0 and 100', async () => {
    commissionUpdateSelect.mockResolvedValue({ data: [{ id: CONFIG_ID }], error: null })

    const fd0 = formData({ configId: CONFIG_ID, rate: '0' })
    expect(await updateCommissionRate(fd0)).toEqual({ success: true })

    const fd100 = formData({ configId: CONFIG_ID, rate: '100' })
    expect(await updateCommissionRate(fd100)).toEqual({ success: true })
  })

  it('stamps updated_by with the acting admin id, targets the right config row, and returns a generic error when no row matches', async () => {
    commissionUpdateSelect.mockResolvedValue({ data: [], error: null })
    const fd = formData({ configId: CONFIG_ID, rate: '15' })
    const result = await updateCommissionRate(fd)

    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
    expect(commissionUpdateSelect).toHaveBeenCalledWith({ rate: 15, updated_by: ADMIN_ID }, 'id', CONFIG_ID)
  })

  it('redirects to / when a non-admin tries to change the commission rate', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'transporter' } })
    const fd = formData({ configId: CONFIG_ID, rate: '15' })
    await expect(updateCommissionRate(fd)).rejects.toThrow('redirect:/')
    expect(commissionUpdateSelect).not.toHaveBeenCalled()
  })
})

describe('approveRoleRequest', () => {
  it('redirects when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'bad-id' })
    await expect(approveRoleRequest(fd)).rejects.toThrow('redirect:/admin/solicitudes')
    expect(roleRequestSingle).not.toHaveBeenCalled()
  })

  it('redirects when the request is not found', async () => {
    roleRequestSingle.mockResolvedValue({ data: null })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(approveRoleRequest(fd)).rejects.toThrow('redirect:/admin/solicitudes')
  })

  it('redirects when requested_role is not one of the valid roles', async () => {
    roleRequestSingle.mockResolvedValue({ data: { user_id: USER_ID, requested_role: 'admin', metadata: {} } })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(approveRoleRequest(fd)).rejects.toThrow('redirect:/admin/solicitudes')
    expect(profileRoleUpdate).not.toHaveBeenCalled()
  })

  it('business_owner: promotes the profile, creates the business, and links matching active categories', async () => {
    roleRequestSingle.mockResolvedValue({
      data: {
        user_id: USER_ID,
        requested_role: 'business_owner',
        metadata: { business_name: 'Finca La Esperanza', phone: '3001234567', category_slugs: ['finca', 'balneario'] },
      },
    })
    businessInsertSingle.mockResolvedValue({ data: { id: 'new-biz-1' } })
    categoriesSelect.mockResolvedValue({ data: [{ id: 'cat-finca' }, { id: 'cat-balneario' }] })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(profileRoleUpdate).toHaveBeenCalledWith({ role: 'business_owner' }, 'id', USER_ID)
    expect(businessInsertSingle).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Finca La Esperanza', owner_id: USER_ID, phone: '3001234567', status: 'active', verified: true }),
    )
    expect(categoriesSelect).toHaveBeenCalledWith('slug', ['finca', 'balneario'], 'is_active', true)
    expect(categoryLinksInsert).toHaveBeenCalledWith([
      { business_id: 'new-biz-1', category_id: 'cat-finca' },
      { business_id: 'new-biz-1', category_id: 'cat-balneario' },
    ])
    expect(cancelOtherPending).toHaveBeenCalled()
  })

  it('business_owner: hardcodes status/verified regardless of conflicting applicant-supplied metadata', async () => {
    roleRequestSingle.mockResolvedValue({
      data: {
        user_id: USER_ID,
        requested_role: 'business_owner',
        // An applicant can't actually submit these fields through the real
        // form, but the server must not trust them even if metadata is
        // ever extended or tampered with upstream.
        metadata: { business_name: 'Finca Falsa', status: 'active', verified: true, owner_id: 'someone-else' },
      },
    })
    businessInsertSingle.mockResolvedValue({ data: { id: 'new-biz-2' } })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(businessInsertSingle).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: USER_ID, status: 'active', verified: true }),
    )
  })

  it('business_owner: skips business creation entirely when business_name is missing from metadata', async () => {
    roleRequestSingle.mockResolvedValue({
      data: { user_id: USER_ID, requested_role: 'business_owner', metadata: {} },
    })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(profileRoleUpdate).toHaveBeenCalledWith({ role: 'business_owner' }, 'id', USER_ID)
    expect(businessInsertSingle).not.toHaveBeenCalled()
  })

  it('transporter: creates a transporters row with the plate uppercased', async () => {
    roleRequestSingle.mockResolvedValue({
      data: {
        user_id: USER_ID,
        requested_role: 'transporter',
        metadata: { vehicle_type: 'motocarro', license_plate: ' abc-123 ', phone: '3009876543' },
      },
    })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(transportersInsert).toHaveBeenCalledWith({
      profile_id: USER_ID,
      vehicle_type: 'motocarro',
      license_plate: 'ABC-123',
      phone: '3009876543',
      is_available: false,
    })
  })

  it('transporter: is_available is hardcoded to false even if metadata claims otherwise', async () => {
    roleRequestSingle.mockResolvedValue({
      data: {
        user_id: USER_ID,
        requested_role: 'transporter',
        metadata: { vehicle_type: 'moto', license_plate: 'XYZ-999', phone: '3000000000', is_available: true },
      },
    })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(transportersInsert).toHaveBeenCalledWith(expect.objectContaining({ is_available: false }))
  })

  it('tourist_guide: creates a tourist_guides row from the applicant metadata', async () => {
    roleRequestSingle.mockResolvedValue({
      data: {
        user_id: USER_ID,
        requested_role: 'tourist_guide',
        metadata: { specialties: ['ecoturismo'], languages: ['es', 'en'], bio: 'Guía local', phone: '3005551234' },
      },
    })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(touristGuidesInsert).toHaveBeenCalledWith({
      profile_id: USER_ID,
      specialties: ['ecoturismo'],
      languages: ['es', 'en'],
      bio: 'Guía local',
      phone: '3005551234',
      is_available: false,
    })
  })

  it('tourist_guide: is_available is hardcoded to false even if metadata claims otherwise', async () => {
    roleRequestSingle.mockResolvedValue({
      data: {
        user_id: USER_ID,
        requested_role: 'tourist_guide',
        metadata: { specialties: [], languages: [], bio: null, phone: '3000000000', is_available: true },
      },
    })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(touristGuidesInsert).toHaveBeenCalledWith(expect.objectContaining({ is_available: false }))
  })

  it('redirects to / when a non-admin tries to approve a role request', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(approveRoleRequest(fd)).rejects.toThrow('redirect:/')
    expect(roleRequestSingle).not.toHaveBeenCalled()
  })

  it('always cancels the applicant\'s other pending requests, keyed off this request id', async () => {
    roleRequestSingle.mockResolvedValue({
      data: { user_id: USER_ID, requested_role: 'transporter', metadata: {} },
    })

    const fd = formData({ requestId: REQUEST_ID })
    await approveRoleRequest(fd)

    expect(cancelOtherPending).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
      { user_id: USER_ID },
      { status: 'pending' },
      { id: REQUEST_ID },
    )
  })
})

describe('rejectRoleRequest', () => {
  it('redirects when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'bad-id', rejection_reason: 'No cumple los requisitos' })
    await expect(rejectRoleRequest(fd)).rejects.toThrow('redirect:/admin/solicitudes')
  })

  it('redirects when the rejection reason is missing', async () => {
    const fd = formData({ requestId: REQUEST_ID, rejection_reason: '' })
    await expect(rejectRoleRequest(fd)).rejects.toThrow('redirect:/admin/solicitudes')
  })

  it('redirects when the rejection reason is only whitespace', async () => {
    const fd = formData({ requestId: REQUEST_ID, rejection_reason: '   ' })
    await expect(rejectRoleRequest(fd)).rejects.toThrow('redirect:/admin/solicitudes')
  })

  it('updates the request with the trimmed rejection reason', async () => {
    roleRequestStatusUpdate.mockReturnValue(undefined)
    const fd = formData({ requestId: REQUEST_ID, rejection_reason: '  No cumple los requisitos  ' })
    await rejectRoleRequest(fd)

    expect(roleRequestStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', rejection_reason: 'No cumple los requisitos' }),
      REQUEST_ID,
    )
  })

  it('redirects to / when a non-admin tries to reject a role request', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist_guide' } })
    const fd = formData({ requestId: REQUEST_ID, rejection_reason: 'No cumple los requisitos' })
    await expect(rejectRoleRequest(fd)).rejects.toThrow('redirect:/')
    expect(roleRequestStatusUpdate).not.toHaveBeenCalled()
  })
})

describe('forceDeactivateBusiness / forceActivateBusiness', () => {
  it('redirects without querying the DB when businessId is not a UUID', async () => {
    const fd = formData({ businessId: 'not-a-uuid' })
    await expect(forceDeactivateBusiness(fd)).rejects.toThrow('redirect:/admin/negocios')
    expect(businessesUpdateAwait).not.toHaveBeenCalled()
  })

  it('forceDeactivateBusiness sets status=inactive, no ownership filter (admin override)', async () => {
    businessesUpdateAwait.mockResolvedValue({ error: null })
    const fd = formData({ businessId: BIZ_ID })
    await forceDeactivateBusiness(fd)

    expect(businessesUpdateAwait).toHaveBeenCalledWith({ status: 'inactive' }, 'id', BIZ_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/negocios')
    expect(revalidatePathMock).toHaveBeenCalledWith('/negocios')
  })

  it('forceActivateBusiness sets status=active AND verified=true', async () => {
    businessesUpdateAwait.mockResolvedValue({ error: null })
    const fd = formData({ businessId: BIZ_ID })
    await forceActivateBusiness(fd)

    expect(businessesUpdateAwait).toHaveBeenCalledWith({ status: 'active', verified: true }, 'id', BIZ_ID)
  })

  it('redirects to / when a non-admin calls forceActivateBusiness', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ businessId: BIZ_ID })
    await expect(forceActivateBusiness(fd)).rejects.toThrow('redirect:/')
    expect(businessesUpdateAwait).not.toHaveBeenCalled()
  })

  it('redirects to / when a non-admin calls forceDeactivateBusiness', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    const fd = formData({ businessId: BIZ_ID })
    await expect(forceDeactivateBusiness(fd)).rejects.toThrow('redirect:/')
    expect(businessesUpdateAwait).not.toHaveBeenCalled()
  })
})

describe('toggleFeaturedBusiness', () => {
  it('redirects without querying the DB when businessId is not a UUID', async () => {
    const fd = formData({ businessId: 'not-a-uuid', featured: 'true' })
    await expect(toggleFeaturedBusiness(fd)).rejects.toThrow('redirect:/admin/negocios')
  })

  it('sets is_featured=true when featured="true"', async () => {
    businessesUpdateAwait.mockResolvedValue({ error: null })
    const fd = formData({ businessId: BIZ_ID, featured: 'true' })
    await toggleFeaturedBusiness(fd)
    expect(businessesUpdateAwait).toHaveBeenCalledWith({ is_featured: true }, 'id', BIZ_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('sets is_featured=false for any value other than the literal string "true"', async () => {
    businessesUpdateAwait.mockResolvedValue({ error: null })
    const fd = formData({ businessId: BIZ_ID, featured: 'false' })
    await toggleFeaturedBusiness(fd)
    expect(businessesUpdateAwait).toHaveBeenCalledWith({ is_featured: false }, 'id', BIZ_ID)
  })

  it('redirects to / when a non-admin calls toggleFeaturedBusiness', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ businessId: BIZ_ID, featured: 'true' })
    await expect(toggleFeaturedBusiness(fd)).rejects.toThrow('redirect:/')
    expect(businessesUpdateAwait).not.toHaveBeenCalled()
  })
})

describe('createBusinessAsAdmin', () => {
  it('rejects a missing name', async () => {
    const fd = formData({ name: ' ', type: 'restaurant', ownerId: OWNER_ID })
    const result = await createBusinessAsAdmin(fd)
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(businessInsertAwait).not.toHaveBeenCalled()
  })

  it('rejects an invalid type', async () => {
    const fd = formData({ name: 'Finca X', type: 'not-a-real-type', ownerId: OWNER_ID })
    const result = await createBusinessAsAdmin(fd)
    expect(result).toEqual({ error: 'Selecciona un tipo.' })
  })

  it('rejects a non-UUID ownerId', async () => {
    const fd = formData({ name: 'Finca X', type: 'restaurant', ownerId: 'not-a-uuid' })
    const result = await createBusinessAsAdmin(fd)
    expect(result).toEqual({ error: 'Selecciona un propietario.' })
  })

  it('creates the business already active and verified — unlike owner self-registration, which starts pending', async () => {
    businessInsertAwait.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Finca X', type: 'restaurant', ownerId: OWNER_ID, phone: '3001234567' })
    const result = await createBusinessAsAdmin(fd)

    expect(result).toEqual({ success: true })
    expect(businessInsertAwait).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: OWNER_ID, status: 'active', verified: true }),
    )
  })

  // Regression: description/address/phone were cast straight to string and
  // .trim()'d with no null guard, crashing when a field was entirely absent
  // from formData (not just empty). Found by /qa on 2026-08-04 while
  // extending this suite.
  it('does not crash when description/address/phone are missing from formData entirely', async () => {
    businessInsertAwait.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set('name', 'Finca X')
    fd.set('type', 'restaurant')
    fd.set('ownerId', OWNER_ID)
    const result = await createBusinessAsAdmin(fd)
    expect(result).toEqual({ success: true })
    expect(businessInsertAwait).toHaveBeenCalledWith(
      expect.objectContaining({ description: null, address: null, phone: null }),
    )
  })

  it('returns a generic error when the insert fails', async () => {
    businessInsertAwait.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ name: 'Finca X', type: 'restaurant', ownerId: OWNER_ID })
    const result = await createBusinessAsAdmin(fd)
    expect(result).toEqual({ error: 'Error al crear el negocio. Intenta de nuevo.' })
  })

  it('redirects to / when a non-admin calls createBusinessAsAdmin', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'business_owner' } })
    const fd = formData({ name: 'Finca X', type: 'restaurant', ownerId: OWNER_ID })
    await expect(createBusinessAsAdmin(fd)).rejects.toThrow('redirect:/')
    expect(businessInsertAwait).not.toHaveBeenCalled()
  })
})

describe('createPlace / updatePlace / deletePlace', () => {
  it('createPlace rejects a missing name', async () => {
    const fd = formData({ name: ' ', type: 'waterfall' })
    const result = await createPlace(fd)
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(placeInsertAwait).not.toHaveBeenCalled()
  })

  it('createPlace rejects an invalid type', async () => {
    const fd = formData({ name: 'Pozo Azul', type: 'not-a-real-type' })
    const result = await createPlace(fd)
    expect(result).toEqual({ error: 'Selecciona un tipo.' })
  })

  it('createPlace rejects non-numeric coordinates', async () => {
    const fd = formData({ name: 'Pozo Azul', type: 'river', lat: 'abc', lng: '-72.99' })
    const result = await createPlace(fd)
    expect(result).toEqual({ error: 'Las coordenadas deben ser números válidos.' })
  })

  it('createPlace accepts missing coordinates as null (they are optional)', async () => {
    placeInsertAwait.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Pozo Azul', type: 'river' })
    await expect(createPlace(fd)).rejects.toThrow('redirect:/admin/lugares')
    expect(placeInsertAwait).toHaveBeenCalledWith(expect.objectContaining({ lat: null, lng: null }))
  })

  it('createPlace inserts valid coordinates and redirects', async () => {
    placeInsertAwait.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Pozo Azul', type: 'river', lat: '11.7808', lng: '-72.9944' })
    await expect(createPlace(fd)).rejects.toThrow('redirect:/admin/lugares')
    expect(placeInsertAwait).toHaveBeenCalledWith(expect.objectContaining({ lat: 11.7808, lng: -72.9944 }))
  })

  it('does not crash when description is missing from formData entirely (regression)', async () => {
    placeInsertAwait.mockResolvedValue({ error: null })
    const fd = new FormData()
    fd.set('name', 'Pozo Azul')
    fd.set('type', 'river')
    await expect(createPlace(fd)).rejects.toThrow('redirect:/admin/lugares')
    expect(placeInsertAwait).toHaveBeenCalledWith(expect.objectContaining({ description: null }))
  })

  it('redirects to / when a non-admin calls createPlace', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ name: 'Pozo Azul', type: 'river' })
    await expect(createPlace(fd)).rejects.toThrow('redirect:/')
    expect(placeInsertAwait).not.toHaveBeenCalled()
  })

  it('updatePlace returns notFound (not a redirect) for a non-UUID placeId', async () => {
    const fd = formData({ placeId: 'bad-id', name: 'X', type: 'river' })
    const result = await updatePlace(fd)
    expect(result).toEqual({ error: 'Lugar no encontrado.' })
  })

  it('updatePlace redirects on a successful update (row returned)', async () => {
    placeUpdateSelect.mockResolvedValue({ data: [{ id: PLACE_ID }], error: null })
    const fd = formData({ placeId: PLACE_ID, name: 'Pozo Azul actualizado', type: 'river' })
    await expect(updatePlace(fd)).rejects.toThrow('redirect:/admin/lugares')
    expect(placeUpdateSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pozo Azul actualizado' }), 'id', PLACE_ID)
  })

  it('updatePlace returns a generic error when no row matches', async () => {
    placeUpdateSelect.mockResolvedValue({ data: [], error: null })
    const fd = formData({ placeId: PLACE_ID, name: 'X', type: 'river' })
    const result = await updatePlace(fd)
    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
  })

  it('updatePlace does not crash when description is missing from formData entirely (regression)', async () => {
    placeUpdateSelect.mockResolvedValue({ data: [{ id: PLACE_ID }], error: null })
    const fd = new FormData()
    fd.set('placeId', PLACE_ID)
    fd.set('name', 'Pozo Azul')
    fd.set('type', 'river')
    await expect(updatePlace(fd)).rejects.toThrow('redirect:/admin/lugares')
    expect(placeUpdateSelect).toHaveBeenCalledWith(expect.objectContaining({ description: null }), 'id', PLACE_ID)
  })

  it('redirects to / when a non-admin calls updatePlace', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ placeId: PLACE_ID, name: 'X', type: 'river' })
    await expect(updatePlace(fd)).rejects.toThrow('redirect:/')
    expect(placeUpdateSelect).not.toHaveBeenCalled()
  })

  it('deletePlace redirects without querying for a non-UUID placeId', async () => {
    const fd = formData({ placeId: 'bad-id' })
    await expect(deletePlace(fd)).rejects.toThrow('redirect:/admin/lugares')
    expect(placeDeleteEq).not.toHaveBeenCalled()
  })

  it('deletePlace deletes by id and redirects', async () => {
    const fd = formData({ placeId: PLACE_ID })
    await expect(deletePlace(fd)).rejects.toThrow('redirect:/admin/lugares')
    expect(placeDeleteEq).toHaveBeenCalledWith('id', PLACE_ID)
  })

  it('redirects to / when a non-admin calls deletePlace', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({ placeId: PLACE_ID })
    await expect(deletePlace(fd)).rejects.toThrow('redirect:/')
    expect(placeDeleteEq).not.toHaveBeenCalled()
  })
})

describe('uploadPlaceImage / deletePlaceImage', () => {
  it('uploadPlaceImage rejects a non-UUID placeId before any auth check', async () => {
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPlaceImage('bad-id', fd)
    expect(result).toEqual({ error: 'Lugar no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('uploadPlaceImage rejects when the place does not exist', async () => {
    placeImagesMaybeSingle.mockResolvedValue({ data: null })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPlaceImage(PLACE_ID, fd)
    expect(result).toEqual({ error: 'Lugar no encontrado.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadPlaceImage rejects at the 5-image cap', async () => {
    placeImagesMaybeSingle.mockResolvedValue({ data: { id: PLACE_ID, images: Array(5).fill('https://x/i.webp') } })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPlaceImage(PLACE_ID, fd)
    expect(result).toEqual({ error: 'Máximo 5 fotos por lugar.' })
  })

  it('uploadPlaceImage rejects an invalid file type', async () => {
    placeImagesMaybeSingle.mockResolvedValue({ data: { id: PLACE_ID, images: [] } })
    const fd = formData({})
    fd.set('image', fakeImageFile({ type: 'application/pdf' }))
    const result = await uploadPlaceImage(PLACE_ID, fd)
    expect(result).toEqual({ error: 'Formato no válido. Usa JPEG, PNG o WebP.' })
  })

  it('uploadPlaceImage appends the new URL on success', async () => {
    placeImagesMaybeSingle.mockResolvedValue({ data: { id: PLACE_ID, images: ['https://x/old.webp'] } })
    storageUpload.mockResolvedValue({ error: null })
    placeUpdateAwait.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadPlaceImage(PLACE_ID, fd)

    expect(placeUpdateAwait).toHaveBeenCalledWith(
      { images: ['https://x/old.webp', 'https://cdn.example.com/photo.webp'] }, 'id', PLACE_ID,
    )
  })

  it('uploadPlaceImage rolls back the uploaded file when the DB update fails', async () => {
    placeImagesMaybeSingle.mockResolvedValue({ data: { id: PLACE_ID, images: [] } })
    storageUpload.mockResolvedValue({ error: null })
    placeUpdateAwait.mockResolvedValue({ error: { message: 'db error' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPlaceImage(PLACE_ID, fd)

    expect(result).toEqual({ error: 'No se pudo guardar la imagen.' })
    expect(storageRemove).toHaveBeenCalled()
  })

  it('deletePlaceImage rejects a non-UUID placeId before any auth check', async () => {
    const result = await deletePlaceImage('bad-id', 'https://x/a.webp')
    expect(result).toEqual({ error: 'Lugar no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('deletePlaceImage removes the file from storage and filters the URL out of the images array', async () => {
    placeImagesMaybeSingle.mockResolvedValue({
      data: { id: PLACE_ID, images: ['https://x.supabase.co/storage/v1/object/public/place-images/places/p1/a.webp', 'https://x/keep.webp'] },
    })
    placeUpdateAwait.mockResolvedValue({ error: null })

    await deletePlaceImage(PLACE_ID, 'https://x.supabase.co/storage/v1/object/public/place-images/places/p1/a.webp')

    expect(storageRemove).toHaveBeenCalledWith('place-images', ['places/p1/a.webp'])
    expect(placeUpdateAwait).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, 'id', PLACE_ID)
  })

  it('redirects to / when a non-admin calls uploadPlaceImage (well-formed id, past the UUID check)', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    await expect(uploadPlaceImage(PLACE_ID, fd)).rejects.toThrow('redirect:/')
    expect(placeImagesMaybeSingle).not.toHaveBeenCalled()
  })

  it('redirects to / when a non-admin calls deletePlaceImage (well-formed id, past the UUID check)', async () => {
    adminProfileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(deletePlaceImage(PLACE_ID, 'https://x/a.webp')).rejects.toThrow('redirect:/')
    expect(placeImagesMaybeSingle).not.toHaveBeenCalled()
  })
})
