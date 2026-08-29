import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

type WompiWebhookEvent = {
  event: string
  data: Record<string, unknown>
  timestamp: number
  signature?: { properties: string[]; checksum: string }
}

// Wompi's `signature.properties` are dotted paths into `data`
// (e.g. "transaction.id" -> data.transaction.id). Per Wompi's own docs, the
// set of properties can vary per event, so this must resolve paths
// dynamically rather than assume a fixed shape.
function resolvePath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, source)
}

// Wompi's event-integrity formula: SHA256(concat(propertyValues) + timestamp + eventsSecret).
// We recompute it ourselves from the payload and the secret only we and
// Wompi know, then compare against the checksum Wompi included — an
// attacker without the secret cannot produce a matching value no matter
// what they put in the request body.
function isValidChecksum(event: WompiWebhookEvent, secret: string): boolean {
  if (!event.signature?.properties?.length || !event.signature.checksum || !event.timestamp) return false

  const concatenated =
    event.signature.properties.map((path) => String(resolvePath(event.data, path) ?? '')).join('') +
    String(event.timestamp) +
    secret

  const expected = createHash('sha256').update(concatenated).digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(event.signature.checksum, 'utf8')

  // timingSafeEqual throws on mismatched lengths — a checksum of the wrong
  // length can never be valid, so treat that as a mismatch rather than crash.
  if (expectedBuf.length !== receivedBuf.length) return false
  return timingSafeEqual(expectedBuf, receivedBuf)
}

const APPLICABLE_STATUSES = new Set(['APPROVED', 'DECLINED', 'ERROR', 'VOIDED', 'PENDING'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A generous window, comfortably wider than Wompi's own documented 24h/
// 3-retry delivery policy — legitimate late retries must never be rejected.
// This exists only to bound how long a captured, validly-signed event stays
// replayable, not to enforce real-time delivery.
const MAX_EVENT_AGE_SECONDS = 48 * 60 * 60
// Small allowance for clock skew between our server and Wompi's.
const MAX_CLOCK_SKEW_SECONDS = 5 * 60

function isFreshTimestamp(timestamp: number): boolean {
  const nowSeconds = Date.now() / 1000
  const age = nowSeconds - timestamp
  return age >= -MAX_CLOCK_SKEW_SECONDS && age <= MAX_EVENT_AGE_SECONDS
}

export async function POST(request: Request) {
  const secret = process.env.WOMPI_EVENTS_SECRET
  if (!secret) {
    console.error('WOMPI_EVENTS_SECRET is not configured; rejecting Wompi webhook')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  let event: WompiWebhookEvent
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!isValidChecksum(event, secret)) {
    console.error('Wompi webhook checksum mismatch — rejecting')
    return NextResponse.json({ error: 'invalid checksum' }, { status: 401 })
  }

  if (!isFreshTimestamp(event.timestamp)) {
    console.error('Wompi webhook event timestamp outside the accepted window — rejecting', { timestamp: event.timestamp })
    return NextResponse.json({ error: 'stale event' }, { status: 401 })
  }

  // Only transaction.updated carries the fields this handler understands.
  // Other event types (nequi_token.updated, bancolombia_transfer_token.updated)
  // are acknowledged as no-ops so Wompi doesn't keep retrying them.
  const transaction = (event.data as { transaction?: Record<string, unknown> }).transaction
  if (event.event !== 'transaction.updated' || !transaction) {
    return NextResponse.json({ received: true })
  }

  // `reference` is the booking id we generated in buildWompiCheckoutUrl();
  // `id` is Wompi's own transaction identifier, stored as wompi_reference.
  // `reference` is NOT part of Wompi's checksummed signature.properties (only
  // id/status/amount_in_cents typically are), so it must not be trusted on
  // its own — a malformed value is rejected here, and the RPC independently
  // cross-checks amount_in_cents/currency against what was actually stored
  // for that booking before ever confirming it (see the migration comment).
  const bookingId = transaction.reference as string | undefined
  const wompiTransactionId = transaction.id as string | undefined
  const wompiStatus = transaction.status as string | undefined
  const wompiAmountInCents = transaction.amount_in_cents
  const wompiCurrency = transaction.currency as string | undefined

  if (
    !bookingId ||
    !UUID_RE.test(bookingId) ||
    !wompiTransactionId ||
    !wompiStatus ||
    !APPLICABLE_STATUSES.has(wompiStatus) ||
    typeof wompiAmountInCents !== 'number' ||
    !Number.isInteger(wompiAmountInCents) ||
    wompiAmountInCents <= 0 ||
    !wompiCurrency
  ) {
    console.error('Wompi webhook payload missing or malformed expected fields', {
      bookingId,
      wompiTransactionId,
      wompiStatus,
      wompiAmountInCents,
      wompiCurrency,
    })
    return NextResponse.json({ received: true })
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('apply_wompi_webhook_transaction_update', {
    p_booking_id: bookingId,
    p_wompi_transaction_id: wompiTransactionId,
    p_wompi_status: wompiStatus,
    p_wompi_amount_in_cents: wompiAmountInCents,
    p_wompi_currency: wompiCurrency,
  })

  if (error) {
    console.error('Failed to apply Wompi webhook update', error)
    // A genuine DB failure (not a duplicate/no-op) should be retried by
    // Wompi's own retry policy, so this is the one case that must NOT
    // return 200.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
