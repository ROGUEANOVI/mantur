import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RejectForm from './RejectForm'

const rejectRoleRequestMock = vi.fn()

vi.mock('@/app/(app)/admin/actions', () => ({
  rejectRoleRequest: (formData: FormData) => rejectRoleRequestMock(formData),
}))

const REQUEST_ID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RejectForm', () => {
  it('shows only the "Rechazar" toggle button initially', () => {
    render(<RejectForm requestId={REQUEST_ID} />)
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/explica al usuario/i)).not.toBeInTheDocument()
  })

  it('reveals the reason form, with the requestId as a hidden field, after clicking "Rechazar"', async () => {
    const user = userEvent.setup()
    const { container } = render(<RejectForm requestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))

    expect(screen.getByPlaceholderText(/explica al usuario/i)).toBeInTheDocument()
    expect(container.querySelector('input[name="requestId"]')).toHaveValue(REQUEST_ID)
  })

  it('closes the form and returns to the toggle button when "Cancelar" is clicked', async () => {
    const user = userEvent.setup()
    render(<RejectForm requestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/explica al usuario/i)).not.toBeInTheDocument()
  })

  it('submits the requestId and the typed rejection reason', async () => {
    rejectRoleRequestMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<RejectForm requestId={REQUEST_ID} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    await user.type(screen.getByPlaceholderText(/explica al usuario/i), 'No cumple los requisitos')
    await user.click(screen.getByRole('button', { name: 'Confirmar rechazo' }))

    expect(rejectRoleRequestMock).toHaveBeenCalledTimes(1)
    const fd = rejectRoleRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('requestId')).toBe(REQUEST_ID)
    expect(fd.get('rejection_reason')).toBe('No cumple los requisitos')
  })
})
