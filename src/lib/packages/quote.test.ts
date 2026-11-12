import { describe, it, expect } from 'vitest'
import { findTier, quotePackage } from './quote'
import type { PriceTier } from './content'

// Real fares from ManTur's official tariff sheet (FullDay Manaure).
const FULLDAY_TIERS: PriceTier[] = [
  { min_people: 2, max_people: 2, amount: 280000, amount_basis: 'per_group' },
  { min_people: 3, max_people: 3, amount: 380000, amount_basis: 'per_group' },
  { min_people: 4, max_people: 4, amount: 560000, amount_basis: 'per_group' },
  { min_people: 5, max_people: 5, amount: 660000, amount_basis: 'per_group' },
  { min_people: 6, max_people: 15, amount: 120000, amount_basis: 'per_person' },
]
const FULLDAY = { base_price: 120000, pricing_unit: 'per_person' }

describe('findTier', () => {
  it('matches an exact size and an open or bounded range', () => {
    expect(findTier(FULLDAY_TIERS, 3)?.amount).toBe(380000)
    expect(findTier(FULLDAY_TIERS, 15)?.amount).toBe(120000)
    expect(findTier(FULLDAY_TIERS, 16)).toBeNull()
    expect(findTier([{ min_people: 6, max_people: null }], 40)).not.toBeNull()
  })
})

describe('quotePackage', () => {
  it('uses the group total of a per_group tier', () => {
    expect(quotePackage(FULLDAY, FULLDAY_TIERS, 3)).toEqual({ ok: true, total: 380000, storedQuantity: 3, source: 'tier' })
  })

  it('multiplies a per_person tier by the group size', () => {
    expect(quotePackage(FULLDAY, FULLDAY_TIERS, 8)).toEqual({ ok: true, total: 960000, storedQuantity: 8, source: 'tier' })
  })

  it('never falls back to base_price when tiers exist but none covers the group', () => {
    expect(quotePackage(FULLDAY, FULLDAY_TIERS, 1)).toEqual({ ok: false, reason: 'no_tier_for_group' })
    expect(quotePackage(FULLDAY, FULLDAY_TIERS, 20)).toEqual({ ok: false, reason: 'no_tier_for_group' })
  })

  it('keeps the base_price rule for packages without tiers', () => {
    expect(quotePackage({ base_price: '150000.00', pricing_unit: 'per_person' }, [], 4)).toEqual({
      ok: true,
      total: 600000,
      storedQuantity: 4,
      source: 'base',
    })
    expect(quotePackage({ base_price: 280000, pricing_unit: 'fixed' }, [], 5)).toEqual({
      ok: true,
      total: 280000,
      storedQuantity: 1,
      source: 'base',
    })
  })

  it('accepts string amounts as stored by Postgres numeric', () => {
    const tiers = [{ min_people: 2, max_people: 2, amount: '440000.00', amount_basis: 'per_group' as const }]
    expect(quotePackage(FULLDAY, tiers, 2)).toMatchObject({ ok: true, total: 440000 })
  })
})

describe('quotePackage — hardening', () => {
  it('picks the lowest-starting tier deterministically if ranges ever overlap', () => {
    const overlapping: PriceTier[] = [
      { min_people: 3, max_people: 6, amount: 999, amount_basis: 'per_group' },
      { min_people: 2, max_people: 4, amount: 111, amount_basis: 'per_group' },
    ]
    expect(quotePackage(FULLDAY, overlapping, 3)).toMatchObject({ ok: true, total: 111 })
  })

  it('rounds per-person totals to cents (no float noise)', () => {
    const tiers: PriceTier[] = [{ min_people: 1, max_people: null, amount: '0.10', amount_basis: 'per_person' }]
    expect(quotePackage(FULLDAY, tiers, 3)).toMatchObject({ ok: true, total: 0.3 })
  })
})
