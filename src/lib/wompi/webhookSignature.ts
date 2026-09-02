import { createHash, timingSafeEqual } from 'crypto'

// Shared by every Wompi webhook receiver (checkout's transaction.updated at
// src/app/api/webhooks/wompi/route.ts, and Payouts' event webhook at
// src/app/api/webhooks/wompi-payouts/route.ts) — Wompi documents this exact
// checksum/timestamp mechanism generically for its webhook events, not
// per-product, so both receivers verify deliveries the same way with their
// own distinct secret.

export type WompiWebhookEvent = {
  event: string
  data: Record<string, unknown>
  timestamp: number
  signature?: { properties: string[]; checksum: string }
}

// Wompi's `signature.properties` are dotted paths into `data`
// (e.g. "transaction.id" -> data.transaction.id). Per Wompi's own docs, the
// set of properties can vary per event, so this must resolve paths
// dynamically rather than assume a fixed shape.
export function resolvePath(source: unknown, path: string): unknown {
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
export function isValidChecksum(event: WompiWebhookEvent, secret: string): boolean {
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

// A generous window, comfortably wider than Wompi's own documented 24h/
// 3-retry delivery policy — legitimate late retries must never be rejected.
// This exists only to bound how long a captured, validly-signed event stays
// replayable, not to enforce real-time delivery.
export const MAX_EVENT_AGE_SECONDS = 48 * 60 * 60
// Small allowance for clock skew between our server and Wompi's.
export const MAX_CLOCK_SKEW_SECONDS = 5 * 60

export function isFreshTimestamp(timestamp: number): boolean {
  const nowSeconds = Date.now() / 1000
  const age = nowSeconds - timestamp
  return age >= -MAX_CLOCK_SKEW_SECONDS && age <= MAX_EVENT_AGE_SECONDS
}
