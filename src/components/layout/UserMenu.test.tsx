import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserMenu from './UserMenu'

const signOutMock = vi.fn()
vi.mock('@/app/(auth)/actions', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UserMenu', () => {
  it('shows the initials and full name on the trigger', () => {
    render(<UserMenu fullName="Ana María Pérez" email="ana@example.com" role="tourist" links={[]} />)

    const trigger = screen.getByRole('button', { name: /Ana María Pérez/ })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent('AM')
  })

  it('falls back to email when full_name is null', () => {
    render(<UserMenu fullName={null} email="ana@example.com" role="tourist" links={[]} />)

    expect(screen.getByRole('button', { name: /ana@example\.com/ })).toBeInTheDocument()
  })

  it('opens the dropdown and shows the role label plus the provided links', async () => {
    const user = userEvent.setup()
    render(
      <UserMenu
        fullName="Ana Pérez"
        email="ana@example.com"
        role="tourist"
        links={[
          { label: 'Mis traslados', href: '/mis-viajes' },
          { label: 'Únete', href: '/solicitar-rol', accent: true },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Ana Pérez/ }))

    expect(await screen.findByText('Turista')).toBeInTheDocument()
    const trips = screen.getByRole('menuitem', { name: 'Mis traslados' })
    expect(trips).toHaveAttribute('href', '/mis-viajes')

    const join = screen.getByRole('menuitem', { name: 'Únete' })
    expect(join).toHaveAttribute('href', '/solicitar-rol')
    expect(join.className).toMatch(/text-accent/)

    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('omits the role label when role is null', async () => {
    const user = userEvent.setup()
    render(<UserMenu fullName="Ana Pérez" email="ana@example.com" role={null} links={[]} />)

    await user.click(screen.getByRole('button', { name: /Ana Pérez/ }))

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.queryByText('Turista')).not.toBeInTheDocument()
  })

  it('renders only the sign-out item when links is empty', async () => {
    const user = userEvent.setup()
    render(<UserMenu fullName="Carlos Ruiz" email="carlos@example.com" role="transporter" links={[]} />)

    await user.click(screen.getByRole('button', { name: /Carlos Ruiz/ }))

    expect(await screen.findByText('Transportador')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('shows "?" when there is neither full_name nor email', () => {
    render(<UserMenu fullName={null} email={null} role={null} links={[]} />)

    const trigger = screen.getByRole('button')
    expect(trigger).toHaveTextContent('?')
  })

  it('shows the avatar photo instead of initials when avatarUrl is set', () => {
    const { container } = render(
      <UserMenu fullName="Ana Pérez" email="ana@example.com" role="tourist" avatarUrl="https://x/a.webp" links={[]} />,
    )

    const trigger = screen.getByRole('button', { name: /Ana Pérez/ })
    expect(trigger).not.toHaveTextContent('AP')
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://x/a.webp')
  })

  it('falls back to initials when avatarUrl is null', () => {
    const { container } = render(
      <UserMenu fullName="Ana Pérez" email="ana@example.com" role="tourist" avatarUrl={null} links={[]} />,
    )

    expect(screen.getByRole('button', { name: /Ana Pérez/ })).toHaveTextContent('AP')
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })
})
