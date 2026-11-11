import { describe, it, expect, beforeEach } from 'vitest'
import { resetTrackDedupe, track } from './track'

type DL = Window & { dataLayer?: Record<string, unknown>[] }

beforeEach(() => {
  delete (window as DL).dataLayer
  resetTrackDedupe()
})

describe('track', () => {
  it('pushes the event and its params to the dataLayer', () => {
    track('whatsapp_click', { paquete_id: 'fullday-manaure', value: 280000, currency: 'COP', ubicacion: 'package_detail' })
    expect((window as DL).dataLayer).toEqual([
      { event: 'whatsapp_click', paquete_id: 'fullday-manaure', value: 280000, currency: 'COP', ubicacion: 'package_detail' },
    ])
  })

  it('sends a deduped view event only once per page', () => {
    const params = { paquete_id: 'x', paquete_nombre: 'X', value: 1, currency: 'COP' as const }
    track('view_item', params, 'x')
    track('view_item', params, 'x')
    expect((window as DL).dataLayer).toHaveLength(1)
  })

  it('never dedupes events sent without a key (every click counts)', () => {
    track('whatsapp_click', { ubicacion: 'home_custom_package' })
    track('whatsapp_click', { ubicacion: 'home_custom_package' })
    expect((window as DL).dataLayer).toHaveLength(2)
  })
})
