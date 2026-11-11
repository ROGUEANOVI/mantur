import { adminCopy } from '@/lib/copy/admin'
import { packagesCopy } from '@/lib/copy/packages'

// Structured package content (docs/specs/SPEC-paquetes-tracking.md phase 2)
// and per-group price tiers (phase 1.2). Pure parsing/formatting — no
// Supabase — so every rule is unit-testable. Limits mirror the DB CHECKs in
// 20261112000000_add_package_structured_content.sql.

export const DIFFICULTIES = ['baja', 'media', 'alta'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const TIER_BASES = ['per_person', 'per_group'] as const
export type TierBasis = (typeof TIER_BASES)[number]

export const LIST_FIELDS = ['itinerary', 'includes', 'what_to_bring'] as const
export type ListField = (typeof LIST_FIELDS)[number]

const MAX_LIST_ITEMS = 20
const MAX_LIST_ITEM_LENGTH = 300

export type PackageContentFields = {
  summary: string | null
  itinerary: string[]
  includes: string[]
  what_to_bring: string[]
  duration_label: string | null
  meeting_point: string | null
  difficulty: Difficulty | null
  min_people: number | null
  payment_info: string | null
  cancellation_policy: string | null
}

export type PriceTier = {
  min_people: number
  max_people: number | null
  amount: number | string
  amount_basis: TierBasis
}

function text(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

// One item per line in the admin textarea. Leading bullets/numbers typed by
// habit ("- ", "• ", "1. ", "✅ ") are stripped so the page can render its
// own consistent markers.
export function parseLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·✓✔✅]|\d+[.)])\s*/u, '').trim())
    .filter((line) => line.length > 0)
}

function optionalText(formData: FormData, key: string, max: number): { value: string | null } | { tooLong: true } {
  const value = text(formData, key)
  if (!value) return { value: null }
  if (value.length > max) return { tooLong: true }
  return { value }
}

export function parsePackageContent(
  formData: FormData,
  capacity: number | null,
): { error: string } | { fields: PackageContentFields } {
  const errors = adminCopy.paquetes.content.errors

  const summary = optionalText(formData, 'summary', 280)
  if ('tooLong' in summary) return { error: errors.summaryTooLong }

  const lists = {} as Record<ListField, string[]>
  for (const field of LIST_FIELDS) {
    const items = parseLines(text(formData, field))
    if (items.length > MAX_LIST_ITEMS || items.some((item) => item.length > MAX_LIST_ITEM_LENGTH)) {
      return { error: errors.listTooLong }
    }
    lists[field] = items
  }

  const duration = optionalText(formData, 'duration_label', 80)
  if ('tooLong' in duration) return { error: errors.durationTooLong }

  const meetingPoint = optionalText(formData, 'meeting_point', 200)
  if ('tooLong' in meetingPoint) return { error: errors.meetingPointTooLong }

  const rawDifficulty = text(formData, 'difficulty')
  if (rawDifficulty && !DIFFICULTIES.includes(rawDifficulty as Difficulty)) return { error: errors.invalidDifficulty }

  const rawMinPeople = text(formData, 'min_people')
  let minPeople: number | null = null
  if (rawMinPeople) {
    minPeople = Number(rawMinPeople)
    if (!Number.isInteger(minPeople) || minPeople < 1) return { error: errors.invalidMinPeople }
    if (capacity !== null && minPeople > capacity) return { error: errors.minPeopleOverCapacity }
  }

  const payment = optionalText(formData, 'payment_info', 500)
  if ('tooLong' in payment) return { error: errors.paymentInfoTooLong }

  const cancellation = optionalText(formData, 'cancellation_policy', 800)
  if ('tooLong' in cancellation) return { error: errors.cancellationTooLong }

  return {
    fields: {
      summary: summary.value,
      ...lists,
      duration_label: duration.value,
      meeting_point: meetingPoint.value,
      difficulty: (rawDifficulty || null) as Difficulty | null,
      min_people: minPeople,
      payment_info: payment.value,
      cancellation_policy: cancellation.value,
    },
  }
}

export function parsePriceTier(formData: FormData): { error: string } | { tier: PriceTier } {
  const errors = adminCopy.paquetes.tiers.errors

  const minPeople = Number(text(formData, 'min_people'))
  if (!Number.isInteger(minPeople) || minPeople < 1) return { error: errors.invalidMinPeople }

  const rawMax = text(formData, 'max_people')
  let maxPeople: number | null = null
  if (rawMax) {
    maxPeople = Number(rawMax)
    if (!Number.isInteger(maxPeople) || maxPeople < minPeople) return { error: errors.invalidMaxPeople }
  }

  const rawAmount = text(formData, 'amount')
  const amount = Number(rawAmount)
  if (!/^\d+$/.test(rawAmount) || amount <= 0 || amount > 100_000_000) return { error: errors.invalidAmount }

  const basis = text(formData, 'amount_basis')
  if (!TIER_BASES.includes(basis as TierBasis)) return { error: errors.invalidBasis }

  return { tier: { min_people: minPeople, max_people: maxPeople, amount, amount_basis: basis as TierBasis } }
}

function peopleRange(tier: Pick<PriceTier, 'min_people' | 'max_people'>): string {
  const copy = packagesCopy.tiers
  if (tier.max_people === tier.min_people) return copy.exactly(tier.min_people)
  if (tier.max_people === null) return copy.orMore(tier.min_people)
  return copy.range(tier.min_people, tier.max_people)
}

// "2 personas" · "$280.000 en total" — one row of the public price table.
export function describeTier(tier: PriceTier): { people: string; price: string } {
  const amount = `$${Number(tier.amount).toLocaleString('es-CO')}`
  const basis = tier.amount_basis === 'per_group' ? packagesCopy.tiers.perGroup : packagesCopy.tiers.perPerson
  return { people: peopleRange(tier), price: `${amount} ${basis}` }
}

// Admin textareas show lists back one item per line.
export function joinLines(items: string[] | null | undefined): string {
  return (items ?? []).join('\n')
}
