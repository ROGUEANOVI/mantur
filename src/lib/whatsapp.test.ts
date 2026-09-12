import { describe, it, expect } from 'vitest'
import { manturWhatsappUrl, directWhatsappUrl, MANTUR_WHATSAPP_NUMBER } from './whatsapp'

describe('manturWhatsappUrl', () => {
  it('builds a wa.me URL with the message URL-encoded', () => {
    expect(manturWhatsappUrl('Hola, ¿tienen disponibilidad?')).toBe(
      `https://wa.me/${MANTUR_WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola, ¿tienen disponibilidad?')}`,
    )
  })

  it('encodes special characters (&, ?, spaces) so the URL stays valid', () => {
    const url = manturWhatsappUrl('precio & cupo? sí')
    expect(url).not.toContain(' ')
    expect(url).toContain(encodeURIComponent('precio & cupo? sí'))
  })
})

describe('directWhatsappUrl', () => {
  it('builds a wa.me URL to the given phone with the 57 country code prepended', () => {
    expect(directWhatsappUrl('3001234567', 'Hola, ¿tienen disponibilidad?')).toBe(
      `https://wa.me/573001234567?text=${encodeURIComponent('Hola, ¿tienen disponibilidad?')}`,
    )
  })

  it('strips stray formatting (spaces, dashes, parens) from the phone', () => {
    expect(directWhatsappUrl('(300) 123-4567', 'hola')).toBe(
      `https://wa.me/573001234567?text=${encodeURIComponent('hola')}`,
    )
  })

  it('encodes special characters in the message', () => {
    const url = directWhatsappUrl('3001234567', 'precio & cupo? sí')
    expect(url).not.toContain(' ')
    expect(url).toContain(encodeURIComponent('precio & cupo? sí'))
  })
})
