import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// Reveal relies on IntersectionObserver, which jsdom doesn't provide.
vi.mock('@/components/shared/Reveal', () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

import PackageShowcase, { type ShowcasePackage } from './PackageShowcase'

function pkg(overrides: Partial<ShowcasePackage> = {}): ShowcasePackage {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'fullday-manaure',
    name: 'FullDay Manaure',
    description: 'Un día completo recorriendo Manaure.',
    base_price: '280000.00',
    pricing_unit: 'fixed',
    capacity: null,
    images: ['https://cdn.example.com/a.webp'],
    is_featured: true,
    ...overrides,
  }
}

function decodedWhatsappText(link: HTMLElement) {
  return new URL(link.getAttribute('href')!).searchParams.get('text')
}

describe('PackageShowcase', () => {
  it('renders nothing when there are no packages', () => {
    const { container } = render(<PackageShowcase packages={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a visible "Ver paquete" link to the detail page as the main action', () => {
    render(<PackageShowcase packages={[pkg()]} />)
    expect(screen.getByRole('link', { name: 'Ver paquete: FullDay Manaure' })).toHaveAttribute(
      'href',
      '/paquetes/fullday-manaure',
    )
    expect(screen.getByText('Ver paquete')).toBeVisible()
    expect(screen.getByRole('link', { name: /Ver todos los paquetes/ })).toHaveAttribute('href', '/paquetes')
  })

  it('keeps the whole-card click target out of the accessibility tree', () => {
    const { container } = render(<PackageShowcase packages={[pkg()]} />)
    const overlay = container.querySelector('a[aria-hidden="true"][href="/paquetes/fullday-manaure"]')
    expect(overlay).toHaveAttribute('tabindex', '-1')
  })

  it('opens a ManTur WhatsApp chat prefilled with the package name, without requiring login', () => {
    render(<PackageShowcase packages={[pkg()]} />)
    const link = screen.getByRole('link', { name: 'Consultar por WhatsApp' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001006725\?/)
    expect(decodedWhatsappText(link)).toBe('Hola, quiero más información sobre el paquete "FullDay Manaure".')
  })

  it('formats the price with its pricing unit', () => {
    render(
      <PackageShowcase
        packages={[pkg(), pkg({ id: '2', slug: 'cascada', name: 'Cascada', base_price: 150000, pricing_unit: 'per_person' })]}
      />,
    )
    expect(screen.getByText('$280.000')).toBeInTheDocument()
    expect(screen.getByText('precio total')).toBeInTheDocument()
    expect(screen.getByText('$150.000')).toBeInTheDocument()
    expect(screen.getByText('por persona')).toBeInTheDocument()
  })

  it('shows capacity only when the package has one', () => {
    const { rerender } = render(<PackageShowcase packages={[pkg({ capacity: 12 })]} />)
    expect(screen.getByText('Hasta 12 personas')).toBeInTheDocument()

    rerender(<PackageShowcase packages={[pkg({ capacity: null })]} />)
    expect(screen.queryByText(/Hasta/)).not.toBeInTheDocument()
  })

  it('shows the "Recomendado" badge only on featured packages', () => {
    render(
      <PackageShowcase
        packages={[pkg(), pkg({ id: '2', slug: 'otro', name: 'Otro paquete', is_featured: false })]}
      />,
    )
    expect(screen.getAllByText('Recomendado')).toHaveLength(1)
  })

  it('gives every card the same content — no lead card', () => {
    render(
      <PackageShowcase
        packages={[
          pkg(),
          pkg({ id: '2', slug: 'otro', name: 'Otro paquete', description: 'Descripción secundaria.', is_featured: false }),
        ]}
      />,
    )
    expect(screen.getByText('Un día completo recorriendo Manaure.')).toBeInTheDocument()
    expect(screen.getByText('Descripción secundaria.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Consultar por WhatsApp' })).toHaveLength(2)
  })

  it('caps the showcase at four packages', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      pkg({ id: String(i), slug: `p-${i}`, name: `Paquete ${i}`, is_featured: false }),
    )
    render(<PackageShowcase packages={many} />)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByRole('link', { name: 'Ver paquete: Paquete 4' })).not.toBeInTheDocument()
  })

  it('offers a custom-package WhatsApp contact', () => {
    render(<PackageShowcase packages={[pkg()]} />)
    const link = screen.getByRole('link', { name: 'Escríbenos' })
    expect(decodedWhatsappText(link)).toBe('Hola, quiero armar un paquete a mi medida en Manaure.')
  })

  it('falls back to a placeholder when the package has no photo', () => {
    render(<PackageShowcase packages={[pkg({ images: [] })]} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver paquete: FullDay Manaure' })).toBeInTheDocument()
  })
})
