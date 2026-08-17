import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LocationPicker from './LocationPicker'

vi.mock('next/dynamic', () => ({
  default: () => {
    function MockLeafletLocationPicker({
      value,
      onChange,
    }: {
      value: { lat: number; lng: number } | null
      onChange: (coords: { lat: number; lng: number }) => void
    }) {
      return (
        <button
          type="button"
          data-testid="map-mock"
          data-value={value ? `${value.lat},${value.lng}` : ''}
          onClick={() => onChange({ lat: 11.1111, lng: -73.2222 })}
        >
          set pin
        </button>
      )
    }
    return MockLeafletLocationPicker
  },
}))

describe('LocationPicker', () => {
  it('renders empty lat/lng inputs when no default coordinates are given', () => {
    render(<LocationPicker defaultLat={null} defaultLng={null} />)
    expect(screen.getByLabelText('Latitud')).toHaveValue(null)
    expect(screen.getByLabelText('Longitud')).toHaveValue(null)
    expect(screen.queryByText('Quitar ubicación')).not.toBeInTheDocument()
  })

  it('prefills lat/lng inputs from default coordinates', () => {
    render(<LocationPicker defaultLat={11.7808} defaultLng={-72.9944} />)
    expect(screen.getByLabelText('Latitud')).toHaveValue(11.7808)
    expect(screen.getByLabelText('Longitud')).toHaveValue(-72.9944)
    expect(screen.getByText('Quitar ubicación')).toBeInTheDocument()
  })

  it('updates the lat/lng inputs when the map reports a new position', async () => {
    const user = userEvent.setup()
    render(<LocationPicker defaultLat={null} defaultLng={null} />)

    await user.click(screen.getByTestId('map-mock'))

    expect(screen.getByLabelText('Latitud')).toHaveValue(11.1111)
    expect(screen.getByLabelText('Longitud')).toHaveValue(-73.2222)
  })

  it('lets the user type coordinates by hand instead of using the map', async () => {
    const user = userEvent.setup()
    render(<LocationPicker defaultLat={null} defaultLng={null} />)

    await user.type(screen.getByLabelText('Latitud'), '11.5')
    await user.type(screen.getByLabelText('Longitud'), '-73.1')

    expect(screen.getByLabelText('Latitud')).toHaveValue(11.5)
    expect(screen.getByLabelText('Longitud')).toHaveValue(-73.1)
  })

  it('clears the coordinates when "Quitar ubicación" is clicked', async () => {
    const user = userEvent.setup()
    render(<LocationPicker defaultLat={11.7808} defaultLng={-72.9944} />)

    await user.click(screen.getByText('Quitar ubicación'))

    expect(screen.getByLabelText('Latitud')).toHaveValue(null)
    expect(screen.getByLabelText('Longitud')).toHaveValue(null)
  })

  it('renders the label and hint when provided', () => {
    render(
      <LocationPicker
        defaultLat={null}
        defaultLng={null}
        label="Ubicación"
        hint="Tocá el mapa para marcar la ubicación."
      />,
    )
    expect(screen.getByText('Ubicación')).toBeInTheDocument()
    expect(screen.getByText('Tocá el mapa para marcar la ubicación.')).toBeInTheDocument()
  })
})
