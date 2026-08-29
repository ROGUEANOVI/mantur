import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminMobileMenu from './AdminMobileMenu'

const usePathnameMock = vi.fn(() => '/admin')

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}))

describe('AdminMobileMenu', () => {
  it('shows the current section label on the closed trigger', () => {
    usePathnameMock.mockReturnValue('/admin/negocios')
    render(<AdminMobileMenu />)

    expect(screen.getByRole('button', { name: /abrir menú/i })).toHaveTextContent('Negocios')
  })

  it('opens a vertical, grouped drawer with every desktop sidebar item', async () => {
    usePathnameMock.mockReturnValue('/admin')
    const user = userEvent.setup()
    render(<AdminMobileMenu />)

    expect(screen.queryByText('Transportes')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))

    const expected: [string, string][] = [
      ['Dashboard', '/admin'],
      ['Solicitudes', '/admin/solicitudes'],
      ['Negocios', '/admin/negocios'],
      ['Categorías', '/admin/categorias'],
      ['Tipos de servicio', '/admin/tipos-servicio'],
      ['Lugares', '/admin/lugares'],
      ['Transportes', '/admin/transportes'],
      ['Guías', '/admin/guias'],
      ['Transportistas', '/admin/transportistas'],
      ['Comisiones', '/admin/comisiones'],
      ['Reembolsos', '/admin/reembolsos'],
    ]

    for (const [label, href] of expected) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
    }
  })

  it('closes the menu when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    render(<AdminMobileMenu />)

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))
    expect(await screen.findByRole('link', { name: 'Solicitudes' })).toBeInTheDocument()

    const backdrop = document.body.querySelector('[aria-hidden="true"].fixed.inset-0')
    expect(backdrop).not.toBeNull()
    await user.click(backdrop as Element)

    // Unmount is deferred until the exit transition finishes
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Solicitudes' })).not.toBeInTheDocument()
    })
  })

  it('slides the drawer in from the left edge', async () => {
    const user = userEvent.setup()
    render(<AdminMobileMenu />)

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))
    const drawer = (await screen.findByRole('link', { name: 'Solicitudes' })).closest('[role="dialog"]')

    await waitFor(() => {
      expect(drawer).toHaveClass('translate-x-0')
      expect(drawer).not.toHaveClass('-translate-x-full')
    })
  })

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup()
    render(<AdminMobileMenu />)

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))
    expect(await screen.findByRole('link', { name: 'Solicitudes' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Solicitudes' })).not.toBeInTheDocument()
    })
  })

  it('highlights the item matching the current pathname as active', async () => {
    usePathnameMock.mockReturnValue('/admin/negocios')
    const user = userEvent.setup()
    render(<AdminMobileMenu />)

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))

    expect(screen.getByRole('link', { name: 'Negocios' })).toHaveClass('text-foreground', 'font-semibold', 'bg-muted')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('bg-muted')
  })
})
