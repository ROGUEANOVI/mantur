import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SocialLinks from './SocialLinks'

describe('SocialLinks', () => {
  it('renders a link for each social platform with the correct href', () => {
    render(<SocialLinks />)

    expect(screen.getByRole('link', { name: /instagram/i })).toHaveAttribute(
      'href',
      'https://instagram.com/mantur.oficial',
    )
    expect(screen.getByRole('link', { name: /facebook/i })).toHaveAttribute(
      'href',
      'https://www.facebook.com/share/196SHnZWw5/',
    )
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      'https://wa.me/573217203264',
    )
    expect(screen.getByRole('link', { name: /tiktok/i })).toHaveAttribute(
      'href',
      'https://www.tiktok.com/@mantur432',
    )
  })

  it('opens links in a new tab with a safe rel attribute', () => {
    render(<SocialLinks />)

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })
})
