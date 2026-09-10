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
const payoutAccountUpsertMock = vi.fn()
const providerAvailabilityUpsertMock = vi.fn()
const providerWeeklyAvailabilityUpsertMock = vi.fn()
const routeInsertMock = vi.fn()
const routeUpdateSelectMock = vi.fn()
const routeAvailabilityMaybeSingle = vi.fn() // select('id').eq(id).eq(transporter_id).maybeSingle() — setTransporterRouteAvailability

function transporterRoutesUserTable() {
  return {
    insert: (payload: unknown) => routeInsertMock(payload),
    update: (payload: unknown) => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => ({
          select: () => routeUpdateSelectMock(payload, col1, val1, col2, val2),
        }),
      }),
    }),
    select: () => ({
      eq: () => ({ eq: () => ({ maybeSingle: routeAvailabilityMaybeSingle }) }),
    }),
  }
}

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
      if (table === 'transporter_payout_accounts') {
        return { upsert: (payload: unknown, opts: unknown) => payoutAccountUpsertMock(payload, opts) }
      }
      if (table === 'provider_availability') {
        return { upsert: (payload: unknown, opts: unknown) => providerAvailabilityUpsertMock(payload, opts) }
      }
      if (table === 'provider_weekly_availability') {
        return { upsert: (payload: unknown, opts: unknown) => providerWeeklyAvailabilityUpsertMock(payload, opts) }
      }
      if (table === 'transporter_routes') return transporterRoutesUserTable()
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

const acceptTransportRequestRpcMock = vi.fn()
const completeTransportRequestRpcMock = vi.fn()
const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'accept_transport_request') return acceptTransportRequestRpcMock(args)
  if (fn === 'complete_transport_request') return completeTransportRequestRpcMock(args)
  throw new Error(`unexpected rpc: ${fn}`)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}))

