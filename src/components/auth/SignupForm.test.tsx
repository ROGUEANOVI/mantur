import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignupForm from './SignupForm'

const signUpMock = vi.fn()

vi.mock('@/app/(auth)/actions', () => ({
  signUp: (formData: FormData) => signUpMock(formData),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ auth: { signInWithOAuth: vi.fn() } })),
}))

const STRONG_PASSWORD = 'Correcta1!'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SignupForm', () => {
  it('renders name, email, password, and confirm password fields', () => {
    render(<SignupForm />)
    expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument()
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
    expect(screen.getByText('Mínimo 8 caracteres').closest('div')).toHaveClass('bg-primary/10')
    expect(screen.getByText('Una letra mayúscula').closest('div')).toHaveClass('bg-muted')
    expect(screen.getByText('Un número').closest('div')).toHaveClass('bg-muted')
    expect(screen.getByText('Un carácter especial').closest('div')).toHaveClass('bg-muted')
  })

  it('marks every rule as met once a fully compliant password is typed', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)

    expect(screen.getByText('Mínimo 8 caracteres').closest('div')).toHaveClass('bg-primary/10')
    expect(screen.getByText('Una letra mayúscula').closest('div')).toHaveClass('bg-primary/10')
    expect(screen.getByText('Un número').closest('div')).toHaveClass('bg-primary/10')
    expect(screen.getByText('Un carácter especial').closest('div')).toHaveClass('bg-primary/10')
  })

  it('shows no match/mismatch feedback while confirm password is empty', () => {
    render(<SignupForm />)
    expect(screen.queryByText('Las contraseñas coinciden')).not.toBeInTheDocument()
    expect(screen.queryByText('Las contraseñas no coinciden')).not.toBeInTheDocument()
  })

  it('shows a mismatch message when confirm password differs', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Different1!')

    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(screen.queryByText('Las contraseñas coinciden')).not.toBeInTheDocument()
  })

  it('shows a match message when confirm password equals the password', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)

    expect(screen.getByText('Las contraseñas coinciden')).toBeInTheDocument()
    expect(screen.queryByText('Las contraseñas no coinciden')).not.toBeInTheDocument()
  })

  it('toggles password visibility independently for the password and confirm fields', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    const passwordInput = screen.getByLabelText('Contraseña') as HTMLInputElement
    const confirmInput = screen.getByLabelText('Confirmar contraseña') as HTMLInputElement
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(confirmInput).toHaveAttribute('type', 'password')

    const [passwordToggle, confirmToggle] = screen.getAllByRole('button', { name: 'Mostrar contraseña' })

    await user.click(passwordToggle)
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(confirmInput).toHaveAttribute('type', 'password')

    await user.click(confirmToggle)
    expect(confirmInput).toHaveAttribute('type', 'text')

    expect(screen.getAllByRole('button', { name: 'Ocultar contraseña' })).toHaveLength(2)
  })

  it('rejects a weak password client-side without calling signUp', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'weak')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'weak')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña no cumple los requisitos de seguridad')
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords client-side without calling signUp', async () => {
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Different1!')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden')
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('submits the form to signUp once the password is strong and confirmed', async () => {
    signUpMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(signUpMock).toHaveBeenCalledTimes(1)
    const fd = signUpMock.mock.calls[0][0] as FormData
    expect(fd.get('full_name')).toBe('Ana Pérez')
    expect(fd.get('email')).toBe('ana@example.com')
    expect(fd.get('password')).toBe(STRONG_PASSWORD)
  })

  it('shows the server-returned error message', async () => {
    signUpMock.mockResolvedValue({ error: 'Este correo ya está registrado' })
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Este correo ya está registrado')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    signUpMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('button', { name: 'Creando cuenta...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('renders a link to the login page', () => {
    render(<SignupForm />)
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', '/login')
  })

  it('renders the Google sign-in button alongside the form', () => {
    render(<SignupForm />)
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeInTheDocument()
  })

  it('shows the "check your email" message instead of the form when signUp returns pendingConfirmation', async () => {
    signUpMock.mockResolvedValue({ error: null, pendingConfirmation: true })
    const user = userEvent.setup()
    render(<SignupForm />)

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument()
  })
})
