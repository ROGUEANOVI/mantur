import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FavoriteButton from './FavoriteButton'
import { toggleFavorite } from '@/app/actions/favorites'

vi.mock('@/app/actions/favorites', () => ({
  toggleFavorite: vi.fn(),
}))

const mockToggle = vi.mocked(toggleFavorite)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FavoriteButton — guest', () => {
  it('renders a login link instead of a toggle button', () => {
    render(
      <FavoriteButton entityType="business" entityId="b1" initialFavorited={false} isGuest />,
    )
    const link = screen.getByRole('link', { name: 'Inicia sesión para guardar en favoritos' })
    expect(link).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('FavoriteButton — authenticated', () => {
  it('starts unfavorited: labeled to add, and toggles to favorited on click', async () => {
    mockToggle.mockResolvedValue({ favorited: true })
    const user = userEvent.setup()
    render(
      <FavoriteButton entityType="business" entityId="b1" initialFavorited={false} isGuest={false} />,
    )

    const button = screen.getByRole('button', { name: 'Guardar en favoritos' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)

    expect(mockToggle).toHaveBeenCalledWith('business', 'b1')
    expect(await screen.findByRole('button', { name: 'Quitar de favoritos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('starts favorited and toggles to unfavorited on click', async () => {
    mockToggle.mockResolvedValue({ favorited: false })
    const user = userEvent.setup()
    render(<FavoriteButton entityType="place" entityId="p1" initialFavorited={true} isGuest={false} />)

    await user.click(screen.getByRole('button', { name: 'Quitar de favoritos' }))

    expect(mockToggle).toHaveBeenCalledWith('place', 'p1')
    expect(await screen.findByRole('button', { name: 'Guardar en favoritos' })).toBeInTheDocument()
  })

  it('reverts the optimistic toggle when the action returns an error', async () => {
    mockToggle.mockResolvedValue({ error: 'boom' })
    const user = userEvent.setup()
    render(
      <FavoriteButton entityType="business" entityId="b1" initialFavorited={false} isGuest={false} />,
    )

    await user.click(screen.getByRole('button', { name: 'Guardar en favoritos' }))

    expect(await screen.findByRole('button', { name: 'Guardar en favoritos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
