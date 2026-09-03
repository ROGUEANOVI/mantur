import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PackageCard, { type PackageCardRow } from './PackageCard'

const PACKAGE: PackageCardRow = {
  id: 'pkg1',
  slug: 'ruta-serrania-del-perija',
  name: 'Ruta Serranía del Perijá',
  description: 'Dos días de caminata y hospedaje.',
  base_price: 450000,
  images: ['https://x/a.webp'],
}

describe('PackageCard', () => {
  it('renders name, description, and the formatted price', () => {
    render(<PackageCard pkg={PACKAGE} />)

    expect(screen.getByRole('heading', { name: 'Ruta Serranía del Perijá' })).toBeInTheDocument()
    expect(screen.getByText('Dos días de caminata y hospedaje.')).toBeInTheDocument()
    expect(screen.getByText('$450.000 COP')).toBeInTheDocument()
  })

  it('links to the package detail page', () => {
    render(<PackageCard pkg={PACKAGE} />)
    expect(screen.getByRole('link', { name: 'Ruta Serranía del Perijá' })).toHaveAttribute(
      'href',
      '/paquetes/ruta-serrania-del-perija',
    )
  })

  it('falls back to a package icon when there is no image', () => {
    const { container } = render(<PackageCard pkg={{ ...PACKAGE, images: null }} />)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('omits the description paragraph when there is none', () => {
    render(<PackageCard pkg={{ ...PACKAGE, description: null }} />)
    expect(screen.queryByText('Dos días de caminata y hospedaje.')).not.toBeInTheDocument()
  })

  it('formats a string base_price the same way as a numeric one', () => {
    render(<PackageCard pkg={{ ...PACKAGE, base_price: '450000' }} />)
    expect(screen.getByText('$450.000 COP')).toBeInTheDocument()
  })
})
