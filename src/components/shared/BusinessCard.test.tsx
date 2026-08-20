import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BusinessCard, { type BusinessCardRow } from './BusinessCard'

const BUSINESS: BusinessCardRow = {
  id: 'b1',
  slug: 'finca-x',
  name: 'Finca X',
  description: 'Un lugar hermoso para descansar.',
  images: ['https://x/a.webp'],
  address: 'Vereda El Carmen',
  business_category_links: [
    { business_categories: { name: 'Fincas', slug: 'fincas' } },
    { business_categories: { name: 'Restaurantes', slug: 'restaurantes' } },
    { business_categories: { name: 'Extra', slug: 'extra' } },
  ],
}

describe('BusinessCard', () => {
  it('renders name, description, address, and up to 2 category pills', () => {
    render(<BusinessCard business={BUSINESS} isFavorited={false} isGuest={false} />)

    expect(screen.getByRole('heading', { name: 'Finca X' })).toBeInTheDocument()
    expect(screen.getByText('Un lugar hermoso para descansar.')).toBeInTheDocument()
    expect(screen.getByText('Vereda El Carmen')).toBeInTheDocument()
    expect(screen.getByText('Fincas')).toBeInTheDocument()
    expect(screen.getByText('Restaurantes')).toBeInTheDocument()
    expect(screen.queryByText('Extra')).not.toBeInTheDocument()
  })

  it('links to the business detail page', () => {
    render(<BusinessCard business={BUSINESS} isFavorited={false} isGuest={false} />)
    expect(screen.getByRole('link', { name: 'Finca X' })).toHaveAttribute('href', '/negocios/finca-x')
  })

  it('falls back to a placeholder icon when there is no image', () => {
    const { container } = render(
      <BusinessCard business={{ ...BUSINESS, images: null }} isFavorited={false} isGuest={false} />,
    )
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the favorited state via the embedded FavoriteButton', () => {
    render(<BusinessCard business={BUSINESS} isFavorited={true} isGuest={false} />)
    expect(screen.getByRole('button', { name: 'Quitar de favoritos' })).toBeInTheDocument()
  })

  it('renders a login link for guests instead of a favorite toggle', () => {
    render(<BusinessCard business={BUSINESS} isFavorited={false} isGuest={true} />)
    expect(screen.getByRole('link', { name: 'Inicia sesión para guardar en favoritos' })).toBeInTheDocument()
  })
})

describe('BusinessCard — compact', () => {
  it('renders a smaller thumbnail row: name, one category, and a single-line description', () => {
    render(<BusinessCard business={BUSINESS} isFavorited={false} isGuest={false} compact />)

    expect(screen.getByRole('heading', { name: 'Finca X' })).toBeInTheDocument()
    expect(screen.getByText('Fincas')).toBeInTheDocument()
    expect(screen.queryByText('Restaurantes')).not.toBeInTheDocument()
    expect(screen.getByText('Un lugar hermoso para descansar.')).toBeInTheDocument()
  })

  it('still links to the business and supports favoriting', () => {
    render(<BusinessCard business={BUSINESS} isFavorited={true} isGuest={false} compact />)
    expect(screen.getByRole('link', { name: 'Finca X' })).toHaveAttribute('href', '/negocios/finca-x')
    expect(screen.getByRole('button', { name: 'Quitar de favoritos' })).toBeInTheDocument()
  })
})
