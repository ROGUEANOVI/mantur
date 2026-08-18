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
const signInWithPasswordMock = vi.fn()
const updateUserMock = vi.fn()
const authSignOutMock = vi.fn()

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
    auth: {
      getUser: authGetUser,
      signInWithPassword: signInWithPasswordMock,
      updateUser: updateUserMock,
      signOut: authSignOutMock,
    },
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

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  changePasswordRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}))

const { updateProfile, uploadAvatar, removeAvatar, changePassword } = await import('./actions')

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
  authGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'ana@example.com' } } })
  storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/avatar.webp' } })
  checkRateLimitMock.mockResolvedValue(true)
})

describe('auth guard', () => {
  it('redirects to /login when unauthenticated, for every action', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })

    await expect(updateProfile(formData({ full_name: 'Ana' }))).rejects.toThrow('redirect:/login')
    await expect(uploadAvatar(new FormData())).rejects.toThrow('redirect:/login')
    await expect(removeAvatar()).rejects.toThrow('redirect:/login')
    await expect(
      changePassword(formData({ current_password: 'x', new_password: 'Correct1!', confirm_password: 'Correct1!' })),
    ).rejects.toThrow('redirect:/login')
  })
})

describe('updateProfile', () => {
  it('rejects a blank name without touching the database', async () => {
    const result = await updateProfile(formData({ full_name: '   ', phone: '3001234567' }))
    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(profileUpdateMock).not.toHaveBeenCalled()
    expect(contactUpsertMock).not.toHaveBeenCalled()
  })

  it('rejects a name containing digits or symbols, without touching the database', async () => {
    const result = await updateProfile(formData({ full_name: 'Ana123', phone: '3001234567' }))
    expect(result).toEqual({ error: 'El nombre solo puede contener letras y espacios.' })
    expect(profileUpdateMock).not.toHaveBeenCalled()
    expect(contactUpsertMock).not.toHaveBeenCalled()
  })

  it('accepts accented letters, ñ, apostrophes, and hyphens in the name', async () => {
    profileUpdateMock.mockResolvedValue({ error: null })
    contactUpsertMock.mockResolvedValue({ error: null })

    await updateProfile(formData({ full_name: "María José O'Connor-Peña", phone: '3001234567' }))

    expect(profileUpdateMock).toHaveBeenCalledWith({ full_name: "María José O'Connor-Peña" }, 'id', USER_ID)
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

  it('normalizes a formatted phone number before storing it', async () => {
    profileUpdateMock.mockResolvedValue({ error: null })
    contactUpsertMock.mockResolvedValue({ error: null })

    await updateProfile(formData({ full_name: 'Ana Pérez', phone: '+57 300 123 4567' }))

    expect(contactUpsertMock).toHaveBeenCalledWith(
      { profile_id: USER_ID, phone: '3001234567' },
      { onConflict: 'profile_id' },
    )
  })

  it('rejects a phone number that is not a valid Colombian mobile, without touching the database', async () => {
    const result = await updateProfile(formData({ full_name: 'Ana Pérez', phone: 'not-a-phone' }))
    expect(result).toEqual({ error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' })
    expect(profileUpdateMock).not.toHaveBeenCalled()
    expect(contactUpsertMock).not.toHaveBeenCalled()
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

describe('changePassword', () => {
  function pwFormData(overrides: Partial<{ current: string; next: string; confirm: string }> = {}) {
    return formData({
      current_password: overrides.current ?? 'CurrentPass1!',
      new_password: overrides.next ?? 'NewCorrect1!',
      confirm_password: overrides.confirm ?? 'NewCorrect1!',
    })
  }

  it('returns a rate-limit error and never calls Supabase when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)

    const result = await changePassword(pwFormData())

    expect(result).toEqual({ error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' })
    expect(checkRateLimitMock).toHaveBeenCalledWith({}, USER_ID)
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no number', 'Abcdefgh!'],
    ['no special character', 'Abcdefgh1'],
    ['empty', ''],
  ])('rejects a new password that is %s, without calling Supabase', async (_label, weak) => {
    const result = await changePassword(pwFormData({ next: weak, confirm: weak }))

    expect(result).toEqual({ error: 'La contraseña no cumple los requisitos de seguridad' })
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched new/confirm passwords without calling Supabase', async () => {
    const result = await changePassword(pwFormData({ confirm: 'Different1!' }))

    expect(result).toEqual({ error: 'Las contraseñas no coinciden' })
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('rejects an incorrect current password without calling updateUser', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: { message: 'Invalid login credentials' } })

    const result = await changePassword(pwFormData())

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'CurrentPass1!',
    })
    expect(result).toEqual({ error: 'La contraseña actual no es correcta' })
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('returns a generic error when updateUser fails after a verified current password, without revoking sessions', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null })
    updateUserMock.mockResolvedValue({ error: { message: 'db error' } })

    const result = await changePassword(pwFormData())

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(authSignOutMock).not.toHaveBeenCalled()
  })

  it('updates the password, revokes other sessions, and does not redirect or sign out the current session', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null })
    updateUserMock.mockResolvedValue({ error: null })
    authSignOutMock.mockResolvedValue({ error: null })

    const result = await changePassword(pwFormData({ next: 'NewCorrect1!', confirm: 'NewCorrect1!' }))

    expect(updateUserMock).toHaveBeenCalledWith({ password: 'NewCorrect1!' })
    expect(authSignOutMock).toHaveBeenCalledWith({ scope: 'others' })
    expect(result).toBeUndefined()
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
