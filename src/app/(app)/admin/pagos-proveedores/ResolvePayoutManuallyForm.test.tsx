import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResolvePayoutManuallyForm from './ResolvePayoutManuallyForm'

const resolveProviderPayoutManuallyMock = vi.fn()

vi.mock('@/app/(app)/admin/pagos-proveedores/actions', () => ({
  resolveProviderPayoutManually: (formData: FormData) => resolveProviderPayoutManuallyMock(formData),
}))

const PAYOUT_ID = '44444444-4444-4444-4444-444444444444'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ResolvePayoutManuallyForm', () => {
  it('shows only the toggle button initially', () => {
    render(<ResolvePayoutManuallyForm payoutId={PAYOUT_ID} />)
    expect(screen.getByRole('button', { name: 'Marcar como resuelto manualmente' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/cómo se le pagó/i)).not.toBeInTheDocument()
  })

  it('reveals the notes form, with the payoutId as a hidden field, after clicking the toggle', async () => {
    const user = userEvent.setup()
    const { container } = render(<ResolvePayoutManuallyForm payoutId={PAYOUT_ID} />)

    await user.click(screen.getByRole('button', { name: 'Marcar como resuelto manualmente' }))

    expect(screen.getByPlaceholderText(/cómo se le pagó/i)).toBeInTheDocument()
    expect(container.querySelector('input[name="payoutId"]')).toHaveValue(PAYOUT_ID)
  })

  it('closes the form and returns to the toggle button when "Cancelar" is clicked', async () => {
    const user = userEvent.setup()
    render(<ResolvePayoutManuallyForm payoutId={PAYOUT_ID} />)

    await user.click(screen.getByRole('button', { name: 'Marcar como resuelto manualmente' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Marcar como resuelto manualmente' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/cómo se le pagó/i)).not.toBeInTheDocument()
  })

  it('submits the payoutId and the typed notes', async () => {
    resolveProviderPayoutManuallyMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ResolvePayoutManuallyForm payoutId={PAYOUT_ID} />)

    await user.click(screen.getByRole('button', { name: 'Marcar como resuelto manualmente' }))
    await user.type(screen.getByPlaceholderText(/cómo se le pagó/i), 'Transferencia Bancolombia ref #123')
    await user.click(screen.getByRole('button', { name: 'Confirmar resolución' }))

    expect(resolveProviderPayoutManuallyMock).toHaveBeenCalledTimes(1)
    const fd = resolveProviderPayoutManuallyMock.mock.calls[0][0] as FormData
    expect(fd.get('payoutId')).toBe(PAYOUT_ID)
    expect(fd.get('notes')).toBe('Transferencia Bancolombia ref #123')
  })
})
