import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WhatsappButton from './WhatsappButton'

describe('WhatsappButton', () => {
  it('links to ManTur\'s WhatsApp number with the message URL-encoded', () => {
    render(<WhatsappButton message="Hola, ¿está disponible?" label="Escríbenos" />)

    const link = screen.getByRole('link', { name: 'Escríbenos' })
    expect(link).toHaveAttribute(
      'href',
      'https://wa.me/573217203264?text=' + encodeURIComponent('Hola, ¿está disponible?'),
    )
  })

  it('opens in a new tab without leaking a window.opener reference', () => {
    render(<WhatsappButton message="hola" label="Escríbenos" />)
    const link = screen.getByRole('link', { name: 'Escríbenos' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('links directly to the given phone instead of ManTur when phone is passed', () => {
    render(<WhatsappButton message="Hola, quiero info" label="Escríbenos" phone="3001234567" />)

    const link = screen.getByRole('link', { name: 'Escríbenos' })
    expect(link).toHaveAttribute(
      'href',
      'https://wa.me/573001234567?text=' + encodeURIComponent('Hola, quiero info'),
    )
  })

  it("falls back to ManTur's number when phone is null", () => {
    render(<WhatsappButton message="hola" label="Escríbenos" phone={null} />)
    const link = screen.getByRole('link', { name: 'Escríbenos' })
    expect(link).toHaveAttribute('href', expect.stringContaining('wa.me/573217203264'))
  })
})
