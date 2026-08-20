import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlaceCard, { type PlaceCardRow } from './PlaceCard'

const PLACE: PlaceCardRow = {
  id: 'p1',
  slug: 'cascada-x',
  name: 'Cascada X',
  description: 'Una cascada escondida en la montaña.',
  type: 'waterfall',
  images: ['https://x/a.webp'],
}

describe('PlaceCard', () => {
  it('renders name, description, and the type badge', () => {
    render(<PlaceCard place={PLACE} isFavorited={false} isGuest={false} />)

    expect(screen.getByRole('heading', { name: 'Cascada X' })).toBeInTheDocument()
    expect(screen.getByText('Una cascada escondida en la montaña.')).toBeInTheDocument()
    expect(screen.getByText('Cascada')).toBeInTheDocument()
  })

  it('links to the place detail page', () => {
    render(<PlaceCard place={PLACE} isFavorited={false} isGuest={false} />)
    expect(screen.getByRole('link', { name: 'Cascada X' })).toHaveAttribute('href', '/lugares/cascada-x')
  })

  it('falls back to a type icon when there is no image', () => {
    const { container } = render(
      <PlaceCard place={{ ...PLACE, images: null }} isFavorited={false} isGuest={false} />,
    )
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to the generic type label for an unknown type', () => {
    render(<PlaceCard place={{ ...PLACE, type: 'unknown' }} isFavorited={false} isGuest={false} />)
    expect(screen.getByText('Lugar de interés')).toBeInTheDocument()
  })

  it('shows the favorited state via the embedded FavoriteButton', () => {
    render(<PlaceCard place={PLACE} isFavorited={true} isGuest={false} />)
    expect(screen.getByRole('button', { name: 'Quitar de favoritos' })).toBeInTheDocument()
  })

  it('renders a login link for guests instead of a favorite toggle', () => {
    render(<PlaceCard place={PLACE} isFavorited={false} isGuest={true} />)
    expect(screen.getByRole('link', { name: 'Inicia sesión para guardar en favoritos' })).toBeInTheDocument()
  })
})

describe('PlaceCard — compact', () => {
  it('renders a smaller thumbnail row: name, type, and a single-line description', () => {
    render(<PlaceCard place={PLACE} isFavorited={false} isGuest={false} compact />)

    expect(screen.getByRole('heading', { name: 'Cascada X' })).toBeInTheDocument()
    expect(screen.getByText('Cascada')).toBeInTheDocument()
    expect(screen.getByText('Una cascada escondida en la montaña.')).toBeInTheDocument()
  })

  it('still links to the place and supports favoriting', () => {
    render(<PlaceCard place={PLACE} isFavorited={true} isGuest={false} compact />)
    expect(screen.getByRole('link', { name: 'Cascada X' })).toHaveAttribute('href', '/lugares/cascada-x')
    expect(screen.getByRole('button', { name: 'Quitar de favoritos' })).toBeInTheDocument()
  })
})
