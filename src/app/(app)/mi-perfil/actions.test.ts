import { describe, it, expect, vi, beforeEach } from 'vitest'

// The main invariant worth protecting here: full_name/avatar_url are updated
// on profiles, while phone is upserted into profile_contact_details — a
// separate table (see migration 20260814000000_move_profiles_phone_to_
// contact_details) with owner/admin-only RLS, kept apart from profiles
// because profiles has a broad USING(true) SELECT policy for PostgREST
// embeds. Both go through the RLS-scoped user client — their respective RLS
// policies already restrict writes to the caller's own row, so there's no
// ownership chain to verify like businesses/experiences. Storage operations
// go through the admin client (matching uploadBusinessImage/
// uploadExperienceImage), but the profiles.avatar_url write itself still
// goes through the user client.

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
const profileSelectSingle = vi.fn()
const profileUpdateMock = vi.fn()
const contactUpsertMock = vi.fn()

function profilesUserTable() {
  return {
    select: (cols: string) => ({ eq: () => ({ single: () => profileSelectSingle(cols) }) }),
    update: (payload: unknown) => ({ eq: (col: string, val: string) => profileUpdateMock(payload, col, val) }),
  }
}

function profileContactDetailsUserTable() {
  return {
    upsert: (payload: unknown, opts: unknown) => contactUpsertMock(payload, opts),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return profilesUserTable()
      if (table === 'profile_contact_details') return profileContactDetailsUserTable()
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const storageUpload = vi.fn()
const storageGetPublicUrl = vi.fn()
const storageRemove = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: unknown, opts: unknown) => storageUpload(bucket, path, file, opts),
        getPublicUrl: (path: string) => storageGetPublicUrl(bucket, path),
        remove: (paths: string[]) => storageRemove(bucket, paths),
      }),
    },
  })),
}))

const { updateProfile, uploadAvatar, removeAvatar } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function fakeImageFile(overrides: Partial<{ type: string; size: number }> = {}) {
  const size = overrides.size ?? 1024
  const type = overrides.type ?? 'image/jpeg'
  return new File([new Uint8Array(size)], 'avatar.jpg', { type })
}

const USER_ID = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/avatar.webp' } })
})

describe('auth guard', () => {
  it('redirects to /login when unauthenticated, for every action', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })

    await expect(updateProfile(formData({ full_name: 'Ana' }))).rejects.toThrow('redirect:/login')
    await expect(uploadAvatar(new FormData())).rejects.toThrow('redirect:/login')
    await expect(removeAvatar()).rejects.toThrow('redirect:/login')
  })
})

