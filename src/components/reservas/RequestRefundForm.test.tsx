import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequestRefundForm from './RequestRefundForm'

const requestRefundMock = vi.fn()

vi.mock('@/app/(app)/mis-reservas/actions', () => ({
  requestRefund: (formData: FormData) => requestRefundMock(formData),
}))

const BOOKING_ID = '44444444-4444-4444-4444-444444444444'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RequestRefundForm', () => {
  it('shows only the "Solicitar reembolso" toggle button initially', () => {
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)
    expect(screen.getByRole('button', { name: 'Solicitar reembolso' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/cuéntanos por qué/i)).not.toBeInTheDocument()
  })

  it('reveals the reason form, with the booking id as a hidden field, after clicking the toggle', async () => {
    const user = userEvent.setup()
    const { container } = render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))

    expect(screen.getByPlaceholderText(/cuéntanos por qué/i)).toBeInTheDocument()
    expect(container.querySelector('input[name="booking_id"]')).toHaveValue(BOOKING_ID)
  })

  it('closes the form and returns to the toggle button when cancelled', async () => {
    const user = userEvent.setup()
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Solicitar reembolso' })).toBeInTheDocument()
  })

  it('submits the booking id and the typed reason', async () => {
    requestRefundMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))
    await user.type(screen.getByPlaceholderText(/cuéntanos por qué/i), 'Cambio de planes')
    await user.click(screen.getByRole('button', { name: 'Confirmar solicitud' }))

    expect(requestRefundMock).toHaveBeenCalledTimes(1)
    const fd = requestRefundMock.mock.calls[0][0] as FormData
    expect(fd.get('booking_id')).toBe(BOOKING_ID)
    expect(fd.get('reason')).toBe('Cambio de planes')
  })

  it('shows the server-returned error message', async () => {
    requestRefundMock.mockResolvedValue({ error: 'Ya existe una solicitud de reembolso para esta reserva.' })
    const user = userEvent.setup()
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar solicitud' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una solicitud de reembolso para esta reserva.')
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    requestRefundMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar solicitud' }))

    expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeDisabled()

    resolveAction(undefined)
    await waitFor(() => expect(requestRefundMock).toHaveBeenCalled())
  })

  it('marks payout_instructions as required, with a "required" hint, when likelyAutoVoid is false', async () => {
    const user = userEvent.setup()
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={false} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))

    const textarea = screen.getByPlaceholderText(/Nequi 300 000 0000/i)
    expect(textarea).toBeRequired()
    expect(screen.getByText(/no puede procesarse automáticamente/i)).toBeInTheDocument()
  })

  it('leaves payout_instructions optional, with an "optional" hint, when likelyAutoVoid is true', async () => {
    const user = userEvent.setup()
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))

    const textarea = screen.getByPlaceholderText(/Nequi 300 000 0000/i)
    expect(textarea).not.toBeRequired()
    expect(screen.getByText(/te ahorra que te contactemos después/i)).toBeInTheDocument()
  })

  it('submits the typed payout_instructions', async () => {
    requestRefundMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<RequestRefundForm bookingId={BOOKING_ID} likelyAutoVoid={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar reembolso' }))
    await user.type(screen.getByPlaceholderText(/Nequi 300 000 0000/i), 'Nequi 3001234567')
    await user.click(screen.getByRole('button', { name: 'Confirmar solicitud' }))

    expect(requestRefundMock).toHaveBeenCalledTimes(1)
    const fd = requestRefundMock.mock.calls[0][0] as FormData
    expect(fd.get('payout_instructions')).toBe('Nequi 3001234567')
  })
})
