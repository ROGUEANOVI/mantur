import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EntityListMapToggle from './EntityListMapToggle'

vi.mock('next/dynamic', () => ({
  default: () => {
    function MockEntityMap() {
      return <div data-testid="entity-map-mock" />
    }
    return MockEntityMap
  },
}))

describe('EntityListMapToggle', () => {
  it('shows the list (children) by default', () => {
    render(
      <EntityListMapToggle mapItems={[]} basePath="/lugares" listLabel="Lista" mapLabel="Mapa">
        <div data-testid="list-content">Grid</div>
      </EntityListMapToggle>,
    )

    expect(screen.getByTestId('list-content')).toBeInTheDocument()
    expect(screen.queryByTestId('entity-map-mock')).not.toBeInTheDocument()
  })

  it('switches to the map view and back when toggling pills', async () => {
    const user = userEvent.setup()
    render(
      <EntityListMapToggle mapItems={[]} basePath="/lugares" listLabel="Lista" mapLabel="Mapa">
        <div data-testid="list-content">Grid</div>
      </EntityListMapToggle>,
    )

    await user.click(screen.getByRole('tab', { name: 'Mapa' }))
    expect(screen.queryByTestId('list-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('entity-map-mock')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Lista' }))
    expect(screen.getByTestId('list-content')).toBeInTheDocument()
    expect(screen.queryByTestId('entity-map-mock')).not.toBeInTheDocument()
  })
})
