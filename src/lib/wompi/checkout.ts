import { createHash } from 'crypto'

// Matches the hardcoded APP_URL pattern in src/lib/email/roleRequestEmails.ts —
// redirect-url only affects where the tourist's browser lands after leaving
// Wompi's hosted checkout, it has no bearing on payment integrity (the
// webhook, not this redirect, is what confirms a payment — see route.ts).
const APP_URL = 'https://mantur.co'

const WOMPI_CHECKOUT_BASE_URL = 'https://checkout.wompi.co/p/'

function requireEnv(name: 'WOMPI_PUBLIC_KEY' | 'WOMPI_INTEGRITY_SECRET'): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

// Wompi's own integrity-signature formula for the Web Checkout:
// SHA256(reference + amountInCents + currency + integritySecret).
// Computed server-side only — the integrity secret must never reach the browser.
function buildIntegritySignature(reference: string, amountInCents: number, currency: string): string {
  const secret = requireEnv('WOMPI_INTEGRITY_SECRET')
  const raw = `${reference}${amountInCents}${currency}${secret}`
  return createHash('sha256').update(raw).digest('hex')
}

// Builds the URL for Wompi's hosted Web Checkout. `bookingId` is used as
// Wompi's `reference` field — it is already unique per booking (primary key),
// so no separate reference generator is needed. Wompi echoes this value back
// in the webhook payload as data.transaction.reference, which is how
// src/app/api/webhooks/wompi/route.ts finds the matching booking/transaction
// row to update.
export function buildWompiCheckoutUrl(params: {
  bookingId: string
  amountInCents: number
  currency: string
}): string {
  const publicKey = requireEnv('WOMPI_PUBLIC_KEY')
  const signature = buildIntegritySignature(params.bookingId, params.amountInCents, params.currency)

  const url = new URL(WOMPI_CHECKOUT_BASE_URL)
  url.searchParams.set('public-key', publicKey)
  url.searchParams.set('currency', params.currency)
  url.searchParams.set('amount-in-cents', String(params.amountInCents))
  url.searchParams.set('reference', params.bookingId)
  url.searchParams.set('signature:integrity', signature)
  // Forces Wompi's hosted checkout to collect the payer's identity document
  // regardless of payment method. Without this, Wompi's own form only asks
  // for it on CARD (billing_data.legal_id) — Nequi/Bancolombia Transfer/QR
  // collect no identification at all, and PSE/Daviplata put it under
  // payment_method.user_legal_id instead (see extractBillingIdentification
  // in src/app/api/webhooks/wompi/route.ts, which reads all of these). A
  // live sandbox booking paid via Nequi confirmed this gap: no identification
  // reached the webhook, so no Alegra invoice could be created for it —
  // this flag, plus the syncAlegraInvoice "Consumidor Final" fallback for
  // whatever slips through anyway, closes it.
  url.searchParams.set('collect-customer-legal-id', 'true')
  // Not a validation step — Wompi's own docs explicitly warn against trusting
  // this redirect as proof of payment. It only lands the tourist back on our
  // confirmation page, which polls until the webhook has updated the booking.
  url.searchParams.set('redirect-url', `${APP_URL}/reservas/${params.bookingId}/confirmacion`)
  return url.toString()
}
