import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'
import { ipAddress } from '@vercel/functions'

const redis = Redis.fromEnv()

// signIn/signUp: IP-based, defense-in-depth on top of Supabase Auth's own
// rate limits (which protect the underlying /auth/v1/* endpoints directly).
export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:auth',
})

// Booking creation: keyed by user id (authenticated tourists only).
export const bookingRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:booking',
})

// Role requests: low-frequency by nature, tight limit.
export const roleRequestRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'ratelimit:role-request',
})

// Transport requests: keyed by user id.
export const transportRequestRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'ratelimit:transport-request',
})

// Change-password current-password verification: keyed by user id. A
// compromised-but-authenticated session (stolen cookie, shared device)
// could otherwise throw unlimited current-password guesses at
// signInWithPassword from the server side — this caps that independently
// of Supabase's own IP-based limits.
export const changePasswordRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'ratelimit:change-password',
})

// Client IP for unauthenticated actions (signIn/signUp), where there's no
// user id yet to key on. Uses Vercel's own ipAddress() helper rather than
// reading the x-forwarded-for header directly — that header can otherwise
// carry a client-supplied value, which would let an attacker bypass the
// limit by rotating a fake IP on every request. Returns null (not a shared
// fallback string) when it can't be determined, e.g. local dev without
// Vercel's proxy in front of the request.
export async function getClientIp(): Promise<string | null> {
  const headerList = await headers()
  return ipAddress({ headers: headerList }) ?? null
}

// Rate limiting here is defense-in-depth (RLS + Supabase Auth's own limits
// are the primary guards), not the sole line of defense — so this fails
// OPEN rather than closed: a Redis outage or an unresolved identifier must
// never block login/booking/etc. for everyone. Also avoids funneling every
// client with an unresolved IP into one shared bucket they'd lock each
// other out of.
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string | null,
): Promise<boolean> {
  if (!identifier) return true
  try {
    const { success } = await limiter.limit(identifier)
    return success
  } catch (error) {
    console.error('Rate limit check failed, failing open:', error)
    return true
  }
}
