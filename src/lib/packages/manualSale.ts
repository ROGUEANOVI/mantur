import { adminCopy } from '@/lib/copy/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import { normalizeColombianPhone } from '@/lib/phone'
import { quotePackage } from '@/lib/packages/quote'
import type { PriceTier } from '@/lib/packages/content'

// Pure validation for an admin-registered package sale (WhatsApp deal) —
// kept free of Supabase so every branch is unit-testable. The Server Action
// (createManualPackageSale) loads the package and checks the tourist; this
// turns the rest of the FormData into RPC-ready values.
//
// Money rule: the catalog total is always recomputed here from the DB
// package row. The only client-supplied amount is the optional agreed
// total, which must come with a written reason and is stored alongside the
// catalog total so accounting can see both.

export const MANUAL_PAYMENT_METHODS = ['bank_transfer', 'nequi_daviplata', 'cash', 'wompi_link'] as const
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number]

export const GUEST_DOCUMENT_TYPES = ['CC', 'CE', 'NIT', 'PP'] as const
export type GuestDocumentType = (typeof GUEST_DOCUMENT_TYPES)[number]

export type PricingUnit = 'per_person' | 'per_night' | 'fixed'

export type SalePackage = {
  base_price: number | string
  pricing_unit: PricingUnit
  capacity: number | null
}

export type GuestCustomer = {
  fullName: string
  phone: string
  documentType: GuestDocumentType | null
  documentNumber: string | null
  email: string | null
}

export type ParsedManualSale = {
  quantity: number
  bookingDate: string
  // null when the package has group tiers but none covers this group size
  // (quoted by hand: the agreed total is then mandatory).
  catalogTotal: number | null
  totalAmount: number
  priceAdjustmentReason: string | null
  notes: string | null
  guest: GuestCustomer | null
  isPaid: boolean
  paymentMethod: ManualPaymentMethod | null
  paymentReference: string | null
  paidAt: string | null
}

// Agreed totals above this are almost certainly a typo (an extra zero).
export const MAX_AGREED_TOTAL = 100_000_000
const MAX_NOTES_LENGTH = 1000
const MAX_REFERENCE_LENGTH = 100
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DOCUMENT_NUMBER_RE = /^[A-Za-z0-9-]{5,20}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Today in Colombia, as YYYY-MM-DD.
export function bogotaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now)
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function addYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

// Catalog total for the sale: group tiers first, base_price rule otherwise
// (see quotePackage). null = no published fare for this group size.
export function computeCatalogTotal(pkg: SalePackage, quantity: number, tiers: readonly PriceTier[] = []) {
  const quote = quotePackage(pkg, tiers, quantity)
  if (!quote.ok) return { storedQuantity: quantity, catalogTotal: null }
  return { storedQuantity: quote.storedQuantity, catalogTotal: quote.total }
}