const {
  toggleAvailability,
  acceptTransportRequest,
  markCompleted,
  updateTransporterProfile,
  saveTransporterPayoutAccount,
  setTransporterAvailability,
  setTransporterWeeklyAvailability,
  setTransporterRouteAvailability,
  createTransporterRoute,
  updateTransporterRoute,
  toggleTransporterRouteStatus,
} = await import('./actions')

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
  acceptTransportRequestRpcMock.mockResolvedValue({ error: null })
  completeTransportRequestRpcMock.mockResolvedValue({ error: null })
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
  it('returns an error (no RPC call, no revalidation) when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'not-a-uuid' })
    const result = await acceptTransportRequest(fd)
    expect(result).toEqual({ error: 'Solicitud no encontrada.' })
    expect(acceptTransportRequestRpcMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  // Quoting a price is now mandatory — this used to silently accept with
  // price_cents: null (see git history), which made commission uncalculable
  // once the trip completes.
  it.each(['0', '-100', 'abc', '', undefined])(
    'rejects a missing/invalid quoted price %s without calling the RPC',
    async (pricePesos) => {
      const fd = formData(pricePesos === undefined ? { requestId: REQUEST_ID } : { requestId: REQUEST_ID, price_pesos: pricePesos })
      const result = await acceptTransportRequest(fd)
      expect(result).toEqual({ error: 'Cotiza el precio del traslado para poder aceptarlo.' })
      expect(acceptTransportRequestRpcMock).not.toHaveBeenCalled()
    },
  )

  it('converts the quoted price in pesos to cents and calls the RPC with the session transporter_id', async () => {
    const fd = formData({ requestId: REQUEST_ID, price_pesos: '25000' })
    const result = await acceptTransportRequest(fd)

    expect(result).toBeUndefined()
    expect(acceptTransportRequestRpcMock).toHaveBeenCalledWith({
      p_request_id: REQUEST_ID,
      p_transporter_id: TRANSPORTER_ID,
      p_price_cents: 2_500_000,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte')
  })

  it('maps a not_available RPC error (someone else already claimed it) to the alreadyAccepted copy', async () => {
    acceptTransportRequestRpcMock.mockResolvedValue({ error: { message: 'not_available' } })
    const fd = formData({ requestId: REQUEST_ID, price_pesos: '25000' })
    const result = await acceptTransportRequest(fd)
    expect(result).toEqual({ error: 'Esta solicitud ya fue aceptada por otro transportador.' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('returns a generic error for any other RPC failure', async () => {
    acceptTransportRequestRpcMock.mockResolvedValue({ error: { message: 'boom' } })
    const fd = formData({ requestId: REQUEST_ID, price_pesos: '25000' })
    const result = await acceptTransportRequest(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('redirects to / when the caller is not a registered transporter', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    const fd = formData({ requestId: REQUEST_ID, price_pesos: '25000' })
    await expect(acceptTransportRequest(fd)).rejects.toThrow('redirect:/')
    expect(acceptTransportRequestRpcMock).not.toHaveBeenCalled()
  })
})

describe('markCompleted', () => {
  it('returns an error (no RPC call, no revalidation) when requestId is not a UUID', async () => {
    const fd = formData({ requestId: 'nope' })
    const result = await markCompleted(fd)
    expect(result).toEqual({ error: 'Solicitud no encontrada.' })
    expect(completeTransportRequestRpcMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('redirects to / when the caller is not a registered transporter', async () => {
    transporterLookupSingle.mockResolvedValue({ data: null })
    const fd = formData({ requestId: REQUEST_ID })
    await expect(markCompleted(fd)).rejects.toThrow('redirect:/')
    expect(completeTransportRequestRpcMock).not.toHaveBeenCalled()
  })

  it('calls the RPC with the request id and the session transporter_id — never one supplied by the client', async () => {
    // The real form never sends a transporter_id field, but the action must
    // not read it even if it did — ownership has to come from the
    // authenticated session (getAuthenticatedTransporter), never from
    // client input, or transporter A could complete transporter B's ride by
    // guessing/spoofing a form field. The RPC itself also enforces this
    // server-side via its own transporter_id match.
    const fd = formData({ requestId: REQUEST_ID, transporterId: 'attacker-controlled-uuid', transporter_id: 'attacker-controlled-uuid' })
    const result = await markCompleted(fd)

    expect(result).toBeUndefined()
    expect(completeTransportRequestRpcMock).toHaveBeenCalledWith({
      p_request_id: REQUEST_ID,
      p_transporter_id: TRANSPORTER_ID,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte')
  })

  it('maps a not_available RPC error to the notAvailable copy', async () => {
    completeTransportRequestRpcMock.mockResolvedValue({ error: { message: 'not_available' } })
    const fd = formData({ requestId: REQUEST_ID })
    const result = await markCompleted(fd)
    expect(result).toEqual({ error: 'Esta solicitud ya no está disponible.' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('returns a generic error for any other RPC failure', async () => {
    completeTransportRequestRpcMock.mockResolvedValue({ error: { message: 'boom' } })
    const fd = formData({ requestId: REQUEST_ID })
    const result = await markCompleted(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
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

describe('saveTransporterPayoutAccount', () => {
  const VALID_FIELDS = {
    bank_name: 'Bancolombia',
    wompi_bank_id: 'bank-bancolombia',
    account_type: 'ahorros',
    account_number: '00011122233',
    holder_id_type: 'CC',
    holder_id_number: '1002003000',
    holder_name: 'Pedro Transportista',
    holder_email: 'pedro@example.com',
  }

  it('rejects when any required field is missing', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, bank_name: '' }))
    expect(result).toEqual({ error: 'Completa todos los campos obligatorios.' })
    expect(payoutAccountUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects a missing wompi_bank_id', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, wompi_bank_id: '' }))
    expect(result).toEqual({ error: 'Selecciona un banco válido.' })
    expect(payoutAccountUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid account_type', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, account_type: 'checking' }))
    expect(result).toEqual({ error: 'Selecciona un tipo de cuenta válido.' })
  })

  it('rejects an invalid holder_id_type', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, holder_id_type: 'PASSPORT' }))
    expect(result).toEqual({ error: 'Selecciona un tipo de documento válido.' })
  })

  it('rejects an invalid email', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, holder_email: 'not-an-email' }))
    expect(result).toEqual({ error: 'Escribe un correo electrónico válido.' })
  })

  it('rejects a non-numeric account_number', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, account_number: '123-abc' }))
    expect(result).toEqual({ error: 'El número de cuenta debe contener solo dígitos.' })
  })

  it('rejects an all-zero account_number', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, account_number: '0000' }))
    expect(result).toEqual({ error: 'El número de cuenta debe contener solo dígitos.' })
  })

  it('rejects a too-short holder_id_number', async () => {
    const result = await saveTransporterPayoutAccount(formData({ ...VALID_FIELDS, holder_id_number: '12' }))
    expect(result).toEqual({ error: 'Escribe un número de documento válido.' })
  })

  it('upserts on transporter_id (resolved server-side, never from client input) with the validated fields, including wompi_bank_id', async () => {
    payoutAccountUpsertMock.mockResolvedValue({ error: null })

    const result = await saveTransporterPayoutAccount(formData(VALID_FIELDS))

    expect(result).toEqual({ success: true })
    const [payload, opts] = payoutAccountUpsertMock.mock.calls[0]
    expect(payload).toEqual({
      transporter_id: TRANSPORTER_ID,
      bank_name: 'Bancolombia',
      wompi_bank_id: 'bank-bancolombia',
      account_type: 'ahorros',
      account_number: '00011122233',
      holder_id_type: 'CC',
      holder_id_number: '1002003000',
      holder_name: 'Pedro Transportista',
      holder_email: 'pedro@example.com',
    })
    expect(opts).toEqual({ onConflict: 'transporter_id' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte/editar')
  })

  it('returns a generic error when the upsert fails', async () => {
    payoutAccountUpsertMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await saveTransporterPayoutAccount(formData(VALID_FIELDS))

    expect(result).toEqual({ error: 'No se pudo guardar la cuenta de pagos. Intenta de nuevo.' })
  })
})

describe('setTransporterAvailability', () => {
  it('rejects a malformed date', async () => {
    const result = await setTransporterAvailability(formData({ date: '01/01/2099', status: 'unavailable' }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(providerAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid status', async () => {
    const result = await setTransporterAvailability(formData({ date: FUTURE_DATE, status: 'closed' }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(providerAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects a past date', async () => {
    const result = await setTransporterAvailability(formData({ date: '2000-01-01', status: 'unavailable' }))
    expect(result).toEqual({ error: 'No puedes marcar una fecha pasada.' })
    expect(providerAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('upserts a self-service unavailable row scoped to the caller\'s own transporterId', async () => {
    providerAvailabilityUpsertMock.mockResolvedValue({ error: null })

    const result = await setTransporterAvailability(formData({ date: FUTURE_DATE, status: 'unavailable' }))

    expect(result).toBeUndefined()
    const [payload, opts] = providerAvailabilityUpsertMock.mock.calls[0]
    expect(payload).toEqual({
      provider_type: 'transporter',
      provider_id: TRANSPORTER_ID,
      date: FUTURE_DATE,
      status: 'unavailable',
      source: 'provider_self_service',
      resolved_by: 'user-1',
    })
    expect(opts).toEqual({ onConflict: 'provider_type,provider_id,date' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte/disponibilidad')
  })

  it('returns a generic error when the upsert fails', async () => {
    providerAvailabilityUpsertMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await setTransporterAvailability(formData({ date: FUTURE_DATE, status: 'unavailable' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('setTransporterWeeklyAvailability', () => {
  it('rejects an out-of-range weekday', async () => {
    const result = await setTransporterWeeklyAvailability(formData({ weekday: '7', status: 'unavailable' }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(providerWeeklyAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid status', async () => {
    const result = await setTransporterWeeklyAvailability(formData({ weekday: '2', status: 'closed' }))
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(providerWeeklyAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('upserts a self-service weekly row scoped to the caller\'s own transporterId', async () => {
    providerWeeklyAvailabilityUpsertMock.mockResolvedValue({ error: null })

    const result = await setTransporterWeeklyAvailability(formData({ weekday: '2', status: 'unavailable' }))

    expect(result).toBeUndefined()
    const [payload, opts] = providerWeeklyAvailabilityUpsertMock.mock.calls[0]
    expect(payload).toEqual({
      provider_type: 'transporter',
      provider_id: TRANSPORTER_ID,
      weekday: 2,
      status: 'unavailable',
      source: 'provider_self_service',
    })
    expect(opts).toEqual({ onConflict: 'provider_type,provider_id,weekday' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte/disponibilidad')
  })

  it('returns a generic error when the upsert fails', async () => {
    providerWeeklyAvailabilityUpsertMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await setTransporterWeeklyAvailability(formData({ weekday: '2', status: 'unavailable' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('setTransporterRouteAvailability', () => {
  const ROUTE_ID = '33333333-3333-3333-3333-333333333333'

  it('rejects a non-UUID providerId without querying the DB', async () => {
    const result = await setTransporterRouteAvailability(
      formData({ providerId: 'not-a-uuid', date: FUTURE_DATE, status: 'unavailable' }),
    )
    expect(result).toEqual({ error: 'Ruta no encontrada.' })
    expect(routeAvailabilityMaybeSingle).not.toHaveBeenCalled()
  })

  it('rejects a malformed date', async () => {
    const result = await setTransporterRouteAvailability(
      formData({ providerId: ROUTE_ID, date: '01/01/2099', status: 'unavailable' }),
    )
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(providerAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects a past date', async () => {
    const result = await setTransporterRouteAvailability(
      formData({ providerId: ROUTE_ID, date: '2000-01-01', status: 'unavailable' }),
    )
    expect(result).toEqual({ error: 'No puedes marcar una fecha pasada.' })
    expect(providerAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects when the route does not belong to the caller', async () => {
    routeAvailabilityMaybeSingle.mockResolvedValue({ data: null })
    const result = await setTransporterRouteAvailability(
      formData({ providerId: ROUTE_ID, date: FUTURE_DATE, status: 'unavailable' }),
    )
    expect(result).toEqual({ error: 'Ruta no encontrada.' })
    expect(providerAvailabilityUpsertMock).not.toHaveBeenCalled()
  })

  it('upserts a self-service unavailable row scoped to this route', async () => {
    routeAvailabilityMaybeSingle.mockResolvedValue({ data: { id: ROUTE_ID } })
    providerAvailabilityUpsertMock.mockResolvedValue({ error: null })

    const result = await setTransporterRouteAvailability(
      formData({ providerId: ROUTE_ID, date: FUTURE_DATE, status: 'unavailable' }),
    )

    expect(result).toBeUndefined()
    const [payload, opts] = providerAvailabilityUpsertMock.mock.calls[0]
    expect(payload).toEqual({
      provider_type: 'transporter_route',
      provider_id: ROUTE_ID,
      date: FUTURE_DATE,
      status: 'unavailable',
      source: 'provider_self_service',
      resolved_by: 'user-1',
    })
    expect(opts).toEqual({ onConflict: 'provider_type,provider_id,date' })
    expect(revalidatePathMock).toHaveBeenCalledWith(`/mi-perfil-transporte/rutas/${ROUTE_ID}/disponibilidad`)
  })

  it('returns a generic error when the upsert fails', async () => {
    routeAvailabilityMaybeSingle.mockResolvedValue({ data: { id: ROUTE_ID } })
    providerAvailabilityUpsertMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await setTransporterRouteAvailability(
      formData({ providerId: ROUTE_ID, date: FUTURE_DATE, status: 'unavailable' }),
    )

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('createTransporterRoute', () => {
  const VALID_ROUTE_FIELDS = {
    origin: 'Casco urbano de Manaure',
    destination: 'Balneario El Edén',
    allows_one_way: 'on',
  }

  it('rejects missing origin/destination', async () => {
    const result = await createTransporterRoute(formData({ allows_one_way: 'on' }))
    expect(result).toEqual({ error: 'El origen y el destino son obligatorios.' })
    expect(routeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects when neither modality is selected', async () => {
    const result = await createTransporterRoute(
      formData({ origin: 'A', destination: 'B' }),
    )
    expect(result).toEqual({ error: 'Selecciona al menos una modalidad (ida o ida y vuelta).' })
    expect(routeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid one-way price', async () => {
    const result = await createTransporterRoute(
      formData({ ...VALID_ROUTE_FIELDS, price_one_way: '-5' }),
    )
    expect(result).toEqual({ error: 'El precio debe ser un número positivo.' })
    expect(routeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a one-way price large enough to overflow the price_cents column', async () => {
    const result = await createTransporterRoute(
      formData({ ...VALID_ROUTE_FIELDS, price_one_way: '99999999999' }),
    )
    expect(result).toEqual({ error: 'El precio debe ser un número positivo.' })
    expect(routeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid round-trip price', async () => {
    const result = await createTransporterRoute(
      formData({ ...VALID_ROUTE_FIELDS, allows_round_trip: 'on', price_round_trip: '0' }),
    )
    expect(result).toEqual({ error: 'El precio debe ser un número positivo.' })
    expect(routeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid duration', async () => {
    const result = await createTransporterRoute(
      formData({ ...VALID_ROUTE_FIELDS, estimated_duration_minutes: '-1' }),
    )
    expect(result).toEqual({ error: 'La duración debe ser un número positivo.' })
    expect(routeInsertMock).not.toHaveBeenCalled()
  })

  it('rejects a duration longer than a day', async () => {
    const result = await createTransporterRoute(
      formData({ ...VALID_ROUTE_FIELDS, estimated_duration_minutes: '1441' }),
    )
    expect(result).toEqual({ error: 'La duración debe ser un número positivo.' })
    expect(routeInsertMock).not.toHaveBeenCalled()
  })

  it('inserts a route with only the selected modality priced, and redirects', async () => {
    routeInsertMock.mockResolvedValue({ error: null })

    await expect(
      createTransporterRoute(
        formData({
          ...VALID_ROUTE_FIELDS,
          allows_round_trip: 'on',
          price_one_way: '15000',
          price_round_trip: '25000',
          estimated_duration_minutes: '20',
          notes: 'Solo en temporada seca',
        }),
      ),
    ).rejects.toThrow('redirect:/mi-perfil-transporte/rutas')

    expect(routeInsertMock).toHaveBeenCalledWith({
      transporter_id: TRANSPORTER_ID,
      origin: 'Casco urbano de Manaure',
      destination: 'Balneario El Edén',
      allows_one_way: true,
      allows_round_trip: true,
      price_one_way_cents: 1_500_000,
      price_round_trip_cents: 2_500_000,
      estimated_duration_minutes: 20,
      notes: 'Solo en temporada seca',
      status: 'active',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte/rutas')
  })

  it('nulls out the price for a modality that is not offered, even if a price was submitted for it', async () => {
    routeInsertMock.mockResolvedValue({ error: null })

    await expect(
      createTransporterRoute(formData({ ...VALID_ROUTE_FIELDS, price_round_trip: '25000' })),
    ).rejects.toThrow('redirect:')

    expect(routeInsertMock.mock.calls[0][0]).toMatchObject({
      allows_round_trip: false,
      price_round_trip_cents: null,
    })
  })

  it('returns a generic error when the insert fails', async () => {
    routeInsertMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await createTransporterRoute(formData(VALID_ROUTE_FIELDS))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('updateTransporterRoute', () => {
  const ROUTE_ID = '33333333-3333-3333-3333-333333333333'
  const VALID_ROUTE_FIELDS = {
    origin: 'Casco urbano de Manaure',
    destination: 'Balneario El Edén',
    allows_one_way: 'on',
  }

  it('rejects a non-UUID routeId without querying the DB', async () => {
    const result = await updateTransporterRoute('not-a-uuid', formData(VALID_ROUTE_FIELDS))
    expect(result).toEqual({ error: 'Ruta no encontrada.' })
    expect(routeUpdateSelectMock).not.toHaveBeenCalled()
  })

  it('rejects missing origin/destination', async () => {
    const result = await updateTransporterRoute(ROUTE_ID, formData({ allows_one_way: 'on' }))
    expect(result).toEqual({ error: 'El origen y el destino son obligatorios.' })
    expect(routeUpdateSelectMock).not.toHaveBeenCalled()
  })

  it('rejects when neither modality is selected', async () => {
    const result = await updateTransporterRoute(ROUTE_ID, formData({ origin: 'A', destination: 'B' }))
    expect(result).toEqual({ error: 'Selecciona al menos una modalidad (ida o ida y vuelta).' })
    expect(routeUpdateSelectMock).not.toHaveBeenCalled()
  })

  it('updates the route scoped to this transporter and returns success', async () => {
    routeUpdateSelectMock.mockResolvedValue({ data: [{ id: ROUTE_ID }], error: null })

    const result = await updateTransporterRoute(ROUTE_ID, formData(VALID_ROUTE_FIELDS))

    expect(result).toEqual({ success: true })
    const [payload, col1, val1, col2, val2] = routeUpdateSelectMock.mock.calls[0]
    expect(payload).toMatchObject({ origin: 'Casco urbano de Manaure', allows_one_way: true, allows_round_trip: false })
    expect([col1, val1, col2, val2]).toEqual(['id', ROUTE_ID, 'transporter_id', TRANSPORTER_ID])
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte/rutas')
  })

  it('returns a generic error when the update affects no rows (RLS block or wrong owner)', async () => {
    routeUpdateSelectMock.mockResolvedValue({ data: [], error: null })

    const result = await updateTransporterRoute(ROUTE_ID, formData(VALID_ROUTE_FIELDS))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('toggleTransporterRouteStatus', () => {
  const ROUTE_ID = '33333333-3333-3333-3333-333333333333'

  it('rejects a non-UUID routeId without querying the DB', async () => {
    const result = await toggleTransporterRouteStatus('not-a-uuid', 'active')
    expect(result).toEqual({ error: 'Ruta no encontrada.' })
    expect(routeUpdateSelectMock).not.toHaveBeenCalled()
  })

  it('flips active to inactive, scoped to this transporter', async () => {
    routeUpdateSelectMock.mockResolvedValue({ data: [{ id: ROUTE_ID }], error: null })

    const result = await toggleTransporterRouteStatus(ROUTE_ID, 'active')

    expect(result).toBeUndefined()
    const [payload, col1, val1, col2, val2] = routeUpdateSelectMock.mock.calls[0]
    expect(payload).toEqual({ status: 'inactive' })
    expect([col1, val1, col2, val2]).toEqual(['id', ROUTE_ID, 'transporter_id', TRANSPORTER_ID])
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-transporte/rutas')
  })

  it('flips inactive to active', async () => {
    routeUpdateSelectMock.mockResolvedValue({ data: [{ id: ROUTE_ID }], error: null })

    await toggleTransporterRouteStatus(ROUTE_ID, 'inactive')

    expect(routeUpdateSelectMock.mock.calls[0][0]).toEqual({ status: 'active' })
  })

  it('returns a generic error when the update affects no rows', async () => {
    routeUpdateSelectMock.mockResolvedValue({ data: [], error: null })

    const result = await toggleTransporterRouteStatus(ROUTE_ID, 'active')

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})
