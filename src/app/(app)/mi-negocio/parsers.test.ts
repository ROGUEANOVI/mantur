import { describe, it, expect } from 'vitest'
import { parsePrice, parsePositiveInt } from './parsers'

describe('parsePrice', () => {
  it('accepts a normal positive price', () => {
    expect(parsePrice('45000')).toBe(45000)
  })

  it('accepts a decimal price', () => {
    expect(parsePrice('45000.50')).toBe(45000.5)
  })

  it('accepts zero', () => {
    expect(parsePrice('0')).toBe(0)
  })

  it('rejects a negative price', () => {
    expect(parsePrice('-100')).toBeNull()
  })

  it('rejects a price above the 100,000,000 ceiling', () => {
    expect(parsePrice('100000001')).toBeNull()
  })

  it('accepts a price exactly at the 100,000,000 ceiling', () => {
    expect(parsePrice('100000000')).toBe(100_000_000)
  })

  it('rejects non-numeric input', () => {
    expect(parsePrice('abc')).toBeNull()
  })

  it('rejects Infinity', () => {
    expect(parsePrice('Infinity')).toBeNull()
  })
})

describe('parsePositiveInt', () => {
  it('returns null for an empty/null raw value (field not provided)', () => {
    expect(parsePositiveInt(null)).toBeNull()
    expect(parsePositiveInt('')).toBeNull()
  })

  it('accepts a positive integer', () => {
    expect(parsePositiveInt('10')).toBe(10)
  })

  it('returns false for zero (invalid capacity, distinct from "not provided")', () => {
    expect(parsePositiveInt('0')).toBe(false)
  })

  it('returns false for a negative number', () => {
    expect(parsePositiveInt('-5')).toBe(false)
  })

  it('returns false for non-numeric input', () => {
    expect(parsePositiveInt('abc')).toBe(false)
  })

  it('truncates a decimal to its integer part', () => {
    expect(parsePositiveInt('10.9')).toBe(10)
  })
})
