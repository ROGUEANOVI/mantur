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
const businessInsertSingle = vi.fn()
const commissionUpdateSelect = vi.fn()
const roleRequestSingle = vi.fn()
const roleRequestStatusUpdate = vi.fn()
const cancelOtherPending = vi.fn()
const profileRoleUpdate = vi.fn()
const categoriesSelect = vi.fn()
const categoryLinksInsert = vi.fn()
const transportersInsert = vi.fn()
const touristGuidesInsert = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      switch (table) {
        case 'businesses':
          return {
            update: (payload: unknown) => ({
              eq: (col: string, val: string) => ({ select: () => businessesUpdateSelect(payload, col, val) }),
            }),
            insert: (payload: unknown) => ({ select: () => ({ single: () => businessInsertSingle(payload) }) }),
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
        default:
          throw new Error(`unexpected table on admin client: ${table}`)
      }
    },
  })),
}))

const {
  approveBusiness,
  rejectBusiness,
  updateCommissionRate,
  approveRoleRequest,
  rejectRoleRequest,
} = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const BIZ_ID = '11111111-1111-1111-1111-111111111111'
const CONFIG_ID = '22222222-2222-2222-2222-222222222222'
const REQUEST_ID = '33333333-3333-3333-3333-333333333333'
const USER_ID = '44444444-4444-4444-4444-444444444444'
const ADMIN_ID = 'admin-1'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: ADMIN_ID } } })
  adminProfileSingle.mockResolvedValue({ data: { role: 'admin' } })
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
