import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const packageInsertMock = vi.fn()
const packageUpdateEqSelectMock = vi.fn()
const packageMediaUpdateAwaitMock = vi.fn()
const packageToggleUpdateMock = vi.fn()
const packageDeleteEqMock = vi.fn()
const packageMediaMaybeSingleMock = vi.fn()
const componentMaybeSingleMock = vi.fn()
const componentEqCallsMock = vi.fn()
const componentSelectMock = vi.fn()
const packageItemInsertMock = vi.fn()
const packageItemDeleteEqMock = vi.fn()
const storageUpload = vi.fn()
const storageGetPublicUrl = vi.fn()
const storageRemove = vi.fn()
const storageCreateSignedUploadUrl = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'packages') {
        return {
          insert: (payload: unknown) => packageInsertMock(payload),
          update: (payload: unknown) => ({
            eq: (_col: string, id: string) => ({
              select: () => packageUpdateEqSelectMock(payload, id),
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve(resolve(packageMediaUpdateAwaitMock(payload, id))),
            }),
          }),
          delete: () => ({ eq: (_col: string, id: string) => packageDeleteEqMock(id) }),
          select: () => ({ eq: () => ({ maybeSingle: packageMediaMaybeSingleMock }) }),
        }
      }
      if (table === 'services' || table === 'guide_tours') {
        // addPackageItem chains a variable number of .eq() calls (own status
        // + the joined business's/guide's active-and-verified predicate) —
        // a self-referencing chain supports any number of them before
        // terminating in .maybeSingle(), recording every (column, value)
        // pair applied so tests can assert the parent-status predicate was
        // actually included, not just that *some* filter was applied.
        const chain: { eq: (col: string, val: unknown) => typeof chain; maybeSingle: typeof componentMaybeSingleMock } = {
          eq: (col: string, val: unknown) => {
            componentEqCallsMock(col, val)
            return chain
          },
          maybeSingle: componentMaybeSingleMock,
        }
        return { select: (columns: string) => (componentSelectMock(table, columns), chain) }
      }
      if (table === 'package_items') {
        return {
          insert: (payload: unknown) => packageItemInsertMock(payload),
          delete: () => ({ eq: (col: string, id: string) => packageItemDeleteEqMock(col, id) }),
        }
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
  createPackage,
  updatePackage,
  togglePackageActive,
  deletePackage,
  addPackageItem,
  removePackageItem,
  uploadPackageImage,
  deletePackageImage,
  requestPackageVideoUpload,
  confirmPackageVideoUpload,
  deletePackageVideo,
} = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function fakeImageFile(overrides: Partial<{ type: string; size: number }> = {}) {
  return new File([new Uint8Array(overrides.size ?? 1024)], 'photo.jpg', { type: overrides.type ?? 'image/jpeg' })
}

const PACKAGE_ID = '11111111-1111-1111-1111-111111111111'
const SERVICE_ID = '22222222-2222-2222-2222-222222222222'
const GUIDE_TOUR_ID = '33333333-3333-3333-3333-333333333333'
const ITEM_ID = '44444444-4444-4444-4444-444444444444'

const VALID_PACKAGE_FIELDS = {
  name: 'Ruta Serranía del Perijá',
  description: 'Dos días de caminata y hospedaje.',
  base_price: '450000',
  pricing_unit: 'per_person',
  capacity: '10',
}

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  profileSingle.mockResolvedValue({ data: { role: 'admin' } })
  storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/photo.webp' } })
})

describe('getAuthenticatedAdmin guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await expect(createPackage(formData(VALID_PACKAGE_FIELDS))).rejects.toThrow('redirect:/login')
  })

  it('redirects to / when the user is not an admin', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(createPackage(formData(VALID_PACKAGE_FIELDS))).rejects.toThrow('redirect:/')
  })
})

