import { describe, it, expect } from 'vitest'
import { manturWhatsappUrl, MANTUR_WHATSAPP_NUMBER } from './whatsapp'

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
