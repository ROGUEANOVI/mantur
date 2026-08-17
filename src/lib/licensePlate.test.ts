import { describe, it, expect } from 'vitest'
import { normalizeLicensePlate } from './licensePlate'

describe('normalizeLicensePlate', () => {
  it('accepts the car/camioneta shape (3 letters + 3 digits)', () => {
    expect(normalizeLicensePlate('ABC123')).toBe('ABC123')
  })

  it('accepts the motorcycle/motocarro shape (3 letters + 2 digits + 1 letter)', () => {
    expect(normalizeLicensePlate('ABC12D')).toBe('ABC12D')
  })

  it('strips spaces and hyphens and uppercases before matching', () => {
    expect(normalizeLicensePlate('abc-123')).toBe('ABC123')
    expect(normalizeLicensePlate('abc 123')).toBe('ABC123')
  })

  it('rejects the wrong number of letters or digits', () => {
    expect(normalizeLicensePlate('AB123')).toBeNull()
    expect(normalizeLicensePlate('ABCD123')).toBeNull()
    expect(normalizeLicensePlate('ABC12')).toBeNull()
  })

  it('rejects garbage input', () => {
    expect(normalizeLicensePlate('not-a-plate')).toBeNull()
    expect(normalizeLicensePlate('')).toBeNull()
  })
})
