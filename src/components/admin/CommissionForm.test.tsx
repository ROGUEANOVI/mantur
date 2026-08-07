import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommissionForm from './CommissionForm'

const updateCommissionRateMock = vi.fn()

vi.mock('@/app/(app)/admin/actions', () => ({
  updateCommissionRate: (formData: FormData) => updateCommissionRateMock(formData),
}))

const CONFIG_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CommissionForm', () => {
  it('renders the known service-type label and the current rate', () => {
    render(<CommissionForm configId={CONFIG_ID} serviceType="experience" currentRate={10} />)
    expect(screen.getByLabelText('Experiencias')).toHaveValue(10)
  })

  it('falls back to the raw serviceType string when it is not in the known map', () => {
    render(<CommissionForm configId={CONFIG_ID} serviceType="guide_tour" currentRate={15} />)
    expect(screen.getByLabelText('guide_tour')).toHaveValue(15)
  })

  it('submits configId and the updated rate', async () => {
    updateCommissionRateMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<CommissionForm configId={CONFIG_ID} serviceType="transport" currentRate={5} />)

    const rateInput = screen.getByLabelText('Transporte')
    await user.clear(rateInput)
    await user.type(rateInput, '12.5')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateCommissionRateMock).toHaveBeenCalledTimes(1)
    const fd = updateCommissionRateMock.mock.calls[0][0] as FormData
    expect(fd.get('configId')).toBe(CONFIG_ID)
    expect(fd.get('rate')).toBe('12.5')
  })

  it('shows a success status message after a successful save', async () => {
    updateCommissionRateMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<CommissionForm configId={CONFIG_ID} serviceType="business" currentRate={8} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Tasa actualizada correctamente.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server-returned error message', async () => {
    updateCommissionRateMock.mockResolvedValue({ error: 'La tasa debe ser un número entre 0 y 100.' })
    const user = userEvent.setup()
    render(<CommissionForm configId={CONFIG_ID} serviceType="business" currentRate={8} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La tasa debe ser un número entre 0 y 100.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not render error or success when the action resolves with no value', async () => {
    updateCommissionRateMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CommissionForm configId={CONFIG_ID} serviceType="business" currentRate={8} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(updateCommissionRateMock).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders neither status nor alert before submission', () => {
    render(<CommissionForm configId={CONFIG_ID} serviceType="business" currentRate={8} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateCommissionRateMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<CommissionForm configId={CONFIG_ID} serviceType="business" currentRate={8} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
