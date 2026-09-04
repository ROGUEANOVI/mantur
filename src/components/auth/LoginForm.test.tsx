import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import LoginForm from './LoginForm'

const signInMock = vi.fn()

vi.mock('@/app/(auth)/actions', () => ({
  signIn: (formData: FormData) => signInMock(formData),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ auth: { signInWithOAuth: vi.fn() } })),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginForm', () => {
  it('renders email and password fields', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
  })

  it('submits the entered email and password to signIn', async () => {
    signInMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123!')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(signInMock).toHaveBeenCalledTimes(1)
    const fd = signInMock.mock.calls[0][0] as FormData
    expect(fd.get('email')).toBe('ana@example.com')
    expect(fd.get('password')).toBe('Secreta123!')
  })

  it('shows the server-returned error message as a toast', async () => {
    signInMock.mockResolvedValue({ error: 'Correo o contraseña incorrectos' })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Correo o contraseña incorrectos'))
  })

  it('shows no error toast before submission', () => {
    render(<LoginForm />)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not show an error toast when signIn resolves with no value (redirect path)', async () => {
    signInMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123!')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => expect(signInMock).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    signInMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123!')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByRole('button', { name: 'Ingresando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('renders the Google sign-in button', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeInTheDocument()
  })

  it('shows the oauth error message as a toast when authError is "oauth"', async () => {
    render(<LoginForm authError="oauth" />)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('No se pudo iniciar sesión con Google. Intenta de nuevo.'),
    )
  })

  it('shows the confirmation-link error message as a toast when authError is "confirm"', async () => {
    render(<LoginForm authError="confirm" />)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'El enlace de confirmación no es válido o ya expiró. Intenta registrarte de nuevo.',
      ),
    )
  })

  it('does not show an auth error toast by default', () => {
    render(<LoginForm />)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('toggles the password field between hidden and visible', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    const passwordInput = screen.getByLabelText('Contraseña') as HTMLInputElement
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByLabelText(/mostrar contraseña/i))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByLabelText(/ocultar contraseña/i))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('renders a link to the forgot-password page', () => {
    render(<LoginForm />)
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/recuperar-password',
    )
  })

  it('shows the reset-success message as a toast when resetSuccess is true', async () => {
    render(<LoginForm resetSuccess />)
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Tu contraseña fue actualizada. Inicia sesión con tu nueva contraseña.',
      ),
    )
  })

  it('does not show a reset-success toast by default', () => {
    render(<LoginForm />)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('preserves the entered email and password after a failed login, instead of clearing them', async () => {
    signInMock.mockResolvedValue({ error: 'Correo o contraseña incorrectos' })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'wrong-pass')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@example.com')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('wrong-pass')
  })
})