function text(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

export function parseManualPackageSale(
  formData: FormData,
  pkg: SalePackage,
  customerMode: 'registered' | 'guest',
  today: string = bogotaToday(),
  tiers: readonly PriceTier[] = [],
): { error: string } | { sale: ParsedManualSale } {
  const errors = adminCopy.reservas.errors

  // ── Quantity & catalog total ───────────────────────────────────────────
  const quantity = parseInt(text(formData, 'quantity'), 10)
  if (!Number.isInteger(quantity) || quantity < 1) return { error: bookingsCopy.errors.invalidQuantity }
  if (pkg.capacity !== null && quantity > pkg.capacity) return { error: bookingsCopy.errors.capacityExceeded }
  const { storedQuantity, catalogTotal } = computeCatalogTotal(pkg, quantity, tiers)

  // ── Trip date: past allowed (late registration), up to 2 years ahead ───
  const bookingDate = text(formData, 'booking_date')
  if (!isRealDate(bookingDate) || bookingDate > addYears(today, 2)) return { error: errors.invalidSaleDate }

  // ── Agreed total: optional, or mandatory when there's no catalog fare ──
  if (catalogTotal === null && formData.get('price_override') !== 'on') return { error: errors.noTierForGroup }
  let totalAmount = catalogTotal ?? 0
  let priceAdjustmentReason: string | null = null
  if (formData.get('price_override') === 'on') {
    const rawAgreed = text(formData, 'agreed_total')
    const agreed = Number(rawAgreed)
    if (!/^\d+$/.test(rawAgreed) || !Number.isInteger(agreed) || agreed <= 0 || agreed > MAX_AGREED_TOTAL) {
      return { error: errors.invalidAgreedTotal }
    }
    if (agreed !== catalogTotal) {
      const reason = text(formData, 'price_adjustment_reason')
      if (reason.length < 3 || reason.length > 300) return { error: errors.adjustmentReasonRequired }
      totalAmount = agreed
      priceAdjustmentReason = reason
    }
  }

  const notes = text(formData, 'notes') || null
  if (notes && notes.length > MAX_NOTES_LENGTH) return { error: errors.notesTooLong }

  // ── Guest customer ─────────────────────────────────────────────────────
  let guest: GuestCustomer | null = null
  if (customerMode === 'guest') {
    const fullName = text(formData, 'guest_full_name').replace(/\s+/g, ' ')
    if (fullName.length < 2 || fullName.length > 120) return { error: errors.guestNameRequired }

    const phone = normalizeColombianPhone(text(formData, 'guest_phone'))
    if (!phone) return { error: errors.guestPhoneInvalid }

    const rawDocType = text(formData, 'guest_document_type')
    const rawDocNumber = text(formData, 'guest_document_number').replace(/\s+/g, '')
    let documentType: GuestDocumentType | null = null
    let documentNumber: string | null = null
    if (rawDocType || rawDocNumber) {
      if (
        !GUEST_DOCUMENT_TYPES.includes(rawDocType as GuestDocumentType) ||
        !DOCUMENT_NUMBER_RE.test(rawDocNumber)
      ) {
        return { error: errors.guestDocumentInvalid }
      }
      documentType = rawDocType as GuestDocumentType
      documentNumber = rawDocNumber
    }

    const email = text(formData, 'guest_email').toLowerCase() || null
    if (email && (email.length > 254 || !EMAIL_RE.test(email))) return { error: errors.guestEmailInvalid }

    guest = { fullName, phone, documentType, documentNumber, email }
  }

  // ── Payment ────────────────────────────────────────────────────────────
  const isPaid = text(formData, 'payment_status') === 'paid'
  let paymentMethod: ManualPaymentMethod | null = null
  let paymentReference: string | null = null
  let paidAt: string | null = null
  if (isPaid) {
    const method = text(formData, 'payment_method')
    if (!MANUAL_PAYMENT_METHODS.includes(method as ManualPaymentMethod)) return { error: errors.paymentMethodRequired }
    paymentMethod = method as ManualPaymentMethod

    const paidDate = text(formData, 'paid_date')
    if (!isRealDate(paidDate) || paidDate > today) return { error: errors.paymentDateInvalid }
    // Noon in Colombia, so the stored timestamp never drifts to another day.
    paidAt = `${paidDate}T12:00:00-05:00`

    paymentReference = text(formData, 'payment_reference') || null
    if (paymentReference && paymentReference.length > MAX_REFERENCE_LENGTH) {
      return { error: errors.paymentReferenceTooLong }
    }
  }

  return {
    sale: {
      quantity: storedQuantity,
      bookingDate,
      catalogTotal,
      totalAmount,
      priceAdjustmentReason,
      notes,
      guest,
      isPaid,
      paymentMethod,
      paymentReference,
      paidAt,
    },
  }
}

// Payment fields for "Marcar como pagada" in /admin/paquetes/solicitudes —
// same rules as the paid branch above.
export function parseManualPayment(
  formData: FormData,
  today: string = bogotaToday(),
): { error: string } | { method: ManualPaymentMethod; reference: string | null; paidAt: string } {
  const errors = adminCopy.paquetes.solicitudes.errors

  const method = text(formData, 'payment_method')
  if (!MANUAL_PAYMENT_METHODS.includes(method as ManualPaymentMethod)) return { error: errors.paymentMethodRequired }

  const paidDate = text(formData, 'paid_date')
  if (!isRealDate(paidDate) || paidDate > today) return { error: errors.paymentDateInvalid }

  const reference = text(formData, 'payment_reference') || null
  if (reference && reference.length > MAX_REFERENCE_LENGTH) return { error: errors.paymentReferenceTooLong }

  return { method: method as ManualPaymentMethod, reference, paidAt: `${paidDate}T12:00:00-05:00` }
}

// ── Display helpers (admin lists) ────────────────────────────────────────

export type GuestContactRow = {
  full_name: string
  phone: string
  document_type: string | null
  document_number: string | null
  email: string | null
}

export type ManualPaymentRow = {
  manual_payment_method: string | null
  manual_payment_reference: string | null
  paid_at: string | null
}

// PostgREST embeds a one-to-one relation as an object, but older/ambiguous
// detections return a single-element array — accept both.
export function firstEmbedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// Name shown for a booking's customer: the registered tourist's, or the
// account-less guest's.
export function customerName(
  profile: { full_name: string | null } | null,
  guest: GuestContactRow | null,
): { name: string; isGuest: boolean } {
  if (guest) return { name: guest.full_name, isGuest: true }
  return { name: profile?.full_name ?? '—', isGuest: false }
}

// Compact "datos para facturar" line for the admin list: guest ID/contact
// plus how the sale was paid. Empty parts are skipped; returns null when
// there's nothing to show (e.g. a regular tourist booking paid via Wompi).
export function billingSummary(guest: GuestContactRow | null, payment: ManualPaymentRow | null): string | null {
  const parts: string[] = []
  if (guest) {
    if (guest.document_type && guest.document_number) parts.push(`${guest.document_type} ${guest.document_number}`)
    parts.push(guest.phone)
    if (guest.email) parts.push(guest.email)
  }
  if (payment?.manual_payment_method) {
    const method = adminCopy.reservas.paymentMethods[payment.manual_payment_method] ?? payment.manual_payment_method
    parts.push(payment.manual_payment_reference ? `${method} (${payment.manual_payment_reference})` : method)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}
