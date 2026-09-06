import { describe, it, expect } from 'vitest'
import { resolvePackageItemLabel } from './labels'

describe('resolvePackageItemLabel', () => {
  it('labels a service item as "service name — business name"', () => {
    const label = resolvePackageItemLabel({
      id: 'item-1',
      quantity_included: 1,
      services: { name: 'Tour por el río', businesses: { name: 'Balneario El Paraíso' } },
      guide_tours: null,
    })
    expect(label).toBe('Tour por el río — Balneario El Paraíso')
  })

  it('labels a guide-tour item as "tour name — guide name"', () => {
    const label = resolvePackageItemLabel({
      id: 'item-2',
      quantity_included: 1,
      services: null,
      guide_tours: { name: 'Caminata a las cascadas', tourist_guides: { profiles: { full_name: 'Juan Pérez' } } },
    })
    expect(label).toBe('Caminata a las cascadas — Juan Pérez')
  })

  it('falls back to an empty business/guide name rather than throwing when missing', () => {
    const label = resolvePackageItemLabel({
      id: 'item-3',
      quantity_included: 1,
      services: { name: 'Tour por el río', businesses: null },
      guide_tours: null,
    })
    expect(label).toBe('Tour por el río — ')
  })
})
