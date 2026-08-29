import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RefundPolicyForm from './RefundPolicyForm'

const updateRefundPolicyRateMock = vi.fn()

vi.mock('@/app/(app)/admin/reembolsos/actions', () => ({
  updateRefundPolicyRate: (formData: FormData) => updateRefundPolicyRateMock(formData),
}))

const CONFIG_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RefundPolicyForm', () => {
  it('renders the known tier label and the current rate', () => {
    render(<RefundPolicyForm configId={CONFIG_ID} minHoursBeforeBooking={72} currentRate={100} />)
    expect(screen.getByLabelText('Con 72 horas o más de anticipación')).toHaveValue(100)
  })

  it('falls back to a generic "≥ Nh" label for an unknown tier', () => {
    render(<RefundPolicyForm configId={CONFIG_ID} minHoursBeforeBooking={48} currentRate={75} />)
    expect(screen.getByLabelText('≥ 48h')).toHaveValue(75)
  })

  it('submits configId and the updated rate', async () => {
    updateRefundPolicyRateMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RefundPolicyForm configId={CONFIG_ID} minHoursBeforeBooking={24} currentRate={50} />)

    const rateInput = screen.getByLabelText('Entre 24 y 72 horas de anticipación')
    await user.clear(rateInput)
    await user.type(rateInput, '60')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateRefundPolicyRateMock).toHaveBeenCalledTimes(1)
    const fd = updateRefundPolicyRateMock.mock.calls[0][0] as FormData
    expect(fd.get('configId')).toBe(CONFIG_ID)
    expect(fd.get('rate')).toBe('60')
  })

  it('shows a success status message after a successful save', async () => {
    updateRefundPolicyRateMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<RefundPolicyForm configId={CONFIG_ID} minHoursBeforeBooking={0} currentRate={0} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Ventana actualizada correctamente.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server-returned error message', async () => {
    updateRefundPolicyRateMock.mockResolvedValue({ error: 'El porcentaje debe ser un número entre 0 y 100.' })
    const user = userEvent.setup()
    render(<RefundPolicyForm configId={CONFIG_ID} minHoursBeforeBooking={0} currentRate={0} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El porcentaje debe ser un número entre 0 y 100.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not render error or success when the action resolves with no value', async () => {
    updateRefundPolicyRateMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<RefundPolicyForm configId={CONFIG_ID} minHoursBeforeBooking={0} currentRate={0} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(updateRefundPolicyRateMock).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateRefundPolicyRateMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<RefundPolicyForm configId={CONFIG_ID} minHoursBeforeBooking={0} currentRate={0} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
