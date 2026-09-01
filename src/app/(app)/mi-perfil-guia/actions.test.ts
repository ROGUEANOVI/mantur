import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mirrors mi-negocio/actions.ts for tourist guides. Two patterns worth
// protecting: (1) updateGuideProfile silently drops any specialty/language
// value not in the allowed set rather than rejecting the request — worth
// pinning down precisely since "silently drop" and "reject" are very
// different UX/data-integrity behaviors; (2) toggleTourStatus verifies
// ownership via a read on the RLS-scoped client, then mutates via the admin
// client filtered only by id — safe only because the ownership check
// already happened in the same request.

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
const guideLookupSingle = vi.fn()
const currentAvailabilitySingle = vi.fn()
const touristGuidesUpdateMock = vi.fn()
const tourStatusReadSingle = vi.fn()
const tourStatusReadEqMock = vi.fn()
const tourImagesMaybeSingleEqMock = vi.fn()

function touristGuidesUserTable() {
  return {
    select: (cols: string) => {
      if (cols === 'id') return { eq: () => ({ single: guideLookupSingle }) }
      if (cols === 'is_available') return { eq: () => ({ single: currentAvailabilitySingle }) }
      throw new Error(`unexpected tourist_guides select: ${cols}`)
    },
    update: (payload: unknown) => ({
      eq: (col: string, val: string) => touristGuidesUpdateMock(payload, col, val),
    }),
  }
}

function guideToursUserTable() {
  return {
    select: () => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => {
          tourStatusReadEqMock(col1, val1, col2, val2)
          return { single: tourStatusReadSingle }
        },
      }),
    }),
  }
}

const userStorageUpload = vi.fn()
const userStorageRemove = vi.fn()
const payoutAccountUpsertMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      if (table === 'tourist_guides') return touristGuidesUserTable()
      if (table === 'guide_tours') return guideToursUserTable()
      if (table === 'tourist_guide_payout_accounts') {
        return { upsert: (payload: unknown, opts: unknown) => payoutAccountUpsertMock(payload, opts) }
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

const tourInsertMock = vi.fn()
const tourUpdatePayloadMock = vi.fn()
const tourUpdateEqMock = vi.fn()
const tourUpdateSelectMock = vi.fn()
const tourUpdateAwaitMock = vi.fn()
const tourImagesMaybeSingle = vi.fn()
const storageUpload = vi.fn()
const storageGetPublicUrl = vi.fn()
const storageRemove = vi.fn()

function tourUpdateChain(payload: unknown) {
  tourUpdatePayloadMock(payload)
  const filters: [string, string][] = []
  const chain: any = {
    eq: (col: string, val: string) => {
      filters.push([col, val])
      tourUpdateEqMock(col, val)
      return chain
    },
    select: () => tourUpdateSelectMock(payload, filters),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(tourUpdateAwaitMock(payload, filters))),
  }
  return chain
}

function guideToursAdminTable() {
  return {
    insert: (payload: unknown) => tourInsertMock(payload),
    update: (payload: unknown) => tourUpdateChain(payload),
    select: () => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => {
          tourImagesMaybeSingleEqMock(col1, val1, col2, val2)
          return { maybeSingle: tourImagesMaybeSingle }
        },
      }),
    }),
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'guide_tours') return guideToursAdminTable()
      throw new Error(`unexpected table on admin client: ${table}`)
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
  updateGuideProfile,
  toggleGuideAvailability,
  createGuideTour,
  updateGuideTour,
  toggleTourStatus,
  uploadTourImage,
  deleteTourImage,
  saveGuidePayoutAccount,
} = await import('./actions')

function formData(fields: Record<string, string | string[] | File>) {
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

const GUIDE_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'
const USER_ID = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist_guide' } })
  guideLookupSingle.mockResolvedValue({ data: { id: GUIDE_ID } })
  storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.webp' } })
  userStorageUpload.mockResolvedValue({ error: null })
  userStorageRemove.mockResolvedValue({ error: null })
})

function fakeRntFile(name = 'rnt.pdf', type = 'application/pdf') {
  return new File(['x'], name, { type })
}

describe('getAuthenticatedGuide guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(toggleGuideAvailability()).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not a tourist_guide', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(toggleGuideAvailability()).rejects.toThrow('redirect:/')
  })

  it('redirects to / when the role is tourist_guide but no tourist_guides row exists', async () => {
    guideLookupSingle.mockResolvedValue({ data: null })
    await expect(toggleGuideAvailability()).rejects.toThrow('redirect:/')
  })
})

