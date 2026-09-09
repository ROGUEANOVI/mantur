import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ToggleRouteButton from './ToggleRouteButton'

const toggleTransporterRouteStatusMock = vi.fn()

vi.mock('@/app/(app)/mi-perfil-transporte/actions', () => ({
  toggleTransporterRouteStatus: (...args: unknown[]) => toggleTransporterRouteStatusMock(...args),
}))

const ROUTE_ID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ToggleRouteButton', () => {
  it('shows "Desactivar" when the route is currently active', () => {
    render(<ToggleRouteButton routeId={ROUTE_ID} currentStatus="active" />)
    expect(screen.getByRole('button', { name: 'Desactivar ruta' })).toHaveTextContent('Desactivar')
  })

  it('shows "Activar" when the route is currently inactive', () => {
    render(<ToggleRouteButton routeId={ROUTE_ID} currentStatus="inactive" />)
    expect(screen.getByRole('button', { name: 'Activar ruta' })).toHaveTextContent('Activar')
  })

  it('calls toggleTransporterRouteStatus with the routeId and the current status on click', async () => {
    toggleTransporterRouteStatusMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ToggleRouteButton routeId={ROUTE_ID} currentStatus="active" />)

    await user.click(screen.getByRole('button', { name: 'Desactivar ruta' }))

    expect(toggleTransporterRouteStatusMock).toHaveBeenCalledWith(ROUTE_ID, 'active')
  })

  it('disables the button and shows the pending label while the transition is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    toggleTransporterRouteStatusMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<ToggleRouteButton routeId={ROUTE_ID} currentStatus="active" />)

    await user.click(screen.getByRole('button', { name: 'Desactivar ruta' }))

    expect(await screen.findByRole('button', { name: 'Desactivar ruta' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Desactivar ruta' })).toHaveTextContent('Actualizando...')

    resolveAction(undefined)
  })
})
