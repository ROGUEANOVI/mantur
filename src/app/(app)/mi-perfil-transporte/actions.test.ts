import { describe, it, expect, vi, beforeEach } from 'vitest'

// acceptTransportRequest is the atomic first-one-wins claim CLAUDE.md calls
// out explicitly ("acceptTransportRequest uses service_role to guarantee
// first-one-wins"). The safety property lives entirely in which columns the
// UPDATE filters on (id + status='pending'), since Postgres's row-level
// atomicity is what makes concurrent claims safe — this suite exists to
// prove those exact filters are the ones sent, not to re-test Postgres
// itself. markCompleted additionally filters on transporter_id, which is
// the only thing stopping one transporter from completing another's ride.

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
const transporterLookupSingle = vi.fn()
const currentAvailabilitySingle = vi.fn()
const toggleUpdateMock = vi.fn()
const userStorageUpload = vi.fn()
const userStorageRemove = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      }
      if (table === 'transporters') {
        return {
          select: (cols: string) => ({
            eq: () => ({ single: cols === 'is_available' ? currentAvailabilitySingle : transporterLookupSingle }),
          }),
          update: (payload: unknown) => ({ eq: (col: string, val: string) => toggleUpdateMock(payload, col, val) }),
        }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: unknown, opts: unknown) => userStorageUpload(bucket, path, file, opts),
        remove: (paths: string[]) => userStorageRemove(bucket, paths),
      }),
    },
  })),
}))

const transportRequestsUpdateMock = vi.fn()
const transportRequestsEqMock = vi.fn()

function transportRequestsChain(payload: unknown) {
  transportRequestsUpdateMock(payload)
  const chain: PromiseLike<{ error: null }> & { eq: (col: string, val: unknown) => typeof chain } = {
    eq: (col: string, val: unknown) => {
      transportRequestsEqMock(col, val)
      return chain
    },
    then: (resolve: (v: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
  } as unknown as PromiseLike<{ error: null }> & { eq: (col: string, val: unknown) => typeof chain }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'transport_requests') {
        return { update: (payload: unknown) => transportRequestsChain(payload) }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const { toggleAvailability, acceptTransportRequest, markCompleted, updateTransporterProfile } = await import('./actions')

function formData(fields: Record<string, string | File>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function fakeComplianceFile(name = 'doc.pdf', type = 'application/pdf') {
  return new File(['x'], name, { type })
}

const TRANSPORTER_ID = '11111111-1111-1111-1111-111111111111'
const REQUEST_ID = '22222222-2222-2222-2222-222222222222'
const FUTURE_DATE = '2099-01-01'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'transporter' } })
  transporterLookupSingle.mockResolvedValue({ data: { id: TRANSPORTER_ID, transport_tier: 'independent' } })
  userStorageUpload.mockResolvedValue({ error: null })
  userStorageRemove.mockResolvedValue({ error: null })
  toggleUpdateMock.mockResolvedValue({ error: null })
})

describe('getAuthenticatedTransporter guard (shared by every action in this file)', () => {
  it('redirects to /login when there is no authenticated user', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(toggleAvailability()).rejects.toThrow('redirect:/login')
    expect(transporterLookupSingle).not.toHaveBeenCalled()
  })

  it('redirects to / when the authenticated user is not a transporter', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(toggleAvailability()).rejects.toThrow('redirect:/')
    expect(transporterLookupSingle).not.toHaveBeenCalled()
  })

  it('redirects to / when the role is transporter but no transporters row exists for this profile', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    await expect(toggleAvailability()).rejects.toThrow('redirect:/')
  })
})

