import { packagesCopy } from '@/lib/copy/packages'
import { quotePackage } from '@/lib/packages/quote'
import type { PriceTier } from '@/lib/packages/content'

// The price a package leads with on every surface (home showcase,
// /paquetes, detail, sticky bar, meta description).
//
// It is the price of the SMALLEST group that can actually book, with the
// group size spelled out — "Pareja: $280.000 · $140.000 c/u" — never the
// lowest per-person fare of a big group ("desde $120.000" only applies to
// 6+ people and would mislead a couple). Derived from the published group
// fares, so it follows them automatically; base_price is only the fallback
// for packages without fares.

export type HeadlinePackage = {
  base_price: number | string
  pricing_unit: string
  min_people?: number | null
}

export type PriceHeadline = {
  // "Pareja", "Grupo de 6", "3 a 10 personas" — null when it's a plain price.
  label: string | null
  // Main figure, already formatted: "$280.000".
  amount: string
  // "en total", "por persona", "por noche"…
  unit: string | null
  // Secondary line: "$140.000 c/u", "mínimo 3 personas".
  detail: string | null
  // Per-person value of the headline, for comparing packages (hero link).
  perPerson: number
}

const copy = packagesCopy.price

export function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')}`
}

function groupLabel(people: number): string {
  return people === 2 ? copy.couple : copy.group(people)
}

function sortedTiers(tiers: readonly PriceTier[]): PriceTier[] {
  return [...tiers].sort((a, b) => a.min_people - b.min_people)
}

export function packageHeadline(pkg: HeadlinePackage, tiers: readonly PriceTier[]): PriceHeadline {
  const first = sortedTiers(tiers)[0]

  if (first) {
    const amount = Number(first.amount)
    const exactSize = first.max_people === first.min_people

    // A fare for one exact group size: lead with what that group pays.
    if (exactSize || first.amount_basis === 'per_group') {
      const people = first.min_people
      const quote = quotePackage(pkg, tiers, people)
      const total = quote.ok ? quote.total : amount
      return {
        label: exactSize ? groupLabel(people) : copy.range(first.min_people, first.max_people),
        amount: formatCOP(total),
        unit: copy.total,
        detail: people > 1 ? `${formatCOP(total / people)} ${copy.each}` : null,
        perPerson: total / people,
      }
    }

    // A per-person fare over a range (e.g. 3 a 10 personas).
    return {
      label: null,
      amount: formatCOP(amount),
      unit: copy.perPerson,
      detail: copy.minimum(first.min_people),
      perPerson: amount,
    }
  }

  // No published fares: the base_price rule.
  const base = Number(pkg.base_price)
  const min = pkg.min_people ?? null
  if (pkg.pricing_unit === 'fixed') {
    return { label: null, amount: formatCOP(base), unit: copy.total, detail: null, perPerson: base / (min ?? 1) }
  }
  return {
    label: null,
    amount: formatCOP(base),
    unit: pkg.pricing_unit === 'per_night' ? copy.perNight : copy.perPerson,
    detail: min && min > 1 ? copy.minimum(min) : null,
    perPerson: base,
  }
}

// One line, for meta descriptions and accessible labels.
export function headlineText(h: PriceHeadline): string {
  const main = [h.label ? `${h.label}:` : null, h.amount, h.unit].filter(Boolean).join(' ')
  return h.detail ? `${main} · ${h.detail}` : main
}

// "Grupos de 6+: desde $120.000 c/u" — only when a bigger group really
// pays less per person than the headline group. Spelled out with its
// condition, so the low number is never shown without the group size.
export function groupDeal(pkg: HeadlinePackage, tiers: readonly PriceTier[]): string | null {
  if (tiers.length < 2) return null
  const headline = packageHeadline(pkg, tiers)

  let best: { people: number; perPerson: number } | null = null
  for (const tier of sortedTiers(tiers)) {
    const people = tier.min_people
    const quote = quotePackage(pkg, tiers, people)
    if (!quote.ok) continue
    const perPerson = quote.total / people
    if (!best || perPerson < best.perPerson) best = { people, perPerson }
  }

  if (!best || best.perPerson >= headline.perPerson) return null
  return copy.groupDeal(best.people, formatCOP(best.perPerson))
}
