import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NavLink from './NavLink'

const usePathnameMock = vi.fn(() => '/')

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}))

describe('NavLink', () => {
  it('renders a link to the given href', () => {
    usePathnameMock.mockReturnValue('/')
    render(<NavLink href="/negocios">Explorar</NavLink>)
    expect(screen.getByRole('link', { name: 'Explorar' })).toHaveAttribute('href', '/negocios')
  })

  it('does not apply activeClassName when the pathname does not match (default startsWith mode)', () => {
    usePathnameMock.mockReturnValue('/lugares')
    render(
      <NavLink href="/negocios" className="base" activeClassName="active">
        Explorar
      </NavLink>,
    )
    const link = screen.getByRole('link', { name: 'Explorar' })
    expect(link).toHaveClass('base')
    expect(link).not.toHaveClass('active')
  })

  it('applies activeClassName when the pathname starts with href (default startsWith mode)', () => {
    usePathnameMock.mockReturnValue('/negocios/123')
    render(
      <NavLink href="/negocios" className="base" activeClassName="active">
        Explorar
      </NavLink>,
    )
    expect(screen.getByRole('link', { name: 'Explorar' })).toHaveClass('base', 'active')
  })

  it('with exact matching, does not activate on a sub-path', () => {
    usePathnameMock.mockReturnValue('/admin/negocios')
    render(
      <NavLink href="/admin" exact className="base" activeClassName="active">
        Dashboard
      </NavLink>,
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('active')
  })

  it('with exact matching, activates only on the exact pathname', () => {
    usePathnameMock.mockReturnValue('/admin')
    render(
      <NavLink href="/admin" exact className="base" activeClassName="active">
        Dashboard
      </NavLink>,
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('active')
  })

  it('renders without a crash when no className/activeClassName are provided', () => {
    usePathnameMock.mockReturnValue('/negocios')
    render(<NavLink href="/negocios">Explorar</NavLink>)
    expect(screen.getByRole('link', { name: 'Explorar' })).toBeInTheDocument()
  })
})