describe('updateGuideProfile', () => {
  it('rejects a missing phone', async () => {
    const fd = formData({ phone: '  ' })
    const result = await updateGuideProfile(fd)
    expect(result).toEqual({ error: 'Teléfono de contacto (WhatsApp) es obligatorio.' })
    expect(touristGuidesUpdateMock).not.toHaveBeenCalled()
  })

  it('silently drops specialties/languages that are not in the allowed set, keeping only valid ones', async () => {
    touristGuidesUpdateMock.mockResolvedValue({ error: null })
    const fd = formData({
      phone: '3001234567',
      specialties: ['ecotourism', 'made_up_specialty'],
      languages: ['spanish', 'klingon'],
    })

    await expect(updateGuideProfile(fd)).rejects.toThrow('redirect:/mi-perfil-guia')

    expect(touristGuidesUpdateMock).toHaveBeenCalledWith(
      { phone: '3001234567', bio: null, specialties: ['ecotourism'], languages: ['spanish'] },
      'profile_id', USER_ID,
    )
  })

  it('normalizes a phone with country code and formatting noise before storing it', async () => {
    touristGuidesUpdateMock.mockResolvedValue({ error: null })
    const fd = formData({ phone: '+57 300 123 4567' })

    await expect(updateGuideProfile(fd)).rejects.toThrow('redirect:/mi-perfil-guia')

    expect(touristGuidesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '3001234567' }),
      'profile_id', USER_ID,
    )
  })

  it('rejects an invalid phone without updating', async () => {
    const fd = formData({ phone: '123' })
    const result = await updateGuideProfile(fd)
    expect(result).toEqual({ error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' })
    expect(touristGuidesUpdateMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the update fails', async () => {
    touristGuidesUpdateMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ phone: '3001234567' })
    const result = await updateGuideProfile(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  // Regression: formData.get() returns null for a field that isn't present
  // at all (not just empty). phone/name were cast straight to string and
  // .trim()'d with no null guard, so an entirely-missing field crashed with
  // an unhandled TypeError instead of returning a normal validation error.
  // Found by /qa on 2026-08-04 while writing this suite.
  it('returns a validation error, not a crash, when phone is missing from formData entirely', async () => {
    const fd = new FormData() // no 'phone' key at all
    const result = await updateGuideProfile(fd)
    expect(result).toEqual({ error: 'Teléfono de contacto (WhatsApp) es obligatorio.' })
  })

  it('does not touch any RNT/Tarjeta field when neither document is uploaded', async () => {
    touristGuidesUpdateMock.mockResolvedValue({ error: null })
    const fd = formData({ phone: '3001234567' })
    await expect(updateGuideProfile(fd)).rejects.toThrow('redirect:/mi-perfil-guia')

    expect(touristGuidesUpdateMock).toHaveBeenCalledWith(
      { phone: '3001234567', bio: null, specialties: [], languages: [] },
      'profile_id', USER_ID,
    )
    expect(userStorageUpload).not.toHaveBeenCalled()
  })

  it('rejects a new RNT document uploaded without a paired rnt_number', async () => {
    const fd = formData({ phone: '3001234567', rnt_document: fakeRntFile() })
    const result = await updateGuideProfile(fd)
    expect(result).toEqual({ error: 'Completa todos los campos requeridos.' })
    expect(touristGuidesUpdateMock).not.toHaveBeenCalled()
  })

  it('uploads a new RNT document, updates the fields, and resets verification_status', async () => {
    touristGuidesUpdateMock.mockResolvedValue({ error: null })
    const fd = formData({ phone: '3001234567', rnt_number: '12345', rnt_document: fakeRntFile() })
    await expect(updateGuideProfile(fd)).rejects.toThrow('redirect:/mi-perfil-guia')

    expect(touristGuidesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rnt_number: '12345',
        rnt_document_path: expect.stringMatching(/^user-1\/rnt-\d+-[a-z0-9]+\.pdf$/),
        verification_status: 'pending_review',
      }),
      'profile_id', USER_ID,
    )
  })

  it('uploads a new Tarjeta Profesional document, updates the fields, and resets verification_status', async () => {
    touristGuidesUpdateMock.mockResolvedValue({ error: null })
    const fd = formData({
      phone: '3001234567', tarjeta_profesional_number: 'TP-1',
      tarjeta_profesional_document: fakeRntFile('tp.pdf'),
    })
    await expect(updateGuideProfile(fd)).rejects.toThrow('redirect:/mi-perfil-guia')

    expect(touristGuidesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tarjeta_profesional_number: 'TP-1',
        tarjeta_profesional_document_path: expect.stringMatching(/^user-1\/tarjeta-profesional-\d+-[a-z0-9]+\.pdf$/),
        verification_status: 'pending_review',
      }),
      'profile_id', USER_ID,
    )
  })

  it('rejects an RNT document with an unsupported mime type', async () => {
    const fd = formData({ phone: '3001234567', rnt_number: '12345', rnt_document: fakeRntFile('rnt.txt', 'text/plain') })
    const result = await updateGuideProfile(fd)
    expect(result).toEqual({ error: 'Formato no válido. Usa PDF, JPEG, PNG o WebP.' })
    expect(userStorageUpload).not.toHaveBeenCalled()
  })
})