describe('toggleAvailability', () => {
  it('flips is_available from true to false', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: true } })
    toggleUpdateMock.mockResolvedValue({ error: null })

    await toggleAvailability()

    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_available: false }, 'id', TRANSPORTER_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte')
    expect(revalidatePathMock).toHaveBeenCalledWith('/transportistas')
  })

  it('flips is_available from false to true', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: false } })
    toggleUpdateMock.mockResolvedValue({ error: null })

    await toggleAvailability()

    expect(toggleUpdateMock).toHaveBeenCalledWith({ is_available: true }, 'id', TRANSPORTER_ID)
  })

  it('returns a generic error when the current row cannot be read', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: null })
    const result = await toggleAvailability()
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the update fails', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: true } })
    toggleUpdateMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await toggleAvailability()
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('acceptTransportRequest', () => {
  it('does nothing (no DB call, no revalidation) when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'not-a-uuid' })
    await acceptTransportRequest(fd)
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('claims the request by filtering on id AND status=pending — the atomicity guarantee', async () => {
    const fd = formData({ requestId: REQUEST_ID })
    await acceptTransportRequest(fd)

    expect(transportRequestsUpdateMock).toHaveBeenCalledWith({ transporter_id: TRANSPORTER_ID, status: 'accepted' })
    // Both filters must be present — dropping the status='pending' filter
    // would let a transporter "steal" an already-accepted request.
    expect(transportRequestsEqMock).toHaveBeenCalledWith('id', REQUEST_ID)
    expect(transportRequestsEqMock).toHaveBeenCalledWith('status', 'pending')
    expect(transportRequestsEqMock).toHaveBeenCalledTimes(2)
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte')
  })

  it('redirects to / when the caller is not a registered transporter', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(acceptTransportRequest(fd)).rejects.toThrow('redirect:/')
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
  })
})

describe('markCompleted', () => {
  it('does nothing (no DB call, no revalidation) when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'nope' })
    await markCompleted(fd)
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('redirects to / when the caller is not a registered transporter', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(markCompleted(fd)).rejects.toThrow('redirect:/')
    expect(transportRequestsUpdateMock).not.toHaveBeenCalled()
  })

  it('filters on id, the caller\'s own transporter_id, AND status=accepted — an ownership check', async () => {
    const fd = formData({ requestId: REQUEST_ID })
    await markCompleted(fd)

    expect(transportRequestsUpdateMock).toHaveBeenCalledWith({ status: 'completed' })
    // transporter_id here comes from the authenticated session (getAuthenticatedTransporter),
    // never from formData — a transporter can't complete a ride that isn't theirs
    // by passing a different id in the request.
    expect(transportRequestsEqMock).toHaveBeenCalledWith('id', REQUEST_ID)
    expect(transportRequestsEqMock).toHaveBeenCalledWith('transporter_id', TRANSPORTER_ID)
    expect(transportRequestsEqMock).toHaveBeenCalledWith('status', 'accepted')
    expect(transportRequestsEqMock).toHaveBeenCalledTimes(3)
  })

  it('ignores a client-supplied transporter_id in formData and still filters by the session transporter', async () => {
    // The real form never sends this field, but the action must not read
    // it even if it did — ownership has to come from the authenticated
    // session, never from client input, or transporter A could complete
    // transporter B's ride by guessing/spoofing a form field.
    const fd = formData({ requestId: REQUEST_ID, transporterId: 'attacker-controlled-uuid', transporter_id: 'attacker-controlled-uuid' })
    await markCompleted(fd)

    expect(transportRequestsEqMock).toHaveBeenCalledWith('transporter_id', TRANSPORTER_ID)
    expect(transportRequestsEqMock).not.toHaveBeenCalledWith('transporter_id', 'attacker-controlled-uuid')
  })
})

