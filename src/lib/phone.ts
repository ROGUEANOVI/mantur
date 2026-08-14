// Colombian mobile numbers: 10 digits, always starting with 3. Every
// WhatsApp (wa.me) link and contact phone in this app assumes that exact
// shape — this strips formatting noise (spaces, dashes, parens) and an
// accidental "+57"/"57" country-code prefix, so "300 123 4567",
// "+57 300 1234567", and "3001234567" all normalize to the same value.
// Returns null when the result isn't a valid 10-digit Colombian mobile
// number, so callers can reject the input instead of silently storing
// something that would build a broken wa.me link later.
const COLOMBIAN_MOBILE_RE = /^3\d{9}$/

export function normalizeColombianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const withoutCountryCode =
    digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits

  return COLOMBIAN_MOBILE_RE.test(withoutCountryCode) ? withoutCountryCode : null
}