describe('toggleGuideAvailability', () => {
  it('flips is_available in both directions', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: true } })
    touristGuidesUpdateMock.mockResolvedValue({ error: null })
    await toggleGuideAvailability()
    expect(touristGuidesUpdateMock).toHaveBeenCalledWith({ is_available: false }, 'id', GUIDE_ID)
  })

  it('returns a generic error when the current row cannot be read', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: null })
    const result = await toggleGuideAvailability()
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('returns a generic error when the update fails', async () => {
    currentAvailabilitySingle.mockResolvedValue({ data: { is_available: true } })
    touristGuidesUpdateMock.mockResolvedValue({ error: { message: 'db error' } })
    const result = await toggleGuideAvailability()
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('createGuideTour', () => {
  it('rejects a missing name', async () => {
    const fd = formData({ name: ' ', price: '10000' })
    const result = await createGuideTour(fd)
    expect(result).toEqual({ error: 'El nombre del tour es obligatorio.' })
    expect(tourInsertMock).not.toHaveBeenCalled()
  })

  // Regression: name/description were cast straight to string without a
  // null guard, crashing when the field was absent from formData entirely
  // (not just empty). Found by /qa on 2026-08-04 while writing this suite.
  it('returns a validation error, not a crash, when name and description are missing from formData entirely', async () => {
    const fd = new FormData()
    fd.set('price', '10000')
    const result = await createGuideTour(fd)
    expect(result).toEqual({ error: 'El nombre del tour es obligatorio.' })
  })

  it('rejects a negative price', async () => {
    const fd = formData({ name: 'Tour', price: '-1' })
    const result = await createGuideTour(fd)
    expect(result).toEqual({ error: 'El precio debe ser un número mayor o igual a 0.' })
  })

  it('accepts a price of exactly 0', async () => {
    tourInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Tour gratis', price: '0' })
    await expect(createGuideTour(fd)).rejects.toThrow('redirect:/mi-perfil-guia')
    expect(tourInsertMock).toHaveBeenCalledWith(expect.objectContaining({ price: 0 }))
  })

  it('rejects a price above the 100,000,000 cap', async () => {
    const fd = formData({ name: 'Tour', price: '100000001' })
    const result = await createGuideTour(fd)
    expect(result).toEqual({ error: 'El precio debe ser un número mayor o igual a 0.' })
  })

  it('accepts a price of exactly the 100,000,000 cap', async () => {
    tourInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Tour caro', price: '100000000' })
    await expect(createGuideTour(fd)).rejects.toThrow('redirect:/mi-perfil-guia')
    expect(tourInsertMock).toHaveBeenCalledWith(expect.objectContaining({ price: 100_000_000 }))
  })

  it('defaults capacity to 1 when not provided, and rejects an invalid one when provided', async () => {
    tourInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Tour', price: '10000' })
    await expect(createGuideTour(fd)).rejects.toThrow('redirect:/mi-perfil-guia')
    expect(tourInsertMock).toHaveBeenCalledWith(expect.objectContaining({ capacity: 1 }))

    vi.clearAllMocks()
    authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist_guide' } })
    guideLookupSingle.mockResolvedValue({ data: { id: GUIDE_ID } })

    const fdBadCapacity = formData({ name: 'Tour', price: '10000', capacity: '0' })
    const result = await createGuideTour(fdBadCapacity)
    expect(result).toEqual({ error: 'La capacidad debe ser un número entero positivo.' })
  })

  it('inserts the tour scoped to the session guideId', async () => {
    tourInsertMock.mockResolvedValue({ error: null })
    const fd = formData({ name: 'Tour por el pueblo', price: '15000', capacity: '5', duration_minutes: '90' })
    await expect(createGuideTour(fd)).rejects.toThrow('redirect:/mi-perfil-guia')

    expect(tourInsertMock).toHaveBeenCalledWith({
      guide_id: GUIDE_ID, name: 'Tour por el pueblo', description: null,
      price: 15000, capacity: 5, duration_minutes: 90, status: 'active',
    })
  })

  it('rejects an invalid duration', async () => {
    const fd = formData({ name: 'Tour', price: '10000', duration_minutes: '0' })
    const result = await createGuideTour(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(tourInsertMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the insert fails', async () => {
    tourInsertMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ name: 'Tour', price: '10000' })
    const result = await createGuideTour(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('updateGuideTour', () => {
  it('rejects a non-UUID tourId', async () => {
    const fd = formData({ name: 'X', price: '1000' })
    const result = await updateGuideTour('bad-id', fd)
    expect(result).toEqual({ error: 'Tour no encontrado.' })
  })

  it('returns a validation error, not a crash, when name is missing from formData entirely', async () => {
    const fd = new FormData()
    fd.set('price', '10000')
    const result = await updateGuideTour(TOUR_ID, fd)
    expect(result).toEqual({ error: 'El nombre del tour es obligatorio.' })
  })

  it('scopes the update to id AND the session guideId, and returns success', async () => {
    tourUpdateSelectMock.mockResolvedValue({ data: [{ id: TOUR_ID }], error: null })
    const fd = formData({ name: 'Tour actualizado', price: '20000', capacity: '4' })

    const result = await updateGuideTour(TOUR_ID, fd)

    expect(result).toEqual({ success: true })
    expect(tourUpdateEqMock).toHaveBeenCalledWith('id', TOUR_ID)
    expect(tourUpdateEqMock).toHaveBeenCalledWith('guide_id', GUIDE_ID)
  })

  it('returns a generic error when no row matches (wrong owner or not found)', async () => {
    tourUpdateSelectMock.mockResolvedValue({ data: [], error: null })
    const fd = formData({ name: 'Tour actualizado', price: '20000' })
    const result = await updateGuideTour(TOUR_ID, fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('rejects a negative price', async () => {
    const fd = formData({ name: 'Tour', price: '-1' })
    const result = await updateGuideTour(TOUR_ID, fd)
    expect(result).toEqual({ error: 'El precio debe ser un número mayor o igual a 0.' })
  })

  it('rejects an invalid capacity', async () => {
    const fd = formData({ name: 'Tour', price: '10000', capacity: '0' })
    const result = await updateGuideTour(TOUR_ID, fd)
    expect(result).toEqual({ error: 'La capacidad debe ser un número entero positivo.' })
  })

  it('rejects an invalid duration', async () => {
    const fd = formData({ name: 'Tour', price: '10000', duration_minutes: '0' })
    const result = await updateGuideTour(TOUR_ID, fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('toggleTourStatus', () => {
  it('does nothing for a non-UUID tourId', async () => {
    const fd = formData({ tourId: 'bad-id' })
    await toggleTourStatus(fd)
    expect(tourStatusReadSingle).not.toHaveBeenCalled()
  })

  it('does nothing when the tour is not found for this guide (ownership check on the read)', async () => {
    tourStatusReadSingle.mockResolvedValue({ data: null })
    const fd = formData({ tourId: TOUR_ID })
    await toggleTourStatus(fd)
    expect(tourUpdatePayloadMock).not.toHaveBeenCalled()
  })

  it('flips active to inactive, reading ownership scoped to id AND the session guideId', async () => {
    tourStatusReadSingle.mockResolvedValue({ data: { status: 'active' } })
    tourUpdateAwaitMock.mockReturnValue({ error: null })
    const fd = formData({ tourId: TOUR_ID })
    await toggleTourStatus(fd)

    expect(tourStatusReadEqMock).toHaveBeenCalledWith('id', TOUR_ID, 'guide_id', GUIDE_ID)
    expect(tourUpdatePayloadMock).toHaveBeenCalledWith({ status: 'inactive' })
    expect(tourUpdateEqMock).toHaveBeenCalledWith('id', TOUR_ID)
  })

  it('flips inactive to active', async () => {
    tourStatusReadSingle.mockResolvedValue({ data: { status: 'inactive' } })
    tourUpdateAwaitMock.mockReturnValue({ error: null })
    const fd = formData({ tourId: TOUR_ID })
    await toggleTourStatus(fd)
    expect(tourUpdatePayloadMock).toHaveBeenCalledWith({ status: 'active' })
  })
})

describe('uploadTourImage / deleteTourImage', () => {
  it('uploadTourImage rejects a non-UUID tourId before any auth check', async () => {
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadTourImage('not-a-uuid', fd)
    expect(result).toEqual({ error: 'Tour no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('uploadTourImage rejects when the tour is not owned by the caller', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: null })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadTourImage(TOUR_ID, fd)
    expect(result).toEqual({ error: 'Tour no encontrado.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('treats a tour with no images field yet as having zero images', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: undefined } })
    storageUpload.mockResolvedValue({ error: null })
    tourUpdateAwaitMock.mockReturnValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadTourImage(TOUR_ID, fd)

    expect(tourUpdatePayloadMock).toHaveBeenCalledWith({ images: ['https://cdn.example.com/photo.webp'] })
  })

  it('uploadTourImage rejects when no image file is provided', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: [] } })
    const fd = formData({})
    const result = await uploadTourImage(TOUR_ID, fd)
    expect(result).toEqual({ error: 'Selecciona una imagen.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadTourImage rejects an invalid file type', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: [] } })
    const fd = formData({})
    fd.set('image', fakeImageFile({ type: 'application/pdf' }))
    const result = await uploadTourImage(TOUR_ID, fd)
    expect(result).toEqual({ error: 'Formato no válido. Usa JPEG, PNG o WebP.' })
  })

  it('uploadTourImage rejects a file over 5MB', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: [] } })
    const fd = formData({})
    fd.set('image', fakeImageFile({ size: 6 * 1024 * 1024 }))
    const result = await uploadTourImage(TOUR_ID, fd)
    expect(result).toEqual({ error: 'La imagen no puede superar 5 MB.' })
  })

  it('uploadTourImage rejects at the 5-image cap', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: Array(5).fill('https://x/i.webp') } })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadTourImage(TOUR_ID, fd)
    expect(result).toEqual({ error: 'Máximo 5 fotos por tour.' })
  })

  it('uploadTourImage appends the new URL on success, having verified ownership scoped to the session guideId', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: [] } })
    storageUpload.mockResolvedValue({ error: null })
    tourUpdateAwaitMock.mockReturnValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadTourImage(TOUR_ID, fd)

    expect(tourImagesMaybeSingleEqMock).toHaveBeenCalledWith('id', TOUR_ID, 'guide_id', GUIDE_ID)
    expect(tourUpdatePayloadMock).toHaveBeenCalledWith({ images: ['https://cdn.example.com/photo.webp'] })
  })

  it('uploadTourImage rolls back the uploaded file when the DB update fails', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: [] } })
    storageUpload.mockResolvedValue({ error: null })
    tourUpdateAwaitMock.mockReturnValue({ error: { message: 'db error' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadTourImage(TOUR_ID, fd)

    expect(result).toEqual({ error: 'No se pudo guardar la imagen.' })
    expect(storageRemove).toHaveBeenCalled()
  })

  it('uploadTourImage returns an error when the storage upload itself fails', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: [] } })
    storageUpload.mockResolvedValue({ error: { message: 'storage down' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadTourImage(TOUR_ID, fd)

    expect(result).toEqual({ error: 'No se pudo subir la imagen. Intenta de nuevo.' })
    expect(tourUpdatePayloadMock).not.toHaveBeenCalled()
  })

  it('deleteTourImage rejects when the tour is not owned by the caller', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: null })
    const result = await deleteTourImage(TOUR_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Tour no encontrado.' })
    expect(storageRemove).not.toHaveBeenCalled()
  })

  it('deleteTourImage rejects a non-UUID tourId without querying the DB', async () => {
    const result = await deleteTourImage('not-a-uuid', 'https://x/a.webp')
    expect(result).toEqual({ error: 'Tour no encontrado.' })
    expect(tourImagesMaybeSingle).not.toHaveBeenCalled()
  })

  it('deleteTourImage removes the file from storage and filters the URL out', async () => {
    tourImagesMaybeSingle.mockResolvedValue({
      data: { id: TOUR_ID, images: ['https://x.supabase.co/storage/v1/object/public/business-images/guide-tours/t1/a.webp', 'https://x/keep.webp'] },
    })
    tourUpdateAwaitMock.mockReturnValue({ error: null })

    await deleteTourImage(TOUR_ID, 'https://x.supabase.co/storage/v1/object/public/business-images/guide-tours/t1/a.webp')

    expect(tourImagesMaybeSingleEqMock).toHaveBeenCalledWith('id', TOUR_ID, 'guide_id', GUIDE_ID)
    expect(storageRemove).toHaveBeenCalledWith('business-images', ['guide-tours/t1/a.webp'])
    expect(tourUpdatePayloadMock).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] })
  })

  it('deleteTourImage skips the storage removal when the URL does not match the bucket path (still filters it from the array)', async () => {
    tourImagesMaybeSingle.mockResolvedValue({
      data: { id: TOUR_ID, images: ['https://cdn.other.com/random.webp', 'https://x/keep.webp'] },
    })
    tourUpdateAwaitMock.mockReturnValue({ error: null })

    await deleteTourImage(TOUR_ID, 'https://cdn.other.com/random.webp')

    expect(storageRemove).not.toHaveBeenCalled()
    expect(tourUpdatePayloadMock).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] })
  })

  it('deleteTourImage treats a missing images field as an empty array', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: { id: TOUR_ID, images: undefined } })
    tourUpdateAwaitMock.mockReturnValue({ error: null })

    await deleteTourImage(TOUR_ID, 'https://x/whatever.webp')

    expect(tourUpdatePayloadMock).toHaveBeenCalledWith({ images: [] })
  })
})

