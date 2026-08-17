import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlacesListMapToggle from './PlacesListMapToggle'

vi.mock('next/dynamic', () => ({
  default: () => {
    function MockPlacesMap() {
      return <div data-testid="places-map-mock" />
    }
    return MockPlacesMap
  },
}))

describe('PlacesListMapToggle', () => {
  it('shows the list (children) by default', () => {
    render(
      <PlacesListMapToggle mapPlaces={[]}>
        <div data-testid="list-content">Grid</div>
      </PlacesListMapToggle>,
    )

    expect(screen.getByTestId('list-content')).toBeInTheDocument()
    expect(screen.queryByTestId('places-map-mock')).not.toBeInTheDocument()
  })

  it('switches to the map view and back when toggling pills', async () => {
    const user = userEvent.setup()
    render(
      <PlacesListMapToggle mapPlaces={[]}>
        <div data-testid="list-content">Grid</div>
      </PlacesListMapToggle>,
    )

    await user.click(screen.getByRole('tab', { name: 'Mapa' }))
    expect(screen.queryByTestId('list-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('places-map-mock')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Lista' }))
    expect(screen.getByTestId('list-content')).toBeInTheDocument()
    expect(screen.queryByTestId('places-map-mock')).not.toBeInTheDocument()
  })
})
