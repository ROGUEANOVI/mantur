import { describe, it, expect } from 'vitest'
import { isPasswordValid, PASSWORD_RE, PASSWORD_RULES } from './password'

describe('PASSWORD_RULES', () => {
  it('has one rule per requirement, each with a label and test', () => {
    expect(PASSWORD_RULES).toHaveLength(4)
    for (const rule of PASSWORD_RULES) {
      expect(typeof rule.label).toBe('string')
      expect(typeof rule.test).toBe('function')
    }
  })
})

describe('isPasswordValid', () => {
  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no number', 'Abcdefgh!'],
    ['no special character', 'Abcdefgh1'],
    ['empty', ''],
  ])('returns false for a password that is %s', (_label, password) => {
    expect(isPasswordValid(password)).toBe(false)
  })

  it('returns true for a password meeting every rule', () => {
    expect(isPasswordValid('Correct1!')).toBe(true)
  })
})

describe('PASSWORD_RE', () => {
  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdefg1!'],
    ['no number', 'Abcdefgh!'],
    ['no special character', 'Abcdefgh1'],
    ['empty', ''],
  ])('does not match a password that is %s, matching isPasswordValid', (_label, password) => {
    expect(PASSWORD_RE.test(password)).toBe(false)
    expect(PASSWORD_RE.test(password)).toBe(isPasswordValid(password))
  })

  it('matches a password meeting every rule, matching isPasswordValid', () => {
    expect(PASSWORD_RE.test('Correct1!')).toBe(true)
    expect(PASSWORD_RE.test('Correct1!')).toBe(isPasswordValid('Correct1!'))
  })
})