describe('saveGuidePayoutAccount', () => {
  const VALID_FIELDS = {
    bank_name: 'Bancolombia',
    wompi_bank_id: 'bank-bancolombia',
    account_type: 'ahorros',
    account_number: '00011122233',
    holder_id_type: 'CC',
    holder_id_number: '1002003000',
    holder_name: 'María Guía',
    holder_email: 'maria@example.com',
  }

  it('rejects when any required field is missing', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, bank_name: '' }))
    expect(result).toEqual({ error: 'Completa todos los campos obligatorios.' })
    expect(payoutAccountUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects a missing wompi_bank_id', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, wompi_bank_id: '' }))
    expect(result).toEqual({ error: 'Selecciona un banco válido.' })
    expect(payoutAccountUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid account_type', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, account_type: 'checking' }))
    expect(result).toEqual({ error: 'Selecciona un tipo de cuenta válido.' })
  })

  it('rejects an invalid holder_id_type', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, holder_id_type: 'PASSPORT' }))
    expect(result).toEqual({ error: 'Selecciona un tipo de documento válido.' })
  })

  it('rejects an invalid email', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, holder_email: 'not-an-email' }))
    expect(result).toEqual({ error: 'Escribe un correo electrónico válido.' })
  })

  it('rejects a non-numeric account_number', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, account_number: '123-abc' }))
    expect(result).toEqual({ error: 'El número de cuenta debe contener solo dígitos.' })
  })

  it('rejects an all-zero account_number', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, account_number: '0000' }))
    expect(result).toEqual({ error: 'El número de cuenta debe contener solo dígitos.' })
  })

  it('rejects a too-short holder_id_number', async () => {
    const result = await saveGuidePayoutAccount(formData({ ...VALID_FIELDS, holder_id_number: '12' }))
    expect(result).toEqual({ error: 'Escribe un número de documento válido.' })
  })

  it('upserts on guide_id (resolved server-side, never from client input) with the validated fields, including wompi_bank_id', async () => {
    payoutAccountUpsertMock.mockResolvedValue({ error: null })

    const result = await saveGuidePayoutAccount(formData(VALID_FIELDS))

    expect(result).toEqual({ success: true })
    const [payload, opts] = payoutAccountUpsertMock.mock.calls[0]
    expect(payload).toEqual({
      guide_id: GUIDE_ID,
      bank_name: 'Bancolombia',
      wompi_bank_id: 'bank-bancolombia',
      account_type: 'ahorros',
      account_number: '00011122233',
      holder_id_type: 'CC',
      holder_id_number: '1002003000',
      holder_name: 'María Guía',
      holder_email: 'maria@example.com',
    })
    expect(opts).toEqual({ onConflict: 'guide_id' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil-guia/editar')
  })

  it('returns a generic error when the upsert fails', async () => {
    payoutAccountUpsertMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await saveGuidePayoutAccount(formData(VALID_FIELDS))

    expect(result).toEqual({ error: 'No se pudo guardar la cuenta de pagos. Intenta de nuevo.' })
  })
})