describe('updateProfile', () => {
  it('rejects a blank name without touching the database', async () => {
    const result = await updateProfile(formData({ full_name: '   ', phone: '3001234567' }))
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(profileUpdateMock).not.toHaveBeenCalled()
    expect(contactUpsertMock).not.toHaveBeenCalled()
  })

  it('trims the name, updates profiles, and upserts phone into profile_contact_details', async () => {
    profileUpdateMock.mockResolvedValue({ error: null })
    contactUpsertMock.mockResolvedValue({ error: null })

    await updateProfile(formData({ full_name: '  Ana Pérez  ', phone: '3001234567' }))

    expect(profileUpdateMock).toHaveBeenCalledWith({ full_name: 'Ana Pérez' }, 'id', USER_ID)
    expect(contactUpsertMock).toHaveBeenCalledWith(
      { profile_id: USER_ID, phone: '3001234567' },
      { onConflict: 'profile_id' },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil')
  })

  it('stores a null phone when left blank', async () => {
    profileUpdateMock.mockResolvedValue({ error: null })
    contactUpsertMock.mockResolvedValue({ error: null })

    await updateProfile(formData({ full_name: 'Ana Pérez', phone: '' }))

    expect(contactUpsertMock).toHaveBeenCalledWith(
      { profile_id: USER_ID, phone: null },
      { onConflict: 'profile_id' },
    )
  })

  it('returns a generic error when the profiles update fails, without touching profile_contact_details', async () => {
    profileUpdateMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await updateProfile(formData({ full_name: 'Ana Pérez' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(contactUpsertMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when the profile_contact_details upsert fails', async () => {
    profileUpdateMock.mockResolvedValue({ error: null })
    contactUpsertMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await updateProfile(formData({ full_name: 'Ana Pérez', phone: '3001234567' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('uploadAvatar', () => {
  it('rejects a missing file', async () => {
    const result = await uploadAvatar(new FormData())
    expect(result).toEqual({ error: 'Selecciona una imagen.' })
    expect(storageUpload).not.toHaveBeenCalled()
  })

  it('rejects an invalid file type', async () => {
    const fd = new FormData()
    fd.set('image', fakeImageFile({ type: 'application/pdf' }))
    const result = await uploadAvatar(fd)
    expect(result).toEqual({ error: 'Formato no válido. Usa JPEG, PNG o WebP.' })
  })

  it('rejects a file over 2 MB', async () => {
    const fd = new FormData()
    fd.set('image', fakeImageFile({ size: 3 * 1024 * 1024 }))
    const result = await uploadAvatar(fd)
    expect(result).toEqual({ error: 'La imagen no puede superar 2 MB.' })
  })

  it('uploads under the user id, saves the public url on the profile, and deletes the previous avatar', async () => {
    profileSelectSingle.mockResolvedValue({
      data: { avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatars/user-1/old.webp' },
    })
    storageUpload.mockResolvedValue({ error: null })
    profileUpdateMock.mockResolvedValue({ error: null })

    const fd = new FormData()
    fd.set('image', fakeImageFile())
    await uploadAvatar(fd)

    expect(storageUpload).toHaveBeenCalledWith(
      'avatars',
      expect.stringMatching(new RegExp(`^${USER_ID}/`)),
      expect.any(File),
      { contentType: 'image/jpeg', upsert: false },
    )
    expect(profileUpdateMock).toHaveBeenCalledWith(
      { avatar_url: 'https://cdn.example.com/avatar.webp' },
      'id',
      USER_ID,
    )
    expect(storageRemove).toHaveBeenCalledWith('avatars', ['user-1/old.webp'])
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil')
  })

  it('does not attempt to delete a previous avatar when there was none', async () => {
    profileSelectSingle.mockResolvedValue({ data: { avatar_url: null } })
    storageUpload.mockResolvedValue({ error: null })
    profileUpdateMock.mockResolvedValue({ error: null })

    const fd = new FormData()
    fd.set('image', fakeImageFile())
    await uploadAvatar(fd)

    expect(storageRemove).not.toHaveBeenCalled()
  })

  it('returns an error when the storage upload fails', async () => {
    profileSelectSingle.mockResolvedValue({ data: { avatar_url: null } })
    storageUpload.mockResolvedValue({ error: { message: 'storage error' } })

    const fd = new FormData()
    fd.set('image', fakeImageFile())
    const result = await uploadAvatar(fd)

    expect(result).toEqual({ error: 'No se pudo subir la foto. Intenta de nuevo.' })
    expect(profileUpdateMock).not.toHaveBeenCalled()
  })

  it('rolls back the uploaded file when saving the profile fails', async () => {
    profileSelectSingle.mockResolvedValue({ data: { avatar_url: null } })
    storageUpload.mockResolvedValue({ error: null })
    profileUpdateMock.mockResolvedValue({ error: { message: 'db error' } })

    const fd = new FormData()
    fd.set('image', fakeImageFile())
    const result = await uploadAvatar(fd)

    expect(result).toEqual({ error: 'No se pudo guardar la foto.' })
    expect(storageRemove).toHaveBeenCalledWith('avatars', [expect.stringMatching(new RegExp(`^${USER_ID}/`))])
  })
})

describe('removeAvatar', () => {
  it('does nothing when there is no avatar to remove', async () => {
    profileSelectSingle.mockResolvedValue({ data: { avatar_url: null } })

    await removeAvatar()

    expect(profileUpdateMock).not.toHaveBeenCalled()
    expect(storageRemove).not.toHaveBeenCalled()
  })

  it('clears avatar_url and deletes the stored object', async () => {
    profileSelectSingle.mockResolvedValue({
      data: { avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatars/user-1/old.webp' },
    })
    profileUpdateMock.mockResolvedValue({ error: null })

    await removeAvatar()

    expect(profileUpdateMock).toHaveBeenCalledWith({ avatar_url: null }, 'id', USER_ID)
    expect(storageRemove).toHaveBeenCalledWith('avatars', ['user-1/old.webp'])
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil')
  })

  it('returns a generic error when the update fails, without touching storage', async () => {
    profileSelectSingle.mockResolvedValue({
      data: { avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatars/user-1/old.webp' },
    })
    profileUpdateMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await removeAvatar()

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(storageRemove).not.toHaveBeenCalled()
  })
})
