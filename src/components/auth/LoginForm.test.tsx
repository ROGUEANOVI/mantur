import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from './LoginForm'

const signInMock = vi.fn()

vi.mock('@/app/(auth)/actions', () => ({
  signIn: (formData: FormData) => signInMock(formData),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ auth: { signInWithOAuth: vi.fn() } })),
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
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(signInMock).toHaveBeenCalledTimes(1)
    const fd = signInMock.mock.calls[0][0] as FormData
    expect(fd.get('email')).toBe('ana@example.com')
    expect(fd.get('password')).toBe('Secreta123!')
  })

  it('shows the server-returned error message', async () => {
    signInMock.mockResolvedValue({ error: 'Correo o contraseña incorrectos' })
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos')
  })

  it('renders no error before submission', () => {
    render(<LoginForm />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not render an error when signIn resolves with no value (redirect path)', async () => {
    signInMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123!')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    await waitFor(() => expect(signInMock).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    signInMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'Secreta123!')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('button', { name: 'Iniciando sesión...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('renders a link to the signup page', () => {
    render(<LoginForm />)
    expect(screen.getByRole('link', { name: 'Regístrate' })).toHaveAttribute('href', '/signup')
  })

  it('renders the Google sign-in button', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeInTheDocument()
  })

  it('shows the oauth error message when oauthError is true', () => {
    render(<LoginForm oauthError />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo iniciar sesión con Google. Intenta de nuevo.',
    )
  })

  it('does not show the oauth error message by default', () => {
    render(<LoginForm />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