describe('createPackage', () => {
  it('rejects a missing name', async () => {
    const result = await createPackage(formData({ ...VALID_PACKAGE_FIELDS, name: '  ' }))
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(packageInsertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid base_price', async () => {
    const result = await createPackage(formData({ ...VALID_PACKAGE_FIELDS, base_price: 'abc' }))
    expect(result).toEqual({ error: 'El precio de venta debe ser un número válido.' })
  })

  it('rejects a negative base_price', async () => {
    const result = await createPackage(formData({ ...VALID_PACKAGE_FIELDS, base_price: '-100' }))
    expect(result).toEqual({ error: 'El precio de venta debe ser un número válido.' })
  })

  it('rejects an invalid pricing_unit', async () => {
    const result = await createPackage(formData({ ...VALID_PACKAGE_FIELDS, pricing_unit: 'per_week' }))
    expect(result).toEqual({ error: 'Selecciona cómo se cobra el paquete.' })
  })

  it('rejects a non-integer capacity', async () => {
    const result = await createPackage(formData({ ...VALID_PACKAGE_FIELDS, capacity: '2.5' }))
    expect(result).toEqual({ error: 'El cupo máximo debe ser un número entero mayor a 0.' })
  })

  it('rejects a description over the max length', async () => {
    const result = await createPackage(formData({ ...VALID_PACKAGE_FIELDS, description: 'a'.repeat(1201) }))
    expect(result).toEqual({ error: 'La descripción no puede superar 1200 caracteres.' })
  })

  it('allows an empty capacity (optional field)', async () => {
    packageInsertMock.mockResolvedValue({ error: null })
    await expect(
      createPackage(formData({ ...VALID_PACKAGE_FIELDS, capacity: '' })),
    ).rejects.toThrow('redirect:/admin/paquetes')
    expect(packageInsertMock).toHaveBeenCalledWith(expect.objectContaining({ capacity: null }))
  })

  it('inserts with is_active true and redirects on success', async () => {
    packageInsertMock.mockResolvedValue({ error: null })
    await expect(createPackage(formData(VALID_PACKAGE_FIELDS))).rejects.toThrow('redirect:/admin/paquetes')
    expect(packageInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ruta Serranía del Perijá', base_price: 450000, is_active: true }),
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/paquetes')
  })

  it('maps an insert error to the generic copy', async () => {
    packageInsertMock.mockResolvedValue({ error: { code: '99999' } })
    const result = await createPackage(formData(VALID_PACKAGE_FIELDS))
    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
  })
})

describe('updatePackage', () => {
  it('rejects a non-UUID packageId', async () => {
    const result = await updatePackage(formData({ ...VALID_PACKAGE_FIELDS, packageId: 'not-a-uuid' }))
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(packageUpdateEqSelectMock).not.toHaveBeenCalled()
  })

  it('updates and redirects on success', async () => {
    packageUpdateEqSelectMock.mockResolvedValue({ data: [{ id: PACKAGE_ID }], error: null })
    await expect(
      updatePackage(formData({ ...VALID_PACKAGE_FIELDS, packageId: PACKAGE_ID })),
    ).rejects.toThrow('redirect:/admin/paquetes')
    expect(packageUpdateEqSelectMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ruta Serranía del Perijá' }),
      PACKAGE_ID,
    )
  })

  it('returns notFound when no row matched the update', async () => {
    packageUpdateEqSelectMock.mockResolvedValue({ data: [], error: null })
    const result = await updatePackage(formData({ ...VALID_PACKAGE_FIELDS, packageId: PACKAGE_ID }))
    expect(result).toEqual({ error: 'Error al guardar. Intenta de nuevo.' })
  })
})

describe('togglePackageActive', () => {
  it('does nothing when id is missing', async () => {
    await togglePackageActive(formData({ is_active: 'true' }))
    expect(packageToggleUpdateMock).not.toHaveBeenCalled()
  })

  it('flips is_active to false when currently true', async () => {
    await togglePackageActive(formData({ id: PACKAGE_ID, is_active: 'true' }))
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/paquetes')
  })
})

describe('deletePackage', () => {
  it('rejects a non-UUID packageId', async () => {
    const result = await deletePackage(formData({ packageId: 'nope' }))
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(packageDeleteEqMock).not.toHaveBeenCalled()
  })

  it('deletes cleanly and revalidates on success', async () => {
    packageDeleteEqMock.mockResolvedValue({ error: null })
    const result = await deletePackage(formData({ packageId: PACKAGE_ID }))
    expect(result).toBeUndefined()
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin/paquetes')
  })

  it('maps a foreign-key violation (23503, package has bookings) to a clear message', async () => {
    packageDeleteEqMock.mockResolvedValue({ error: { code: '23503' } })
    const result = await deletePackage(formData({ packageId: PACKAGE_ID }))
    expect(result).toEqual({
      error: 'No se puede eliminar: este paquete ya tiene reservas. Desactívalo en su lugar.',
    })
  })

  it('maps any other delete error to the generic delete copy', async () => {
    packageDeleteEqMock.mockResolvedValue({ error: { code: '99999' } })
    const result = await deletePackage(formData({ packageId: PACKAGE_ID }))
    expect(result).toEqual({ error: 'Error al eliminar.' })
  })
})

describe('addPackageItem', () => {
  const baseFields = {
    packageId: PACKAGE_ID,
    component: `service:${SERVICE_ID}`,
    internal_cost_pesos: '150000',
    quantity_included: '2',
  }

  it('rejects a non-UUID packageId', async () => {
    const result = await addPackageItem(formData({ ...baseFields, packageId: 'nope' }))
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
  })

  it('rejects a missing/malformed component', async () => {
    const result = await addPackageItem(formData({ ...baseFields, component: 'nonsense' }))
    expect(result).toEqual({ error: 'Selecciona un servicio o tour.' })
  })

  it('rejects an invalid internal_cost_pesos', async () => {
    const result = await addPackageItem(formData({ ...baseFields, internal_cost_pesos: 'abc' }))
    expect(result).toEqual({ error: 'El costo interno debe ser un número válido.' })
  })

  it('rejects a non-integer or zero-or-less quantity_included', async () => {
    const result = await addPackageItem(formData({ ...baseFields, quantity_included: '0' }))
    expect(result).toEqual({ error: 'La cantidad debe ser al menos 1.' })
  })

  it('defaults quantity_included to 1 when omitted', async () => {
    componentMaybeSingleMock.mockResolvedValue({ data: { id: SERVICE_ID } })
    packageItemInsertMock.mockResolvedValue({ error: null })
    const fd = formData(baseFields)
    fd.delete('quantity_included')
    await addPackageItem(fd)
    expect(packageItemInsertMock).toHaveBeenCalledWith(expect.objectContaining({ quantity_included: 1 }))
  })

  it('rejects when the referenced service/guide_tour is not found or inactive', async () => {
    componentMaybeSingleMock.mockResolvedValue({ data: null })
    const result = await addPackageItem(formData(baseFields))
    expect(result).toEqual({ error: 'El servicio o tour seleccionado ya no está disponible.' })
    expect(packageItemInsertMock).not.toHaveBeenCalled()
  })

  // Regression: a service/tour's own status='active' isn't enough — its
  // owning business/guide must also be in good standing, or a package could
  // silently include a provider ManTur already rejected/deactivated/paused.
  it('filters the service existence check on the owning business being active and verified, not just the service itself', async () => {
    componentMaybeSingleMock.mockResolvedValue({ data: { id: SERVICE_ID } })
    packageItemInsertMock.mockResolvedValue({ error: null })
    await addPackageItem(formData(baseFields))

    expect(componentSelectMock).toHaveBeenCalledWith('services', expect.stringContaining('businesses!inner'))
    const eqCalls = componentEqCallsMock.mock.calls
    expect(eqCalls).toContainEqual(['businesses.status', 'active'])
    expect(eqCalls).toContainEqual(['businesses.verified', true])
  })

  it('filters the guide_tour existence check on the owning guide being available, not just the tour itself', async () => {
    componentMaybeSingleMock.mockResolvedValue({ data: { id: GUIDE_TOUR_ID } })
    packageItemInsertMock.mockResolvedValue({ error: null })
    await addPackageItem(formData({ ...baseFields, component: `guide_tour:${GUIDE_TOUR_ID}` }))

    expect(componentSelectMock).toHaveBeenCalledWith('guide_tours', expect.stringContaining('tourist_guides!inner'))
    expect(componentEqCallsMock.mock.calls).toContainEqual(['tourist_guides.is_available', true])
  })

  it('converts pesos to centavos correctly and inserts a service item', async () => {
    componentMaybeSingleMock.mockResolvedValue({ data: { id: SERVICE_ID } })
    packageItemInsertMock.mockResolvedValue({ error: null })
    await addPackageItem(formData(baseFields))
    expect(packageItemInsertMock).toHaveBeenCalledWith({
      package_id: PACKAGE_ID,
      service_id: SERVICE_ID,
      guide_tour_id: null,
      internal_cost_cents: 15000000,
      quantity_included: 2,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/paquetes/${PACKAGE_ID}/editar`)
  })

  it('inserts a guide_tour item with service_id null', async () => {
    componentMaybeSingleMock.mockResolvedValue({ data: { id: GUIDE_TOUR_ID } })
    packageItemInsertMock.mockResolvedValue({ error: null })
    await addPackageItem(formData({ ...baseFields, component: `guide_tour:${GUIDE_TOUR_ID}` }))
    expect(packageItemInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ service_id: null, guide_tour_id: GUIDE_TOUR_ID }),
    )
  })

  it('maps an insert error to the generic items copy', async () => {
    componentMaybeSingleMock.mockResolvedValue({ data: { id: SERVICE_ID } })
    packageItemInsertMock.mockResolvedValue({ error: { code: '99999' } })
    const result = await addPackageItem(formData(baseFields))
    expect(result).toEqual({ error: 'No se pudo agregar. Intenta de nuevo.' })
  })
})

describe('removePackageItem', () => {
  it('does nothing when itemId is missing or invalid', async () => {
    await removePackageItem(formData({ packageId: PACKAGE_ID }))
    expect(packageItemDeleteEqMock).not.toHaveBeenCalled()
  })

  it('deletes the item and revalidates the edit page when packageId is present', async () => {
    packageItemDeleteEqMock.mockResolvedValue({ error: null })
    await removePackageItem(formData({ itemId: ITEM_ID, packageId: PACKAGE_ID }))
    expect(packageItemDeleteEqMock).toHaveBeenCalledWith('id', ITEM_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/paquetes/${PACKAGE_ID}/editar`)
  })

  it('deletes the item without revalidating when packageId is absent', async () => {
    packageItemDeleteEqMock.mockResolvedValue({ error: null })
    await removePackageItem(formData({ itemId: ITEM_ID }))
    expect(packageItemDeleteEqMock).toHaveBeenCalledWith('id', ITEM_ID)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('uploadPackageImage / deletePackageImage', () => {
  it('uploadPackageImage rejects a non-UUID packageId before any auth check', async () => {
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPackageImage('bad-id', fd)
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('uploadPackageImage rejects when the package does not exist', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: null })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPackageImage(PACKAGE_ID, fd)
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadPackageImage rejects at the 10-item combined photo/video cap', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({
      data: { id: PACKAGE_ID, images: Array(6).fill('https://x/i.webp'), videos: Array(4).fill('https://x/v.mp4') },
    })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPackageImage(PACKAGE_ID, fd)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por paquete.' })
  })

  it('treats a package with no images field yet as having zero images', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: undefined } })
    storageUpload.mockResolvedValue({ error: null })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadPackageImage(PACKAGE_ID, fd)

    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith(
      { images: ['https://cdn.example.com/photo.webp'] }, PACKAGE_ID,
    )
  })

  it('uploadPackageImage rejects when no image file is provided', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [] } })
    const fd = formData({})
    const result = await uploadPackageImage(PACKAGE_ID, fd)
    expect(result).toEqual({ error: 'Selecciona una imagen.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('uploadPackageImage rejects an invalid file type', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [] } })
    const fd = formData({})
    fd.set('image', fakeImageFile({ type: 'application/pdf' }))
    const result = await uploadPackageImage(PACKAGE_ID, fd)
    expect(result).toEqual({ error: 'Formato no válido. Usa JPEG, PNG o WebP.' })
  })

  it('uploadPackageImage rejects a file over 5MB', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [] } })
    const fd = formData({})
    fd.set('image', fakeImageFile({ size: 6 * 1024 * 1024 }))
    const result = await uploadPackageImage(PACKAGE_ID, fd)
    expect(result).toEqual({ error: 'La imagen no puede superar 5 MB.' })
  })

  it('uploadPackageImage returns an error when the storage upload itself fails', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [] } })
    storageUpload.mockResolvedValue({ error: { message: 'storage down' } })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPackageImage(PACKAGE_ID, fd)
    expect(result).toEqual({ error: 'No se pudo subir la imagen. Intenta de nuevo.' })
    expect(packageMediaUpdateAwaitMock).not.toHaveBeenCalled()
  })

  it('uploadPackageImage appends the new URL on success', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: ['https://x/old.webp'] } })
    storageUpload.mockResolvedValue({ error: null })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    await uploadPackageImage(PACKAGE_ID, fd)

    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith(
      { images: ['https://x/old.webp', 'https://cdn.example.com/photo.webp'] }, PACKAGE_ID,
    )
  })

  it('uploadPackageImage rolls back the uploaded file when the DB update fails', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [] } })
    storageUpload.mockResolvedValue({ error: null })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: { message: 'db error' } })

    const fd = formData({})
    fd.set('image', fakeImageFile())
    const result = await uploadPackageImage(PACKAGE_ID, fd)

    expect(result).toEqual({ error: 'No se pudo guardar la imagen.' })
    expect(storageRemove).toHaveBeenCalled()
  })

  it('deletePackageImage rejects a non-UUID packageId before any auth check', async () => {
    const result = await deletePackageImage('bad-id', 'https://x/a.webp')
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('deletePackageImage removes the file from storage and filters the URL out of the images array', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({
      data: {
        id: PACKAGE_ID,
        images: [
          'https://x.supabase.co/storage/v1/object/public/package-images/packages/p1/a.webp',
          'https://x/keep.webp',
        ],
      },
    })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    await deletePackageImage(
      PACKAGE_ID,
      'https://x.supabase.co/storage/v1/object/public/package-images/packages/p1/a.webp',
    )

    expect(storageRemove).toHaveBeenCalledWith('package-images', ['packages/p1/a.webp'])
    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, PACKAGE_ID)
  })

  it('deletePackageImage rejects when the package does not exist', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: null })
    const result = await deletePackageImage(PACKAGE_ID, 'https://x/a.webp')
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(storageRemove).not.toHaveBeenCalled()
  })

  it('deletePackageImage skips the storage removal when the URL does not match the bucket path (still filters it from the array)', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({
      data: { id: PACKAGE_ID, images: ['https://cdn.other.com/random.webp', 'https://x/keep.webp'] },
    })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    await deletePackageImage(PACKAGE_ID, 'https://cdn.other.com/random.webp')

    expect(storageRemove).not.toHaveBeenCalled()
    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith({ images: ['https://x/keep.webp'] }, PACKAGE_ID)
  })

  it('deletePackageImage treats a missing images field as an empty array', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: undefined } })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    await deletePackageImage(PACKAGE_ID, 'https://x/whatever.webp')

    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith({ images: [] }, PACKAGE_ID)
  })

  it('redirects to / when a non-admin calls uploadPackageImage (well-formed id, past the UUID check)', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const fd = formData({})
    fd.set('image', fakeImageFile())
    await expect(uploadPackageImage(PACKAGE_ID, fd)).rejects.toThrow('redirect:/')
    expect(packageMediaMaybeSingleMock).not.toHaveBeenCalled()
  })

  it('redirects to / when a non-admin calls deletePackageImage (well-formed id, past the UUID check)', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(deletePackageImage(PACKAGE_ID, 'https://x/a.webp')).rejects.toThrow('redirect:/')
    expect(packageMediaMaybeSingleMock).not.toHaveBeenCalled()
  })
})

