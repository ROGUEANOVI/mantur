// Regression: ISSUE-001 — mobile menu overlay didn't dim page content
// Found by /qa on 2026-08-03
// Report: .gstack/qa-reports/qa-report-localhost-2026-08-03.md
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NavMobileMenu from './NavMobileMenu'

const usePathnameMock = vi.fn(() => '/')

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}))

describe('NavMobileMenu', () => {
  const links = [
    { label: 'Explorar', href: '/negocios' },
    { label: 'Guías', href: '/guias' },
  ]

  it('renders the backdrop and drawer into document.body via a portal', async () => {
    const user = userEvent.setup()
    render(<NavMobileMenu links={links}>auth content</NavMobileMenu>)

    // Closed by default — no drawer content in the document
    expect(screen.queryByText('Explorar')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))

    // The drawer's nav links are now findable in document.body (portal target),
    // not scoped inside some clipped/collapsed ancestor.
    const drawerLink = await screen.findByText('Explorar')
    expect(drawerLink).toBeInTheDocument()
    expect(drawerLink.closest('a')).toHaveAttribute('href', '/negocios')

    // The backdrop exists and is a direct portal child of body, not nested
    // under the header — this is what makes it escape the header's
    // backdrop-blur containing block and actually cover the viewport.
    const backdrop = document.body.querySelector('[aria-hidden="true"].fixed.inset-0')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.parentElement).toBe(document.body)
  })

  it('closes the menu when the backdrop is clicked', async () => {
    const user = userEvent.setup()
    render(<NavMobileMenu links={links}>auth content</NavMobileMenu>)

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))
    expect(await screen.findByText('Explorar')).toBeInTheDocument()

    const backdrop = document.body.querySelector('[aria-hidden="true"].fixed.inset-0')
    expect(backdrop).not.toBeNull()
    await user.click(backdrop as Element)

    expect(screen.queryByText('Explorar')).not.toBeInTheDocument()
  })

  it('highlights the link matching the current pathname as active', async () => {
    usePathnameMock.mockReturnValue('/negocios')
    const user = userEvent.setup()
    render(<NavMobileMenu links={links}>auth content</NavMobileMenu>)

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))

    const activeLink = await screen.findByText('Explorar')
    const inactiveLink = screen.getByText('Guías')

    expect(activeLink.closest('a')).toHaveClass('text-primary', 'font-semibold', 'bg-primary/5')
    expect(inactiveLink.closest('a')).not.toHaveClass('text-primary')
  })
})
