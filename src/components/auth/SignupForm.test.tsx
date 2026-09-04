import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import SignupForm from './SignupForm'

const signUpMock = vi.fn()

vi.mock('@/app/(auth)/actions', () => ({
  signUp: (formData: FormData) => signUpMock(formData),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ auth: { signInWithOAuth: vi.fn() } })),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const STRONG_PASSWORD = 'Correcta1!'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SignupForm', () => {
  it('renders name, email, and password fields (no confirm password field)', () => {
    render(<SignupForm />)
    expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(screen.queryByLabelText('Confirmar contraseña')).not.toBeInTheDocument()
  })

  it('hides the password requirement checklist before the user types a password', () => {
    render(<SignupForm />)
    expect(screen.queryByText('Mínimo 8 caracteres')).not.toBeInTheDocument()
  })

  it('shows the requirement checklist once the user starts typing, reflecting which rules are met', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Contraseña'), 'abcdefgh')

    // 8+ lowercase letters: meets minLength, fails uppercase/digit/special
    expect(screen.getByText('Mínimo 8 caracteres').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Una letra mayúscula').closest('li')).toHaveAttribute('data-met', 'false')
    expect(screen.getByText('Un número').closest('li')).toHaveAttribute('data-met', 'false')
    expect(screen.getByText('Un carácter especial').closest('li')).toHaveAttribute('data-met', 'false')
  })

  it('marks every rule as met once a fully compliant password is typed', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)

    expect(screen.getByText('Mínimo 8 caracteres').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Una letra mayúscula').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Un número').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Un carácter especial').closest('li')).toHaveAttribute('data-met', 'true')
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    const passwordInput = screen.getByLabelText('Contraseña') as HTMLInputElement
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('rejects a weak password client-side without calling signUp', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'weak')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('La contraseña no cumple los requisitos de seguridad'),
    )
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('shows an inline error on blur for a name with digits/symbols, without calling signUp', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana123')
    await user.tab()

    expect(
      await screen.findByText('El nombre solo puede contener letras y espacios.'),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('submits the form to signUp once the password is strong', async () => {
    signUpMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(signUpMock).toHaveBeenCalledTimes(1)
    const fd = signUpMock.mock.calls[0][0] as FormData
    expect(fd.get('full_name')).toBe('Ana Pérez')
    expect(fd.get('email')).toBe('ana@example.com')
    expect(fd.get('password')).toBe(STRONG_PASSWORD)
  })

  it('shows the server-returned error message as a toast', async () => {
    signUpMock.mockResolvedValue({ error: 'Este correo ya está registrado' })
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Este correo ya está registrado'))
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    signUpMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('button', { name: 'Creando cuenta...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('renders the Google sign-in button alongside the form', () => {
    render(<SignupForm />)
    expect(screen.getByRole('button', { name: 'Regístrate con Google' })).toBeInTheDocument()
  })

  it('shows the "check your email" message instead of the form when signUp returns pendingConfirmation', async () => {
    signUpMock.mockResolvedValue({ error: null, pendingConfirmation: true })
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument()
  })
})
