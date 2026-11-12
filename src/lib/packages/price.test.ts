import { describe, it, expect } from 'vitest'
import { formatCOP, groupDeal, headlineText, packageHeadline } from './price'
import type { PriceTier } from './content'

// Fares from ManTur's official tariff sheet.
const FULLDAY_TIERS: PriceTier[] = [
  { min_people: 2, max_people: 2, amount: 280000, amount_basis: 'per_group' },
  { min_people: 3, max_people: 3, amount: 380000, amount_basis: 'per_group' },
  { min_people: 4, max_people: 4, amount: 560000, amount_basis: 'per_group' },
  { min_people: 5, max_people: 5, amount: 660000, amount_basis: 'per_group' },
  { min_people: 6, max_people: 15, amount: 120000, amount_basis: 'per_person' },
]
const CASA_TIERS: PriceTier[] = [
  { min_people: 6, max_people: 6, amount: 1470000, amount_basis: 'per_group' },
  { min_people: 8, max_people: 8, amount: 1712000, amount_basis: 'per_group' },
  { min_people: 12, max_people: 12, amount: 2190000, amount_basis: 'per_group' },
]
const PKG = { base_price: 120000, pricing_unit: 'per_person', min_people: 2 }

describe('packageHeadline', () => {
  it('leads with what the smallest group pays, group spelled out (FullDay couple)', () => {
    const h = packageHeadline(PKG, FULLDAY_TIERS)
    expect(h).toEqual({
      label: 'Pareja',
      amount: '$280.000',
      unit: 'en total',
      detail: '$140.000 c/u',
      perPerson: 140000,
    })
    expect(headlineText(h)).toBe('Pareja: $280.000 en total · $140.000 c/u')
  })

  it('never leads with the big-group per-person fare', () => {
    expect(packageHeadline(PKG, FULLDAY_TIERS).amount).not.toBe('$120.000')
  })

  it('uses "Grupo de N" for a minimum other than a couple (Casa de Campo)', () => {
    expect(packageHeadline({ ...PKG, min_people: 6 }, CASA_TIERS)).toMatchObject({
      label: 'Grupo de 6',
      amount: '$1.470.000',
      detail: '$245.000 c/u',
    })
  })

  it('shows a per-person range fare with its minimum', () => {
    const tiers: PriceTier[] = [{ min_people: 3, max_people: 10, amount: 150000, amount_basis: 'per_person' }]
    expect(packageHeadline(PKG, tiers)).toMatchObject({
      label: null,
      amount: '$150.000',
      unit: 'por persona',
      detail: 'mínimo 3 personas',
    })
  })

  it('falls back to base_price with the package minimum when there are no fares (Cascada)', () => {
    const h = packageHeadline({ base_price: '150000.00', pricing_unit: 'per_person', min_people: 3 }, [])
    expect(headlineText(h)).toBe('$150.000 por persona · mínimo 3 personas')
  })

  it('handles fixed and per-night base prices', () => {
    expect(headlineText(packageHeadline({ base_price: 280000, pricing_unit: 'fixed' }, []))).toBe('$280.000 en total')
    expect(packageHeadline({ base_price: 90000, pricing_unit: 'per_night' }, []).unit).toBe('por noche')
  })
})

describe('groupDeal', () => {
  it('advertises the cheaper big-group fare with its condition', () => {
    expect(groupDeal(PKG, FULLDAY_TIERS)).toBe('Grupos de 6+: desde $120.000 c/u')
    expect(groupDeal(PKG, CASA_TIERS)).toBe('Grupos de 12+: desde $182.500 c/u')
  })

  it('stays silent when no bigger group pays less, or with a single fare', () => {
    const flat: PriceTier[] = [
      { min_people: 2, max_people: 2, amount: 200000, amount_basis: 'per_group' },
      { min_people: 3, max_people: 3, amount: 300000, amount_basis: 'per_group' },
    ]
    expect(groupDeal(PKG, flat)).toBeNull()
    expect(groupDeal(PKG, [])).toBeNull()
  })
})

describe('formatCOP', () => {
  it('rounds to whole pesos with Colombian grouping', () => {
    expect(formatCOP(126666.67)).toBe('$126.667')
  })
})
