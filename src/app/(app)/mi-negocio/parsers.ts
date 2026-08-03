export function parsePrice(raw: string): number | null {
  const price = parseFloat(raw)
  // isNaN catches NaN; Number.isFinite rejects Infinity/-Infinity
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return null
  return price
}

export function parsePositiveInt(raw: string | null): number | null | false {
  if (!raw) return null
  const n = parseInt(raw, 10)
  if (isNaN(n) || n <= 0) return false
  return n
}
