import { describe, it, expect } from 'vitest'
import { toBannerEvent, type EventRow } from './banner'

const TODAY = '2026-11-12'

const row: EventRow = {
  id: 'e1',
  title: 'Festival del Retorno',
  summary: 'Música y tradición',
  starts_on: '2026-12-14',
  ends_on: '2026-12-16',
  time_label: 'Desde las 7:00 p. m.',
  location_label: null,
  image_url: 'https://x.supabase.co/storage/v1/object/public/event-images/a.webp',
  cta_type: 'whatsapp',
  external_url: null,
  places: null,
  packages: null,
}

describe('toBannerEvent', () => {
  it('resolves dates, labels and timing', () => {
    expect(toBannerEvent(row, TODAY)).toMatchObject({
      id: 'e1',
      days: '14–16',
      months: 'dic',
      dateLabel: '14 al 16 de diciembre',
      timeLabel: 'Desde las 7:00 p. m.',
      timing: null,
      cta: { kind: 'whatsapp' },
      location: null,
      placeHref: null,
    })
  })

  it('uses the linked place name when no location text was written, and links to it', () => {
    const event = toBannerEvent({ ...row, places: { name: 'Plaza Simón Bolívar', slug: 'plaza' } }, TODAY)
    expect(event.location).toBe('Plaza Simón Bolívar')
    expect(event.placeHref).toBe('/lugares/plaza')
  })

  it('prefers the written location over the place name', () => {
    const event = toBannerEvent(
      { ...row, location_label: 'Tarima central', places: { name: 'Plaza Simón Bolívar', slug: 'plaza' } },
      TODAY,
    )
    expect(event.location).toBe('Tarima central')
  })

  it('links an active package', () => {
    const event = toBannerEvent(
      { ...row, cta_type: 'package', packages: { slug: 'fullday', name: 'FullDay', is_active: true } },
      TODAY,
    )
    expect(event.cta).toEqual({ kind: 'package', href: '/paquetes/fullday', packageName: 'FullDay' })
  })

  it('falls back to WhatsApp when the package is inactive or deleted', () => {
    expect(
      toBannerEvent({ ...row, cta_type: 'package', packages: { slug: 'f', name: 'F', is_active: false } }, TODAY).cta,
    ).toEqual({ kind: 'whatsapp' })
    expect(toBannerEvent({ ...row, cta_type: 'package', packages: null }, TODAY).cta).toEqual({ kind: 'whatsapp' })
  })

  it('external link, and none when the link is missing', () => {
    expect(toBannerEvent({ ...row, cta_type: 'external', external_url: 'https://a.co' }, TODAY).cta).toEqual({
      kind: 'external',
      href: 'https://a.co',
    })
    expect(toBannerEvent({ ...row, cta_type: 'external' }, TODAY).cta).toEqual({ kind: 'none' })
  })

  it('informational events have no CTA', () => {
    expect(toBannerEvent({ ...row, cta_type: 'none' }, TODAY).cta).toEqual({ kind: 'none' })
  })
})
