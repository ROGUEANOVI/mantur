import { authCopy } from '@/lib/copy/auth'

export const PASSWORD_RE = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/

export const PASSWORD_RULES = [
  { key: 'minLength', label: authCopy.signup.passwordRules.minLength, test: (p: string) => p.length >= 8 },
  { key: 'uppercase', label: authCopy.signup.passwordRules.uppercase, test: (p: string) => /[A-Z]/.test(p) },
  { key: 'digit',     label: authCopy.signup.passwordRules.digit,     test: (p: string) => /[0-9]/.test(p) },
  { key: 'special',   label: authCopy.signup.passwordRules.special,   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export function isPasswordValid(p: string) {
  return PASSWORD_RULES.every((r) => r.test(p))
}
