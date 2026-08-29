import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WompiBankIdForm from './WompiBankIdForm'

const updateWompiBankIdMock = vi.fn()

vi.mock('@/app/(app)/admin/actions', () => ({
  updateWompiBankId: (formData: FormData) => updateWompiBankIdMock(formData),
}))

const RECIPIENT_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WompiBankIdForm', () => {
  it('renders the current value', () => {
    render(<WompiBankIdForm recipientType="business" recipientId={RECIPIENT_ID} currentWompiBankId="bank-uuid-1" />)
    expect(screen.getByLabelText('ID de banco en Wompi')).toHaveValue('bank-uuid-1')
  })

  it('renders empty when there is no current value', () => {
    render(<WompiBankIdForm recipientType="guide" recipientId={RECIPIENT_ID} currentWompiBankId={null} />)
    expect(screen.getByLabelText('ID de banco en Wompi')).toHaveValue('')
  })

  it('submits recipientType, recipientId, and the typed bank id', async () => {
    updateWompiBankIdMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<WompiBankIdForm recipientType="business" recipientId={RECIPIENT_ID} currentWompiBankId={null} />)

    await user.type(screen.getByLabelText('ID de banco en Wompi'), 'bank-uuid-9')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateWompiBankIdMock).toHaveBeenCalledTimes(1)
    const fd = updateWompiBankIdMock.mock.calls[0][0] as FormData
    expect(fd.get('recipientType')).toBe('business')
    expect(fd.get('recipientId')).toBe(RECIPIENT_ID)
    expect(fd.get('wompiBankId')).toBe('bank-uuid-9')
  })

  it('shows a success message after a successful save', async () => {
    updateWompiBankIdMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<WompiBankIdForm recipientType="business" recipientId={RECIPIENT_ID} currentWompiBankId={null} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('ID de banco guardado.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server-returned error message', async () => {
    updateWompiBankIdMock.mockResolvedValue({ error: 'El destinatario aún no ha registrado su cuenta bancaria.' })
    const user = userEvent.setup()
    render(<WompiBankIdForm recipientType="guide" recipientId={RECIPIENT_ID} currentWompiBankId={null} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El destinatario aún no ha registrado su cuenta bancaria.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not render error or success when the action resolves with no value', async () => {
    updateWompiBankIdMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<WompiBankIdForm recipientType="business" recipientId={RECIPIENT_ID} currentWompiBankId={null} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(updateWompiBankIdMock).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateWompiBankIdMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<WompiBankIdForm recipientType="business" recipientId={RECIPIENT_ID} currentWompiBankId={null} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
