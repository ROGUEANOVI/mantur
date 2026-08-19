import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminSidebar from './AdminSidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}))

describe('AdminSidebar', () => {
  it('renders one link per nav item with the correct href', () => {
    render(<AdminSidebar />)

    const expected: [string, string][] = [
      ['Dashboard', '/admin'],
      ['Solicitudes', '/admin/solicitudes'],
      ['Negocios', '/admin/negocios'],
      ['Categorías', '/admin/categorias'],
      ['Tipos de servicio', '/admin/tipos-servicio'],
      ['Lugares', '/admin/lugares'],
      ['Transportes', '/admin/transportes'],
      ['Comisiones', '/admin/comisiones'],
    ]

    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
    }
  })

  it('marks the Dashboard link active only for an exact /admin match', () => {
    render(<AdminSidebar />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('text-foreground', 'font-semibold', 'bg-muted')
    expect(screen.getByRole('link', { name: 'Negocios' })).not.toHaveClass('bg-muted')
  })

  it('renders a divider between each of the five nav groups', () => {
    const { container } = render(<AdminSidebar />)
    // 5 groups → 4 dividers (one before every group after the first)
    expect(container.querySelectorAll('nav > div > .my-1\\.5.border-t')).toHaveLength(4)
  })
})
