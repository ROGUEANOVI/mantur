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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      if (table === 'tourist_guides') return touristGuidesUserTable()
      if (table === 'guide_tours') return guideToursUserTable()
      throw new Error(`unexpected table on user client: ${table}`)
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

const GUIDE_ID = '11111111-1111-1111-1111-111111111111'
const TOUR_ID = '22222222-2222-2222-2222-222222222222'
const USER_ID = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  profileSingle.mockResolvedValue({ data: { role: 'tourist_guide' } })
  guideLookupSingle.mockResolvedValue({ data: { id: GUIDE_ID } })
  storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.webp' } })
})

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
  it('uploadTourImage rejects when the tour is not owned by the caller', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: null })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadTourImage(TOUR_ID, fd)
    expect(result).toEqual({ error: 'Tour no encontrado.' })
    expect(storageUpload).not.toHaveBeenCalled()
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

  it('deleteTourImage rejects when the tour is not owned by the caller', async () => {
    tourImagesMaybeSingle.mockResolvedValue({ data: null })
    const result = await deleteTourImage(TOUR_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Tour no encontrado.' })
    expect(storageRemove).not.toHaveBeenCalled()
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
})
