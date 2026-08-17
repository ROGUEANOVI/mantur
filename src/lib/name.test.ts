import { describe, it, expect } from 'vitest'
import { isValidFullName } from './name'

describe('isValidFullName', () => {
  it('accepts a simple name', () => {
    expect(isValidFullName('Ana Perez')).toBe(true)
  })

  it('accepts accented letters and ñ', () => {
    expect(isValidFullName('María José Peña')).toBe(true)
  })

  it('accepts apostrophes and hyphens for compound names', () => {
    expect(isValidFullName("O'Connor")).toBe(true)
    expect(isValidFullName('Peña-Gómez')).toBe(true)
  })

  it('trims surrounding whitespace before validating', () => {
    expect(isValidFullName('  Ana Perez  ')).toBe(true)
  })

  it('rejects digits', () => {
    expect(isValidFullName('Ana123')).toBe(false)
  })

  it('rejects symbols', () => {
    expect(isValidFullName('Ana!!!')).toBe(false)
  })

  it('rejects an empty or whitespace-only string', () => {
    expect(isValidFullName('')).toBe(false)
    expect(isValidFullName('   ')).toBe(false)
  })
})
