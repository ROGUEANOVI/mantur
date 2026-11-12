import type { PriceTier } from '@/lib/packages/content'

// Single source of truth for "how much does this package cost for N people".
// Used server-side for every amount that is stored (manual sales, web
// pre-reservas) and client-side only for previews / analytics estimates.
//
// Rules:
//   1. If the package has published group tiers (package_price_tiers), the
//      tier covering `people` decides the total: a per_group amount is the
//      total; a per_person amount is multiplied by `people`.
//   2. If it has tiers but none covers `people` (e.g. Casa de Campo has
//      6, 8 and 12 but not 7), there is NO catalog price — it must be quoted
//      by hand. We never fall back to base_price there: base_price is the
//      lowest "desde" fare and would undercharge.
//   3. With no tiers at all, the original base_price rule applies
//      (fixed → base_price; per person / per night → base_price × people).

export type QuotablePackage = {
  base_price: number | string
  pricing_unit: string
}

export type PackageQuote =
  | { ok: true; total: number; storedQuantity: number; source: 'tier' | 'base' }
  | { ok: false; reason: 'no_tier_for_group' }

export function findTier<T extends Pick<PriceTier, 'min_people' | 'max_people'>>(
  tiers: readonly T[],
  people: number,
): T | null {
  return tiers.find((t) => people >= t.min_people && (t.max_people === null || people <= t.max_people)) ?? null
}

export function quotePackage(pkg: QuotablePackage, tiers: readonly PriceTier[], people: number): PackageQuote {
  if (tiers.length > 0) {
    const tier = findTier(tiers, people)
    if (!tier) return { ok: false, reason: 'no_tier_for_group' }
    const amount = Number(tier.amount)
    const total = tier.amount_basis === 'per_group' ? amount : amount * people
    // With tiers the price depends on the group size, so keep the real
    // number of people on the booking.
    return { ok: true, total, storedQuantity: people, source: 'tier' }
  }

  const base = Number(pkg.base_price)
  if (pkg.pricing_unit === 'fixed') return { ok: true, total: base, storedQuantity: 1, source: 'base' }
  return { ok: true, total: base * people, storedQuantity: people, source: 'base' }
}
