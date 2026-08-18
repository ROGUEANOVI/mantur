import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPasswordForm from './ResetPasswordForm'

const updatePasswordMock = vi.fn()

vi.mock('@/app/(auth)/actions', () => ({
  updatePassword: (formData: FormData) => updatePasswordMock(formData),
}))

const STRONG_PASSWORD = 'Correcta1!'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResetPasswordForm', () => {
  it('renders new-password and confirm-password fields', () => {
    render(<ResetPasswordForm />)
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument()
  })

  it('hides the password requirement checklist before the user types a password', () => {
    render(<ResetPasswordForm />)
    expect(screen.queryByText('Mínimo 8 caracteres')).not.toBeInTheDocument()
  })

  it('shows the requirement checklist once the user starts typing', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), 'abcdefgh')

    expect(screen.getByText('Mínimo 8 caracteres').closest('div')).toHaveClass('bg-primary/10')
    expect(screen.getByText('Una letra mayúscula').closest('div')).toHaveClass('bg-destructive/10')
  })

  it('shows a mismatch message when confirm password differs', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Different1!')

    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument()
  })

  it('shows a match message when confirm password equals the password', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)

    expect(screen.getByText('Las contraseñas coinciden')).toBeInTheDocument()
  })

  it('rejects a weak password client-side without calling updatePassword', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), 'weak')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'weak')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña no cumple los requisitos de seguridad')
    expect(updatePasswordMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords client-side without calling updatePassword', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Different1!')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden')
    expect(updatePasswordMock).not.toHaveBeenCalled()
  })

  it('submits the form to updatePassword once the password is strong and confirmed', async () => {
    updatePasswordMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(updatePasswordMock).toHaveBeenCalledTimes(1)
    const fd = updatePasswordMock.mock.calls[0][0] as FormData
    expect(fd.get('password')).toBe(STRONG_PASSWORD)
    expect(fd.get('confirm_password')).toBe(STRONG_PASSWORD)
  })

  it('shows the server-returned error message', async () => {
    updatePasswordMock.mockResolvedValue({ error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' })
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace no es válido o ya expiró. Solicita uno nuevo.',
    )
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updatePasswordMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    await user.type(screen.getByLabelText('Nueva contraseña'), STRONG_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), STRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('toggles password visibility independently for the password and confirm fields', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm />)

    const passwordInput = screen.getByLabelText('Nueva contraseña') as HTMLInputElement
    const confirmInput = screen.getByLabelText('Confirmar contraseña') as HTMLInputElement
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(confirmInput).toHaveAttribute('type', 'password')

    const [passwordToggle] = screen.getAllByRole('button', { name: 'Mostrar contraseña' })
    await user.click(passwordToggle)
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(confirmInput).toHaveAttribute('type', 'password')
  })
})