function fakeVideoMeta(overrides: Partial<{ fileType: string; fileSize: number }> = {}) {
  return {
    fileName: 'clip.mp4',
    fileType: overrides.fileType ?? 'video/mp4',
    fileSize: overrides.fileSize ?? 10 * 1024 * 1024,
  }
}

describe('requestPackageVideoUpload', () => {
  it('rejects a non-UUID packageId before any auth check', async () => {
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestPackageVideoUpload('bad-id', fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the package does not exist', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: null })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestPackageVideoUpload(PACKAGE_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(storageCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects at the 10-item combined photo/video cap', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({
      data: { id: PACKAGE_ID, images: Array(10).fill('https://x/i.webp'), videos: [] },
    })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestPackageVideoUpload(PACKAGE_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por paquete.' })
  })

  it('rejects a video with an unsupported mime type', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [], videos: [] } })
    const { fileName, fileSize } = fakeVideoMeta()
    const result = await requestPackageVideoUpload(PACKAGE_ID, fileName, 'video/avi', fileSize)
    expect(result).toEqual({ error: 'Formato no válido. Usa MP4, WebM o QuickTime.' })
  })

  it('rejects a video over 50MB', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [], videos: [] } })
    const { fileName, fileType } = fakeVideoMeta()
    const result = await requestPackageVideoUpload(PACKAGE_ID, fileName, fileType, 51 * 1024 * 1024)
    expect(result).toEqual({ error: 'El video no puede superar 50 MB.' })
  })

  it('returns an error when creating the signed URL fails', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [], videos: [] } })
    storageCreateSignedUploadUrl.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestPackageVideoUpload(PACKAGE_ID, fileName, fileType, fileSize)
    expect(result).toEqual({ error: 'No se pudo iniciar la subida del video. Intenta de nuevo.' })
  })

  it('returns the signed upload token, path, and public URL on success', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [], videos: [] } })
    storageCreateSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok-1', path: `packages/${PACKAGE_ID}/clip.mp4`, signedUrl: 'https://x/signed' },
      error: null,
    })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    const result = await requestPackageVideoUpload(PACKAGE_ID, fileName, fileType, fileSize)

    expect(result).toEqual({
      token: 'tok-1',
      path: `packages/${PACKAGE_ID}/clip.mp4`,
      publicUrl: 'https://cdn.example.com/photo.webp',
    })
    expect(storageCreateSignedUploadUrl).toHaveBeenCalledWith(
      'package-videos', expect.stringContaining(`packages/${PACKAGE_ID}/`),
    )
  })

  it('redirects to / when a non-admin calls requestPackageVideoUpload', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    const { fileName, fileType, fileSize } = fakeVideoMeta()
    await expect(requestPackageVideoUpload(PACKAGE_ID, fileName, fileType, fileSize)).rejects.toThrow('redirect:/')
    expect(packageMediaMaybeSingleMock).not.toHaveBeenCalled()
  })
})

