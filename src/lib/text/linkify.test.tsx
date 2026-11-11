import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { linkifyText } from './linkify'

function renderText(text: string) {
  return render(<p>{linkifyText(text)}</p>)
}

describe('linkifyText', () => {
  it('returns plain text untouched when there is nothing to link', () => {
    const { container } = renderText('Precio: $280.000 por grupo.')
    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('Precio: $280.000 por grupo.')
  })

  it('turns a typed Colombian mobile into a WhatsApp link', () => {
    renderText('Escríbenos al WhatsApp: 3001006725, te esperamos.')
    const link = screen.getByRole('link', { name: '3001006725' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001006725\?text=/)
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('accepts spaces, dashes and a +57 prefix in the phone', () => {
    renderText('Llama al +57 300 100-6725')
    expect(screen.getByRole('link', { name: '+57 300 100-6725' }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/573001006725\?/,
    )
  })

  it('does not link digit runs that are not a mobile (IDs, prices, landlines)', () => {
    const { container } = renderText('NIT 9012345678901 · $3.500.000 · 6055701234')
    expect(container.querySelector('a')).toBeNull()
  })

  it('links http(s) URLs without swallowing trailing punctuation', () => {
    renderText('Más fotos en https://instagram.com/mantur.co.')
    const link = screen.getByRole('link', { name: 'https://instagram.com/mantur.co' })
    expect(link).toHaveAttribute('href', 'https://instagram.com/mantur.co')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  })

  it('never renders markup from the text itself', () => {
    const { container } = renderText('<img src=x onerror=alert(1)> 3001006725')
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>')
  })
})
