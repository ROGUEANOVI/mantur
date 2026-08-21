import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TransporterCardWithModal from './TransporterCardWithModal'

vi.mock('@/components/transporte/TransportRequestForm', () => ({
  default: () => <div data-testid="transport-request-form" />,
}))

const TRANSPORTER = {
  vehicle_type: 'motocarro',
  license_plate: 'ABC-123',
  phone: '3001234567',
  bio: 'Conozco todos los rincones de Manaure',
  full_name: 'Carlos Ruiz',
  avatar_url: null,
  is_available: true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransporterCardWithModal', () => {
  it('renders the transporter name, vehicle type label, and plate', () => {
    render(<TransporterCardWithModal transporter={TRANSPORTER} access="tourist" />)
    expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument()
    expect(screen.getByText('Motocarro · ABC-123')).toBeInTheDocument()
  })

  it('falls back to "Transportador" when full_name is null', () => {
    render(<TransporterCardWithModal transporter={{ ...TRANSPORTER, full_name: null }} access="tourist" />)
    expect(screen.getAllByText('Transportador').length).toBeGreaterThan(0)
  })

  it('falls back to the raw vehicle_type string when it is not in the known map', () => {
    render(<TransporterCardWithModal transporter={{ ...TRANSPORTER, vehicle_type: 'lancha' }} access="tourist" />)
    expect(screen.getByText('lancha · ABC-123')).toBeInTheDocument()
  })

  it('renders the bio when present', () => {
    render(<TransporterCardWithModal transporter={TRANSPORTER} access="tourist" />)
    expect(screen.getByText('Conozco todos los rincones de Manaure')).toBeInTheDocument()
  })

  it('renders no bio paragraph when bio is null', () => {
    render(<TransporterCardWithModal transporter={{ ...TRANSPORTER, bio: null }} access="tourist" />)
    expect(screen.queryByText('Conozco todos los rincones de Manaure')).not.toBeInTheDocument()
  })

  it('shows a "Disponible" badge when is_available is true', () => {
    render(<TransporterCardWithModal transporter={TRANSPORTER} access="tourist" />)
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('shows a "No disponible" badge when is_available is false', () => {
    render(<TransporterCardWithModal transporter={{ ...TRANSPORTER, is_available: false }} access="tourist" />)
    expect(screen.getByText('No disponible')).toBeInTheDocument()
    expect(screen.queryByText('Disponible')).not.toBeInTheDocument()
  })

  it('opens the request modal when a tourist clicks "Solicitar traslado"', async () => {
    const user = userEvent.setup()
    render(<TransporterCardWithModal transporter={TRANSPORTER} access="tourist" />)

    await user.click(screen.getByRole('button', { name: 'Solicitar traslado' }))

    expect(await screen.findByTestId('transport-request-form')).toBeInTheDocument()
  })

  it('redirects a guest to login instead of opening the modal', async () => {
    const originalLocation = window.location
    // @ts-expect-error — jsdom's location isn't normally reassignable
    delete window.location
    window.location = { ...originalLocation, href: '' } as Location

    const user = userEvent.setup()
    render(<TransporterCardWithModal transporter={TRANSPORTER} access="guest" />)

    await user.click(screen.getByRole('button', { name: 'Solicitar traslado' }))

    expect(window.location.href).toBe('/login?next=/transportistas')
    expect(screen.queryByTestId('transport-request-form')).not.toBeInTheDocument()

    window.location = originalLocation
  })

  it('hides the "Solicitar traslado" button for an authenticated non-tourist role', () => {
    render(<TransporterCardWithModal transporter={TRANSPORTER} access="other_role" />)

    expect(screen.queryByRole('button', { name: 'Solicitar traslado' })).not.toBeInTheDocument()
    // The rest of the card still renders.
    expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument()
  })
})
