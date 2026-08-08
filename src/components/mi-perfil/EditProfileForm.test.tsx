import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditProfileForm from './EditProfileForm'

const updateProfileMock = vi.fn()
const uploadAvatarMock = vi.fn()
const removeAvatarMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil/actions', () => ({
  updateProfile: (formData: FormData) => updateProfileMock(formData),
  uploadAvatar: (formData: FormData) => uploadAvatarMock(formData),
  removeAvatar: () => removeAvatarMock(),
}))

const DEFAULT_PROPS = {
  fullName: 'Ana Pérez',
  phone: '3001234567',
  email: 'ana@example.com',
  avatarUrl: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditProfileForm', () => {
  it('pre-populates name and phone', () => {
    render(<EditProfileForm {...DEFAULT_PROPS} />)
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Ana Pérez')
    expect(screen.getByLabelText('Teléfono')).toHaveValue('3001234567')
  })

  it('shows the email as read-only', () => {
    render(<EditProfileForm {...DEFAULT_PROPS} />)
    const emailInput = screen.getByLabelText('Correo electrónico')
    expect(emailInput).toHaveValue('ana@example.com')
    expect(emailInput).toBeDisabled()
  })

  it('submits the trimmed name and phone', async () => {
    updateProfileMock.mockResolvedValue({ saved: true })
    const user = userEvent.setup()
    render(<EditProfileForm {...DEFAULT_PROPS} />)

    await user.clear(screen.getByLabelText('Nombre completo'))
    await user.type(screen.getByLabelText('Nombre completo'), 'Ana María Pérez')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateProfileMock).toHaveBeenCalledTimes(1)
    const fd = updateProfileMock.mock.calls[0][0] as FormData
    expect(fd.get('full_name')).toBe('Ana María Pérez')
    expect(fd.get('phone')).toBe('3001234567')
  })

  it('shows a saved message after a successful save', async () => {
    updateProfileMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<EditProfileForm {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('¡Perfil actualizado!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the error message when the save fails', async () => {
    updateProfileMock.mockResolvedValue({ error: 'El nombre es obligatorio.' })
    const user = userEvent.setup()
    render(<EditProfileForm {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El nombre es obligatorio.')
  })

  it('renders a back link to the homepage', () => {
    render(<EditProfileForm {...DEFAULT_PROPS} />)
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateProfileMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<EditProfileForm {...DEFAULT_PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction(undefined)
  })

  it('passes the avatar props through to the avatar uploader', () => {
    render(<EditProfileForm {...DEFAULT_PROPS} avatarUrl="https://x/a.webp" />)
    expect(screen.getByRole('img', { name: 'Ana Pérez' })).toHaveAttribute('src', 'https://x/a.webp')
  })

  it('falls back to the email for avatar initials when there is no name yet', () => {
    render(<EditProfileForm {...DEFAULT_PROPS} fullName="" avatarUrl={null} />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
