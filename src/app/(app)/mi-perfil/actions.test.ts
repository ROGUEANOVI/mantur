import { describe, it, expect, vi, beforeEach } from 'vitest'

// The main invariant worth protecting here: profile text fields (full_name,
// phone) are updated through the RLS-scoped user client — profiles RLS
// already restricts UPDATE to the caller's own row, so there's no ownership
// chain to verify like businesses/experiences. Storage operations go through
// the admin client (matching uploadBusinessImage/uploadExperienceImage), but
// the profiles.avatar_url write itself still goes through the user client.

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

function profilesUserTable() {
  return {
    select: (cols: string) => ({ eq: () => ({ single: () => profileSelectSingle(cols) }) }),
    update: (payload: unknown) => ({ eq: (col: string, val: string) => profileUpdateMock(payload, col, val) }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: (table: string) => {
      if (table === 'profiles') return profilesUserTable()
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
  })

  it('trims the name and updates the caller\'s own row', async () => {
    profileUpdateMock.mockResolvedValue({ error: null })

    await updateProfile(formData({ full_name: '  Ana Pérez  ', phone: '3001234567' }))

    expect(profileUpdateMock).toHaveBeenCalledWith(
      { full_name: 'Ana Pérez', phone: '3001234567' },
      'id',
      USER_ID,
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/mi-perfil')
  })

  it('stores a null phone when left blank', async () => {
    profileUpdateMock.mockResolvedValue({ error: null })

    await updateProfile(formData({ full_name: 'Ana Pérez', phone: '' }))

    expect(profileUpdateMock).toHaveBeenCalledWith(
      { full_name: 'Ana Pérez', phone: null },
      'id',
      USER_ID,
    )
  })

  it('returns a generic error when the update fails', async () => {
    profileUpdateMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await updateProfile(formData({ full_name: 'Ana Pérez' }))

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
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
