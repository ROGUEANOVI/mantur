import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToggleServiceButton } from './ToggleServiceButton'

const toggleServiceStatusMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  toggleServiceStatus: (...args: unknown[]) => toggleServiceStatusMock(...args),
}))

const SERVICE_ID = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ToggleServiceButton', () => {
  it('shows "Desactivar" when the service is currently active', () => {
    render(<ToggleServiceButton serviceId={SERVICE_ID} currentStatus="active" />)
    expect(screen.getByRole('button', { name: 'Desactivar servicio' })).toHaveTextContent('Desactivar')
  })

  it('shows "Activar" when the service is currently inactive', () => {
    render(<ToggleServiceButton serviceId={SERVICE_ID} currentStatus="inactive" />)
    expect(screen.getByRole('button', { name: 'Activar servicio' })).toHaveTextContent('Activar')
  })

  it('calls toggleServiceStatus with the serviceId and the current status on click', async () => {
    toggleServiceStatusMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ToggleServiceButton serviceId={SERVICE_ID} currentStatus="active" />)

    await user.click(screen.getByRole('button', { name: 'Desactivar servicio' }))

    expect(toggleServiceStatusMock).toHaveBeenCalledWith(SERVICE_ID, 'active')
  })

  it('disables the button and shows the pending label while the transition is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    toggleServiceStatusMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<ToggleServiceButton serviceId={SERVICE_ID} currentStatus="active" />)

    await user.click(screen.getByRole('button', { name: 'Desactivar servicio' }))

    expect(await screen.findByRole('button', { name: 'Desactivar servicio' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Desactivar servicio' })).toHaveTextContent('Actualizando...')

    resolveAction(undefined)
  })
})
