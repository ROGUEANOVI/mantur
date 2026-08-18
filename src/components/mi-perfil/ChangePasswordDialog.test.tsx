import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordDialog from './ChangePasswordDialog'

const changePasswordMock = vi.fn()
const toastSuccessMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil/actions', () => ({
  changePassword: (formData: FormData) => changePasswordMock(formData),
}))

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args) },
}))

const CURRENT_PASSWORD = 'CurrentPass1!'
const NEW_PASSWORD = 'NewCorrect1!'

beforeEach(() => {
  vi.clearAllMocks()
})

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
}

describe('ChangePasswordDialog', () => {
  it('is closed by default', () => {
    render(<ChangePasswordDialog />)
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument()
  })

  it('opens the dialog and renders the three password fields when the trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)

    await openDialog(user)

    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument()
  })

  it('rejects a weak new password client-side without calling changePassword', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)
    await openDialog(user)

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT_PASSWORD)
    await user.type(screen.getByLabelText('Nueva contraseña'), 'weak')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'weak')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña no cumple los requisitos de seguridad')
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('rejects mismatched new/confirm passwords client-side without calling changePassword', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)
    await openDialog(user)

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT_PASSWORD)
    await user.type(screen.getByLabelText('Nueva contraseña'), NEW_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Different1!')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden')
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('submits current, new, and confirm passwords to changePassword when valid', async () => {
    changePasswordMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)
    await openDialog(user)

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT_PASSWORD)
    await user.type(screen.getByLabelText('Nueva contraseña'), NEW_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(changePasswordMock).toHaveBeenCalledTimes(1)
    const fd = changePasswordMock.mock.calls[0][0] as FormData
    expect(fd.get('current_password')).toBe(CURRENT_PASSWORD)
    expect(fd.get('new_password')).toBe(NEW_PASSWORD)
    expect(fd.get('confirm_password')).toBe(NEW_PASSWORD)
  })

  it('shows the server-returned error message', async () => {
    changePasswordMock.mockResolvedValue({ error: 'La contraseña actual no es correcta' })
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)
    await openDialog(user)

    await user.type(screen.getByLabelText('Contraseña actual'), 'wrong')
    await user.type(screen.getByLabelText('Nueva contraseña'), NEW_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    changePasswordMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)
    await openDialog(user)

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT_PASSWORD)
    await user.type(screen.getByLabelText('Nueva contraseña'), NEW_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('toasts success and closes the dialog when changePassword succeeds', async () => {
    changePasswordMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)
    await openDialog(user)

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT_PASSWORD)
    await user.type(screen.getByLabelText('Nueva contraseña'), NEW_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    await vi.waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('¡Contraseña actualizada!'))
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument()
  })

  it('closes without submitting and clears the fields when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordDialog />)
    await openDialog(user)

    await user.type(screen.getByLabelText('Contraseña actual'), CURRENT_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(changePasswordMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument()

    await openDialog(user)
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
  })
})
