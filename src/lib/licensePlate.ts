// Colombian vehicle plates: 3 letters followed by 3 digits (cars/camionetas,
// e.g. "ABC123"), or 3 letters + 2 digits + 1 trailing letter for
// motorcycles/motocarros (e.g. "ABC12D"). Strips spaces/hyphens and
// uppercases before matching, so "abc-123" and "ABC 123" both normalize to
// "ABC123". Returns null when the result doesn't match either shape.
const PLATE_RE = /^[A-Z]{3}\d{3}$|^[A-Z]{3}\d{2}[A-Z]$/

export function normalizeLicensePlate(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase()
  return PLATE_RE.test(cleaned) ? cleaned : null
}
