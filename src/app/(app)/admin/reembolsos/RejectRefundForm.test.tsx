import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RejectRefundForm from './RejectRefundForm'

const rejectRefundRequestMock = vi.fn()

vi.mock('@/app/(app)/admin/reembolsos/actions', () => ({
  rejectRefundRequest: (formData: FormData) => rejectRefundRequestMock(formData),
}))

const REFUND_ID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RejectRefundForm', () => {
  it('shows only the "Rechazar" toggle button initially', () => {
    render(<RejectRefundForm refundRequestId={REFUND_ID} />)
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/explica por qué/i)).not.toBeInTheDocument()
  })

  it('reveals the reason form, with the refundRequestId as a hidden field, after clicking "Rechazar"', async () => {
    const user = userEvent.setup()
    const { container } = render(<RejectRefundForm refundRequestId={REFUND_ID} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))

    expect(screen.getByPlaceholderText(/explica por qué/i)).toBeInTheDocument()
    expect(container.querySelector('input[name="refundRequestId"]')).toHaveValue(REFUND_ID)
  })

  it('closes the form and returns to the toggle button when "Cancelar" is clicked', async () => {
    const user = userEvent.setup()
    render(<RejectRefundForm refundRequestId={REFUND_ID} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/explica por qué/i)).not.toBeInTheDocument()
  })

  it('submits the refundRequestId and the typed rejection reason', async () => {
    rejectRefundRequestMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<RejectRefundForm refundRequestId={REFUND_ID} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    await user.type(screen.getByPlaceholderText(/explica por qué/i), 'Fuera de la ventana permitida')
    await user.click(screen.getByRole('button', { name: 'Confirmar rechazo' }))

    expect(rejectRefundRequestMock).toHaveBeenCalledTimes(1)
    const fd = rejectRefundRequestMock.mock.calls[0][0] as FormData
    expect(fd.get('refundRequestId')).toBe(REFUND_ID)
    expect(fd.get('rejection_reason')).toBe('Fuera de la ventana permitida')
  })
})
