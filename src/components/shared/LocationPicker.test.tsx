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

function hiddenValue(container: HTMLElement, name: string) {
  return (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value
}

describe('LocationPicker', () => {
  it('renders empty hidden inputs when no default coordinates are given', () => {
    const { container } = render(<LocationPicker defaultLat={null} defaultLng={null} />)
    expect(hiddenValue(container, 'lat')).toBe('')
    expect(hiddenValue(container, 'lng')).toBe('')
    expect(screen.queryByText('Quitar ubicación')).not.toBeInTheDocument()
  })

  it('renders hidden inputs prefilled from default coordinates', () => {
    const { container } = render(<LocationPicker defaultLat={11.7808} defaultLng={-72.9944} />)
    expect(hiddenValue(container, 'lat')).toBe('11.7808')
    expect(hiddenValue(container, 'lng')).toBe('-72.9944')
    expect(screen.getByText('11.78080, -72.99440')).toBeInTheDocument()
  })

  it('updates the hidden inputs when the map reports a new position', async () => {
    const user = userEvent.setup()
    const { container } = render(<LocationPicker defaultLat={null} defaultLng={null} />)

    await user.click(screen.getByTestId('map-mock'))

    expect(hiddenValue(container, 'lat')).toBe('11.1111')
    expect(hiddenValue(container, 'lng')).toBe('-73.2222')
  })

  it('clears the coordinates when "Quitar ubicación" is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(<LocationPicker defaultLat={11.7808} defaultLng={-72.9944} />)

    await user.click(screen.getByText('Quitar ubicación'))

    expect(hiddenValue(container, 'lat')).toBe('')
    expect(hiddenValue(container, 'lng')).toBe('')
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
