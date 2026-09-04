import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import ForgotPasswordForm from './ForgotPasswordForm'

const requestPasswordResetMock = vi.fn()

vi.mock('@/app/(auth)/actions', () => ({
  requestPasswordReset: (formData: FormData) => requestPasswordResetMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ForgotPasswordForm', () => {
  it('renders the email field', () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
  })

  it('submits the entered email to requestPasswordReset', async () => {
    requestPasswordResetMock.mockResolvedValue({ error: null, emailSent: true })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))

    expect(requestPasswordResetMock).toHaveBeenCalledTimes(1)
    const fd = requestPasswordResetMock.mock.calls[0][0] as FormData
    expect(fd.get('email')).toBe('ana@example.com')
  })

  it('shows the server-returned error message as a toast', async () => {
    requestPasswordResetMock.mockResolvedValue({ error: 'Ingresa tu correo electrónico.' })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ingresa tu correo electrónico.'))
  })

  it('replaces the form with a confirmation message once the email is sent', async () => {
    requestPasswordResetMock.mockResolvedValue({ error: null, emailSent: true })
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument()
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    requestPasswordResetMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))

    expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeDisabled()

    resolveAction({ error: null, emailSent: true })
  })

  it('shows the expired-link message as a toast when authError is "expired"', async () => {
    render(<ForgotPasswordForm authError="expired" />)
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('El enlace no es válido o ya expiró. Solicita uno nuevo.'),
    )
  })

  it('does not show an auth error toast by default', () => {
    render(<ForgotPasswordForm />)
    expect(toast.error).not.toHaveBeenCalled()
  })
})
