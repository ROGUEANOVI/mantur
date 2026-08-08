import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Avatar from './Avatar'

describe('Avatar', () => {
  it('shows initials when there is no avatar url', () => {
    render(<Avatar name="Ana Pérez" avatarUrl={null} />)
    expect(screen.getByText('AP')).toBeInTheDocument()
  })

  it('renders the photo when an avatar url is set', () => {
    const { container } = render(<Avatar name="Ana Pérez" avatarUrl="https://x/a.webp" />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', expect.stringContaining('a.webp'))
  })

  it('falls back to "?" when the name has no usable characters', () => {
    render(<Avatar name="" avatarUrl={null} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('applies the size class for the requested size', () => {
    const { container } = render(<Avatar name="Ana Pérez" avatarUrl={null} size="lg" />)
    expect(container.firstChild).toHaveClass('size-20')
  })
})
