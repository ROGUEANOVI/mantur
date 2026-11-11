import { describe, it, expect } from 'vitest'
import { packagePriceParts, packagePriceText } from './price'

describe('package price display', () => {
  it('always presents the price as a "Desde" floor with its unit', () => {
    expect(packagePriceParts('150000.00', 'per_person')).toEqual({
      from: 'Desde',
      amount: '$150.000',
      unit: 'por persona',
    })
  })

  it('labels fixed-price packages "por grupo", never "precio fijo"', () => {
    expect(packagePriceText(280000, 'fixed')).toBe('Desde $280.000 por grupo')
  })

  it('omits an unknown unit instead of printing undefined', () => {
    expect(packagePriceText(1000, 'weird')).toBe('Desde $1.000')
  })
})