describe('confirmPackageVideoUpload', () => {
  it('rejects a non-UUID packageId before any auth check', async () => {
    const result = await confirmPackageVideoUpload('bad-id', 'packages/bad-id/clip.mp4')
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects a path that does not belong to this package, before any auth check', async () => {
    const result = await confirmPackageVideoUpload(PACKAGE_ID, 'packages/some-other-id/clip.mp4')
    expect(result).toEqual({ error: 'Video no válido.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the package does not exist', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: null })
    const result = await confirmPackageVideoUpload(PACKAGE_ID, `packages/${PACKAGE_ID}/clip.mp4`)
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(packageMediaUpdateAwaitMock).not.toHaveBeenCalled()
  })

  it('rejects at the 10-item combined photo/video cap', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({
      data: { id: PACKAGE_ID, images: Array(10).fill('https://x/i.webp'), videos: [] },
    })
    const result = await confirmPackageVideoUpload(PACKAGE_ID, `packages/${PACKAGE_ID}/clip.mp4`)
    expect(result).toEqual({ error: 'Máximo 10 fotos y videos por paquete.' })
    expect(packageMediaUpdateAwaitMock).not.toHaveBeenCalled()
  })

  it('appends the server-derived public URL (not the raw path) to the existing videos array on success', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [], videos: ['https://x/old.mp4'] } })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    await confirmPackageVideoUpload(PACKAGE_ID, `packages/${PACKAGE_ID}/new.mp4`)

    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith(
      { videos: ['https://x/old.mp4', 'https://cdn.example.com/photo.webp'] }, PACKAGE_ID,
    )
  })

  it('returns an error when saving the DB row fails', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, images: [], videos: [] } })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await confirmPackageVideoUpload(PACKAGE_ID, `packages/${PACKAGE_ID}/new.mp4`)

    expect(result).toEqual({ error: 'No se pudo guardar el video.' })
  })

  it('redirects to / when a non-admin calls confirmPackageVideoUpload (well-formed, path-scoped)', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(
      confirmPackageVideoUpload(PACKAGE_ID, `packages/${PACKAGE_ID}/clip.mp4`),
    ).rejects.toThrow('redirect:/')
    expect(packageMediaMaybeSingleMock).not.toHaveBeenCalled()
  })
})

