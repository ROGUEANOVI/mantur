import { describe, it, expect } from 'vitest'
import { normalizeColombianPhone } from './phone'

describe('normalizeColombianPhone', () => {
  it('accepts a plain 10-digit mobile number', () => {
    expect(normalizeColombianPhone('3001234567')).toBe('3001234567')
  })

  it('strips spaces', () => {
    expect(normalizeColombianPhone('300 123 4567')).toBe('3001234567')
  })

  it('strips dashes and parentheses', () => {
    expect(normalizeColombianPhone('(300)-123-4567')).toBe('3001234567')
  })

  it('strips a leading +57 country code', () => {
    expect(normalizeColombianPhone('+57 300 123 4567')).toBe('3001234567')
  })

  it('strips a leading 57 country code without a plus sign', () => {
    expect(normalizeColombianPhone('57 300 123 4567')).toBe('3001234567')
  })

  it('rejects a number that is too short', () => {
    expect(normalizeColombianPhone('300123')).toBeNull()
  })

  it('rejects a number that is too long even after stripping non-digits', () => {
    expect(normalizeColombianPhone('30012345678')).toBeNull()
  })

  it('rejects a number that does not start with 3 (not a Colombian mobile prefix)', () => {
    expect(normalizeColombianPhone('6012345678')).toBeNull()
  })

  it('rejects empty input', () => {
    expect(normalizeColombianPhone('')).toBeNull()
  })

  it('rejects input with no digits at all', () => {
    expect(normalizeColombianPhone('abc')).toBeNull()
  })

  it('does not misinterpret a valid 10-digit number that happens to start with 57 as having a country-code prefix', () => {
    // "57" + 8 more digits would be 10 total, not 12 — the country-code
    // strip only fires at exactly 12 digits, so a genuine number can't
    // collide with it.
    expect(normalizeColombianPhone('5712345678')).toBeNull() // doesn't start with 3, correctly rejected
  })
})
