import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WhatsappButton from './WhatsappButton'

describe('WhatsappButton', () => {
  it('links to ManTur\'s WhatsApp number with the message URL-encoded', () => {
    render(<WhatsappButton message="Hola, ¿está disponible?" label="Escríbenos" />)

    const link = screen.getByRole('link', { name: 'Escríbenos' })
    expect(link).toHaveAttribute(
      'href',
      'https://wa.me/573001006725?text=' + encodeURIComponent('Hola, ¿está disponible?'),
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
    expect(link).toHaveAttribute('href', expect.stringContaining('wa.me/573001006725'))
  })

  it('renders the label as visible text by default', () => {
    render(<WhatsappButton message="hola" label="Escríbenos" />)
    expect(screen.getByText('Escríbenos')).toBeInTheDocument()
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-label')
  })

  it('keeps the label as the accessible name when iconOnly hides the text', () => {
    render(<WhatsappButton message="hola" label="Consultar por WhatsApp" iconOnly />)
    const link = screen.getByRole('link', { name: 'Consultar por WhatsApp' })
    expect(link).toHaveAttribute('title', 'Consultar por WhatsApp')
    expect(screen.queryByText('Consultar por WhatsApp')).not.toBeInTheDocument()
  })
})

describe('WhatsappButton — tracking', () => {
  type DL = Window & { dataLayer?: Record<string, unknown>[] }

  beforeEach(() => {
    delete (window as DL).dataLayer
    window.sessionStorage.clear()
  })

  it('pushes whatsapp_click when tracking params are given', async () => {
    const user = userEvent.setup()
    render(<WhatsappButton message="hola" label="Escríbenos" tracking={{ ubicacion: 'home_custom_package' }} />)
    const link = screen.getByRole('link', { name: 'Escríbenos' })
    link.addEventListener('click', (e) => e.preventDefault())
    await user.click(link)
    expect((window as DL).dataLayer).toEqual([{ event: 'whatsapp_click', ubicacion: 'home_custom_package' }])
  })

  it('appends the first-touch campaign to the message on click', async () => {
    window.sessionStorage.setItem('mantur-attribution-v1', JSON.stringify({ utm_campaign: 'mt_ventas_202611' }))
    const user = userEvent.setup()
    render(<WhatsappButton message="Hola ManTur" label="Escríbenos" tracking={{ ubicacion: 'package_detail' }} />)
    const link = screen.getByRole('link', { name: 'Escríbenos' })
    link.addEventListener('click', (e) => e.preventDefault())
    await user.click(link)
    expect(new URL(link.getAttribute('href')!).searchParams.get('text')).toBe('Hola ManTur · campaña: mt_ventas_202611')
  })

  it('does not track or rewrite a provider-direct link', async () => {
    window.sessionStorage.setItem('mantur-attribution-v1', JSON.stringify({ utm_campaign: 'mt_x' }))
    const user = userEvent.setup()
    render(<WhatsappButton message="hola" label="Escríbenos" phone="3001234567" tracking={{ ubicacion: 'x' }} />)
    const link = screen.getByRole('link', { name: 'Escríbenos' })
    link.addEventListener('click', (e) => e.preventDefault())
    await user.click(link)
    expect((window as DL).dataLayer).toBeUndefined()
    expect(link.getAttribute('href')).toContain('wa.me/573001234567')
    expect(new URL(link.getAttribute('href')!).searchParams.get('text')).toBe('hola')
  })
})