describe('deletePackageVideo', () => {
  it('rejects a non-UUID packageId before any auth check', async () => {
    const result = await deletePackageVideo('bad-id', 'https://x/a.mp4')
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(authGetUser).not.toHaveBeenCalled()
  })

  it('rejects when the package does not exist', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: null })
    const result = await deletePackageVideo(PACKAGE_ID, 'https://x/a.mp4')
    expect(result).toEqual({ error: 'Paquete no encontrado.' })
    expect(storageRemove).not.toHaveBeenCalled()
  })

  it('removes the file from the video bucket and filters the URL out of the videos array', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({
      data: {
        id: PACKAGE_ID,
        videos: [
          'https://x.supabase.co/storage/v1/object/public/package-videos/packages/p1/a.mp4',
          'https://x/keep.mp4',
        ],
      },
    })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    await deletePackageVideo(
      PACKAGE_ID,
      'https://x.supabase.co/storage/v1/object/public/package-videos/packages/p1/a.mp4',
    )

    expect(storageRemove).toHaveBeenCalledWith('package-videos', ['packages/p1/a.mp4'])
    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith({ videos: ['https://x/keep.mp4'] }, PACKAGE_ID)
  })

  it('treats a missing videos field as an empty array', async () => {
    packageMediaMaybeSingleMock.mockResolvedValue({ data: { id: PACKAGE_ID, videos: undefined } })
    packageMediaUpdateAwaitMock.mockResolvedValue({ error: null })

    await deletePackageVideo(PACKAGE_ID, 'https://x/whatever.mp4')

    expect(packageMediaUpdateAwaitMock).toHaveBeenCalledWith({ videos: [] }, PACKAGE_ID)
  })

  it('redirects to / when a non-admin calls deletePackageVideo', async () => {
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })
    await expect(deletePackageVideo(PACKAGE_ID, 'https://x/a.mp4')).rejects.toThrow('redirect:/')
    expect(packageMediaMaybeSingleMock).not.toHaveBeenCalled()
  })
})
