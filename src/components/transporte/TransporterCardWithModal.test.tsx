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
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransporterCardWithModal', () => {
  it('renders the transporter name, vehicle type label, and plate', () => {
    render(<TransporterCardWithModal transporter={TRANSPORTER} isTourist={true} />)
    expect(screen.getByText('Carlos Ruiz')).toBeInTheDocument()
    expect(screen.getByText('Motocarro · ABC-123')).toBeInTheDocument()
  })

  it('falls back to "Transportador" when full_name is null', () => {
    render(<TransporterCardWithModal transporter={{ ...TRANSPORTER, full_name: null }} isTourist={true} />)
    expect(screen.getAllByText('Transportador').length).toBeGreaterThan(0)
  })

  it('falls back to the raw vehicle_type string when it is not in the known map', () => {
    render(<TransporterCardWithModal transporter={{ ...TRANSPORTER, vehicle_type: 'lancha' }} isTourist={true} />)
    expect(screen.getByText('lancha · ABC-123')).toBeInTheDocument()
  })

  it('renders the bio when present', () => {
    render(<TransporterCardWithModal transporter={TRANSPORTER} isTourist={true} />)
    expect(screen.getByText('Conozco todos los rincones de Manaure')).toBeInTheDocument()
  })

  it('renders no bio paragraph when bio is null', () => {
    render(<TransporterCardWithModal transporter={{ ...TRANSPORTER, bio: null }} isTourist={true} />)
    expect(screen.queryByText('Conozco todos los rincones de Manaure')).not.toBeInTheDocument()
  })

  it('opens the request modal when a tourist clicks "Solicitar traslado"', async () => {
    const user = userEvent.setup()
    render(<TransporterCardWithModal transporter={TRANSPORTER} isTourist={true} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar traslado' }))

    expect(await screen.findByTestId('transport-request-form')).toBeInTheDocument()
  })

  it('redirects a non-tourist to login instead of opening the modal', async () => {
    const originalLocation = window.location
    // @ts-expect-error — jsdom's location isn't normally reassignable
    delete window.location
    window.location = { ...originalLocation, href: '' } as Location

    const user = userEvent.setup()
    render(<TransporterCardWithModal transporter={TRANSPORTER} isTourist={false} />)

    await user.click(screen.getByRole('button', { name: 'Solicitar traslado' }))

    expect(window.location.href).toBe('/login?next=/transportistas')
    expect(screen.queryByTestId('transport-request-form')).not.toBeInTheDocument()

    window.location = originalLocation
  })
})
