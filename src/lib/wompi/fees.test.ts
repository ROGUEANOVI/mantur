import { describe, it, expect } from 'vitest'
import { estimateWompiFeeCents } from './fees'

describe('estimateWompiFeeCents', () => {
  it('applies 2.65% + $700 COP fixed fee, then 19% IVA on top of that subtotal', () => {
    // amount 50000: (50000*0.0265 + 70000) * 1.19 = 71325 * 1.19 = 84876.75 -> 84877
    expect(estimateWompiFeeCents(50000)).toBe(84877)
  })

  it('scales with a larger amount', () => {
    // amount 100000: (100000*0.0265 + 70000) * 1.19 = 72650 * 1.19 = 86453.5 -> 86454
    expect(estimateWompiFeeCents(100000)).toBe(86454)
  })

  it('returns a positive fee even for a zero amount, since the fixed fee + its IVA still applies', () => {
    // amount 0: (0 + 70000) * 1.19 = 83300
    expect(estimateWompiFeeCents(0)).toBe(83300)
  })
})