describe('updateTransporterProfile', () => {
  it('rejects a missing/invalid transport_tier', async () => {
    const fd = formData({ transport_tier: 'freelance' })
    const result = await updateTransporterProfile(fd)
    expect(result).toEqual({ error: 'Selecciona cómo prestas el servicio.' })
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('does nothing when the tier is unchanged and no new document is uploaded', async () => {
    const fd = formData({ transport_tier: 'independent' })
    const result = await updateTransporterProfile(fd)
    expect(result).toBeUndefined()
    expect(toggleUpdateMock).not.toHaveBeenCalled()
    expect(userStorageUpload).not.toHaveBeenCalled()
  })

  it('requires a document when switching from independent to cooperative', async () => {
    const fd = formData({
      transport_tier: 'cooperative',
      cooperative_name: 'TransManaure', cooperative_rnt_number: '99999', cooperative_habilitacion_number: 'HAB-1',
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toEqual({ error: 'Adjunta el documento correspondiente para cambiar de modalidad.' })
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  // Security regression: the tier-change gate must be derived from the
  // caller's real DB row (transporterLookupSingle here stands in for that),
  // never from a client-supplied field — a spoofed "current tier" claiming
  // no change was happening would otherwise let only one of the two
  // required documents be uploaded when actually switching tiers.
  it('still requires both documents when switching tiers, even if the request tries to claim the tier is unchanged', async () => {
    transporterLookupSingle.mockResolvedValue({ data: { id: TRANSPORTER_ID, transport_tier: 'cooperative' } })
    const fd = formData({
      transport_tier: 'independent',
      driver_license_number: '123', driver_license_expiry: FUTURE_DATE,
      driver_license_document: fakeComplianceFile('lic.pdf'),
      // soat_document intentionally omitted — real current tier is
      // 'cooperative', so this is a tier switch requiring both documents.
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toEqual({ error: 'Adjunta el documento correspondiente para cambiar de modalidad.' })
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects a cooperative document uploaded without its paired text fields', async () => {
    const fd = formData({
      transport_tier: 'cooperative',
      cooperative_document: fakeComplianceFile(),
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
  })

  it('uploads a new cooperative document, updates the fields, and resets verification_status', async () => {
    const fd = formData({
      transport_tier: 'cooperative',
      cooperative_name: 'TransManaure', cooperative_rnt_number: '99999', cooperative_habilitacion_number: 'HAB-1',
      cooperative_document: fakeComplianceFile('coop.pdf'),
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toBeUndefined()

    expect(toggleUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transport_tier: 'cooperative',
        cooperative_name: 'TransManaure',
        cooperative_rnt_number: '99999',
        cooperative_habilitacion_number: 'HAB-1',
        cooperative_document_path: expect.stringMatching(/^user-1\/cooperativa-\d+-[a-z0-9]+\.pdf$/),
        verification_status: 'pending_review',
      }),
      'profile_id', 'user-1',
    )
  })

  it('rejects a driver_license_expiry that already passed', async () => {
    const fd = formData({
      transport_tier: 'independent',
      driver_license_number: '123', driver_license_expiry: '2020-01-01',
      driver_license_document: fakeComplianceFile('lic.pdf'),
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toEqual({ error: 'La fecha de vencimiento debe ser válida y no puede ser una fecha pasada.' })
  })

  it('uploads a new driver license document independently of SOAT', async () => {
    const fd = formData({
      transport_tier: 'independent',
      driver_license_number: '12345678', driver_license_expiry: FUTURE_DATE,
      driver_license_document: fakeComplianceFile('lic.pdf'),
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toBeUndefined()

    expect(toggleUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transport_tier: 'independent',
        driver_license_number: '12345678',
        driver_license_expiry: FUTURE_DATE,
        driver_license_document_path: expect.stringMatching(/^user-1\/licencia-\d+-[a-z0-9]+\.pdf$/),
        verification_status: 'pending_review',
      }),
      'profile_id', 'user-1',
    )
  })

  it('uploads a new SOAT document independently of the driver license', async () => {
    const fd = formData({
      transport_tier: 'independent',
      soat_expiry_date: FUTURE_DATE, soat_document: fakeComplianceFile('soat.pdf'),
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toBeUndefined()

    expect(toggleUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        soat_expiry_date: FUTURE_DATE,
        soat_document_path: expect.stringMatching(/^user-1\/soat-\d+-[a-z0-9]+\.pdf$/),
        verification_status: 'pending_review',
      }),
      'profile_id', 'user-1',
    )
  })

  it('requires both new documents when switching from cooperative to independent', async () => {
    transporterLookupSingle.mockResolvedValue({ data: { id: TRANSPORTER_ID, transport_tier: 'cooperative' } })
    const fd = formData({
      transport_tier: 'independent',
      driver_license_number: '123', driver_license_expiry: FUTURE_DATE,
      driver_license_document: fakeComplianceFile('lic.pdf'),
      // soat_document intentionally omitted
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toEqual({ error: 'Adjunta el documento correspondiente para cambiar de modalidad.' })
    expect(toggleUpdateMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the update fails', async () => {
    toggleUpdateMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({
      transport_tier: 'independent',
      soat_expiry_date: FUTURE_DATE, soat_document: fakeComplianceFile('soat.pdf'),
    })
    const result = await updateTransporterProfile(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})
