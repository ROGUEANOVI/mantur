import { describe, it, expect, vi, beforeEach } from 'vitest'

// signIn/signUp/signOut have zero automated coverage today — this is the
// biggest security gap in the project (only manually browser-tested during
// /qa). Supabase auth and Next.js navigation are fully mocked.

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`)
  }
}

const redirectMock = vi.fn((url: string) => {
  throw new RedirectSignal(url)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const signInWithPassword = vi.fn()
const authSignUp = vi.fn()
const authSignOut = vi.fn()
const getUserMock = vi.fn()
const profileSingle = vi.fn()
const resetPasswordForEmail = vi.fn()
const updateUserMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword,
      signUp: authSignUp,
      signOut: authSignOut,
      getUser: getUserMock,
      resetPasswordForEmail,
      updateUser: updateUserMock,
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingle }) }) }
      }
      throw new Error(`unexpected table on user client: ${table}`)
    },
  })),
}))

const profilesUpsert = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { upsert: (payload: unknown, opts: unknown) => profilesUpsert(payload, opts) }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

const checkRateLimitMock = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  authRateLimit: {},
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  getClientIp: vi.fn(async () => '203.0.113.1'),
}))

const { signIn, signUp, signOut, requestPasswordReset, updatePassword } = await import('./actions')

function formData(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitMock.mockResolvedValue(true)
})

describe('rate limiting', () => {
  it('signIn returns a rate-limit error and never calls Supabase when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ email: 'user@example.com', password: 'Correct1!' })

    const result = await signIn(fd)

    expect(result).toEqual({ error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' })
    expect(checkRateLimitMock).toHaveBeenCalledWith({}, '203.0.113.1')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('signUp returns a rate-limit error and never calls Supabase when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ email: 'new@example.com', password: 'Correct1!', full_name: 'X' })

    const result = await signUp(fd)

    expect(result).toEqual({ error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' })
    expect(authSignUp).not.toHaveBeenCalled()
  })

  it('requestPasswordReset returns a rate-limit error and never calls Supabase when the limit is exceeded', async () => {
    checkRateLimitMock.mockResolvedValue(false)
    const fd = formData({ email: 'user@example.com' })

    const result = await requestPasswordReset(fd)

    expect(result).toEqual({ error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' })
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })
})

describe('signIn', () => {
  it('returns a generic invalid-credentials error and never redirects on bad login', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const fd = formData({ email: 'user@example.com', password: 'wrong' })

    const result = await signIn(fd)

    // Deliberately vague — never confirms whether the email exists,
    // so this message must be identical for "wrong password" and
    // "no such account".
    expect(result).toEqual({ error: 'Correo o contraseña incorrectos' })
    expect(redirectMock).not.toHaveBeenCalled()
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('redirects an admin to /admin', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    profileSingle.mockResolvedValue({ data: { role: 'admin' } })

    const fd = formData({ email: 'admin@example.com', password: 'Correct1!' })
    await expect(signIn(fd)).rejects.toThrow('redirect:/admin')
  })

  it('redirects a non-admin (tourist, business_owner, etc.) to /', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist' } })

    const fd = formData({ email: 'tourist@example.com', password: 'Correct1!' })
    await expect(signIn(fd)).rejects.toThrow('redirect:/')
  })

  it('redirects to / if the profile role cannot be read after a successful login', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    profileSingle.mockResolvedValue({ data: null })

    const fd = formData({ email: 'user@example.com', password: 'Correct1!' })
    await expect(signIn(fd)).rejects.toThrow('redirect:/')
  })

  it('redirects to / (not /admin) if getUser returns no user right after a successful sign-in', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    getUserMock.mockResolvedValue({ data: { user: null } })

    const fd = formData({ email: 'user@example.com', password: 'Correct1!' })
    await expect(signIn(fd)).rejects.toThrow('redirect:/')
    expect(profileSingle).not.toHaveBeenCalled()
  })
})

describe('signUp password policy', () => {
  const validEmail = 'new@example.com'
  const validFullName = 'Nueva Persona'

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no number', 'Abcdefgh!'],
    ['no special character', 'Abcdefgh1'],
    ['empty', ''],
    ['7 chars — one under the minimum, otherwise valid', 'Abcde1!'],
  ])('rejects a password that is %s, without calling Supabase', async (_label, password) => {
    const fd = formData({ email: validEmail, password, full_name: validFullName })
    const result = await signUp(fd)

    expect(result).toEqual({ error: 'La contraseña no cumple los requisitos de seguridad' })
    expect(authSignUp).not.toHaveBeenCalled()
  })

  it('accepts a password with 8+ chars, an uppercase letter, a number, and a special character', async () => {
    authSignUp.mockResolvedValue({ data: { user: { id: 'new-user-1' }, session: {} }, error: null })
    profilesUpsert.mockResolvedValue({ error: null })

    const fd = formData({ email: validEmail, password: 'Correct1!', full_name: validFullName })
    await expect(signUp(fd)).rejects.toThrow('redirect:/')
    expect(authSignUp).toHaveBeenCalledWith({ email: validEmail, password: 'Correct1!' })
  })

  it('accepts a password at exactly the 8-character minimum', async () => {
    authSignUp.mockResolvedValue({ data: { user: { id: 'new-user-1b' }, session: {} }, error: null })
    profilesUpsert.mockResolvedValue({ error: null })

    const eightChars = 'Abcdef1!'
    expect(eightChars).toHaveLength(8)

    const fd = formData({ email: validEmail, password: eightChars, full_name: validFullName })
    await expect(signUp(fd)).rejects.toThrow('redirect:/')
    expect(authSignUp).toHaveBeenCalledWith({ email: validEmail, password: eightChars })
  })
})

describe('signUp', () => {
  it('maps a Supabase "user_already_exists" error to the emailInUse copy', async () => {
    authSignUp.mockResolvedValue({ data: { user: null }, error: { code: 'user_already_exists' } })
    const fd = formData({ email: 'taken@example.com', password: 'Correct1!', full_name: 'X' })

    const result = await signUp(fd)
    expect(result).toEqual({ error: 'Este correo ya está registrado' })
  })

  it('maps a Supabase "weak_password" error to the weakPassword copy', async () => {
    authSignUp.mockResolvedValue({ data: { user: null }, error: { code: 'weak_password' } })
    const fd = formData({ email: 'x@example.com', password: 'Correct1!', full_name: 'X' })

    const result = await signUp(fd)
    expect(result).toEqual({ error: 'La contraseña no cumple los requisitos de seguridad' })
  })

  it('maps any other Supabase signup error to the generic copy', async () => {
    authSignUp.mockResolvedValue({ data: { user: null }, error: { code: 'some_other_failure' } })
    const fd = formData({ email: 'x@example.com', password: 'Correct1!', full_name: 'X' })

    const result = await signUp(fd)
    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })

  it('always creates the profile with role="tourist", ignoring any role the client might send', async () => {
    authSignUp.mockResolvedValue({ data: { user: { id: 'new-user-2' }, session: {} }, error: null })
    profilesUpsert.mockResolvedValue({ error: null })

    // The real signup form never sends a "role" field, but the action
    // doesn't even read formData.get('role') — this proves privilege
    // escalation via signup isn't possible even if that ever changed.
    const fd = formData({ email: 'x@example.com', password: 'Correct1!', full_name: 'X', role: 'admin' })
    await expect(signUp(fd)).rejects.toThrow('redirect:/')

    expect(profilesUpsert).toHaveBeenCalledWith(
      { id: 'new-user-2', full_name: 'X', role: 'tourist' },
      { onConflict: 'id' },
    )
  })

  it('rejects a missing full_name without calling Supabase', async () => {
    const fd = formData({ email: 'x@example.com', password: 'Correct1!' })
    const result = await signUp(fd)

    expect(result).toEqual({ error: 'El nombre es obligatorio.' })
    expect(authSignUp).not.toHaveBeenCalled()
  })

  it('rejects a full_name containing digits or symbols, without calling Supabase', async () => {
    const fd = formData({ email: 'x@example.com', password: 'Correct1!', full_name: 'Ana123' })
    const result = await signUp(fd)

    expect(result).toEqual({ error: 'El nombre solo puede contener letras y espacios.' })
    expect(authSignUp).not.toHaveBeenCalled()
  })

  it('redirects without touching the profile when Supabase returns no user (e.g. email confirmation pending)', async () => {
    authSignUp.mockResolvedValue({ data: { user: null }, error: null })

    const fd = formData({ email: 'x@example.com', password: 'Correct1!', full_name: 'X' })
    await expect(signUp(fd)).rejects.toThrow('redirect:/')

    expect(profilesUpsert).not.toHaveBeenCalled()
  })

  it('returns a generic error if the profile upsert fails after the auth user was created', async () => {
    authSignUp.mockResolvedValue({ data: { user: { id: 'new-user-4' }, session: {} }, error: null })
    profilesUpsert.mockResolvedValue({ error: { message: 'db error' } })

    const fd = formData({ email: 'x@example.com', password: 'Correct1!', full_name: 'X' })
    const result = await signUp(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('returns pendingConfirmation instead of redirecting when Supabase returns a user but no session', async () => {
    authSignUp.mockResolvedValue({ data: { user: { id: 'new-user-5' }, session: null }, error: null })
    profilesUpsert.mockResolvedValue({ error: null })

    const fd = formData({ email: 'x@example.com', password: 'Correct1!', full_name: 'X' })
    const result = await signUp(fd)

    expect(result).toEqual({ error: null, pendingConfirmation: true })
    expect(redirectMock).not.toHaveBeenCalled()
    // The profile row is still created even though confirmation is pending.
    expect(profilesUpsert).toHaveBeenCalledWith(
      { id: 'new-user-5', full_name: 'X', role: 'tourist' },
      { onConflict: 'id' },
    )
  })
})

describe('requestPasswordReset', () => {
  it('rejects an empty email without calling Supabase', async () => {
    const fd = formData({ email: '' })
    const result = await requestPasswordReset(fd)

    expect(result).toEqual({ error: 'Ingresa tu correo electrónico.' })
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('calls resetPasswordForEmail with the confirm-route redirect and reports success', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })
    const fd = formData({ email: 'user@example.com' })

    const result = await requestPasswordReset(fd)

    expect(result).toEqual({ error: null, emailSent: true })
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://mantur.co/auth/confirm',
    })
  })

  it('reports success even for an email Supabase says does not exist, to avoid account enumeration', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })
    const fd = formData({ email: 'unknown@example.com' })

    const result = await requestPasswordReset(fd)

    expect(result).toEqual({ error: null, emailSent: true })
  })

  it('maps a genuine Supabase failure to a generic error', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'rate limited by provider' } })
    const fd = formData({ email: 'user@example.com' })

    const result = await requestPasswordReset(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
  })
})

describe('updatePassword', () => {
  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no number', 'Abcdefgh!'],
    ['no special character', 'Abcdefgh1'],
    ['empty', ''],
  ])('rejects a new password that is %s, without calling Supabase', async (_label, password) => {
    const fd = formData({ password, confirm_password: password })
    const result = await updatePassword(fd)

    expect(result).toEqual({ error: 'La contraseña no cumple los requisitos de seguridad' })
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched password/confirm without calling Supabase', async () => {
    const fd = formData({ password: 'Correct1!', confirm_password: 'Different1!' })
    const result = await updatePassword(fd)

    expect(result).toEqual({ error: 'Las contraseñas no coinciden' })
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('rejects when there is no active (recovery) session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const fd = formData({ password: 'Correct1!', confirm_password: 'Correct1!' })

    const result = await updatePassword(fd)

    expect(result).toEqual({ error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' })
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('maps a Supabase updateUser failure to a generic error and does not sign out or redirect', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    updateUserMock.mockResolvedValue({ error: { message: 'db error' } })
    const fd = formData({ password: 'Correct1!', confirm_password: 'Correct1!' })

    const result = await updatePassword(fd)

    expect(result).toEqual({ error: 'Ocurrió un error. Intenta de nuevo.' })
    expect(authSignOut).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('updates the password, signs out the recovery session, and redirects to login on success', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    updateUserMock.mockResolvedValue({ error: null })
    authSignOut.mockResolvedValue({ error: null })
    const fd = formData({ password: 'Correct1!', confirm_password: 'Correct1!' })

    await expect(updatePassword(fd)).rejects.toThrow('redirect:/login?reset=success')

    expect(updateUserMock).toHaveBeenCalledWith({ password: 'Correct1!' })
    expect(authSignOut).toHaveBeenCalled()
  })
})

describe('signOut', () => {
  it('signs the user out and redirects to /login', async () => {
    authSignOut.mockResolvedValue({ error: null })
    await expect(signOut()).rejects.toThrow('redirect:/login')
    expect(authSignOut).toHaveBeenCalled()
  })
})
