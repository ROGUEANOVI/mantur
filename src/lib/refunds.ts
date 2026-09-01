// Pure, framework-free refund-window math — extracted for unit testing
// without mocking Supabase/Next.js, same reasoning as
// computeNetPayoutAmountCents in src/lib/wompi/payouts.ts.

// Extracted from src/app/(app)/mis-reservas/actions.ts (was a local,
// unexported helper there) so mis-reservas/page.tsx can use the exact same
// "same Bogotá calendar day" comparison to predict whether a refund request
// is likely to qualify for an instant same-day void, without duplicating
// the logic.
export function bogotaDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(date)
}

// bookings.booking_date is a plain DATE with no time-of-day (see
// docs/wompi-alegra-integration-plan.md §5.2 and src/app/(app)/reservas/actions.ts).
// The finest granularity available is whole calendar days in Bogotá time
// (America/Bogota has no DST, so a same-day comparison is unambiguous), so
// the refund window is evaluated in whole 24h increments off Bogotá
// midnight, not the exact hour the booked activity actually starts.
export function computeHoursUntilBooking(bookingDate: string, todayBogotaDate: string): number {
  const [by, bm, bd] = bookingDate.split('-').map(Number)
  const [ty, tm, td] = todayBogotaDate.split('-').map(Number)
  const bookingMs = Date.UTC(by, bm - 1, bd)
  const todayMs = Date.UTC(ty, tm - 1, td)
  const days = Math.round((bookingMs - todayMs) / (24 * 60 * 60 * 1000))
  // A booking date that is today or already in the past (a same-day
  // cancellation request, or a no-show) is treated as 0 hours remaining —
  // the shortest/harshest refund tier — never negative, since no configured
  // policy tier's threshold could ever match a negative value.
  return Math.max(0, days) * 24
}

export function computeRefundAmountCents(amountInCents: number, refundPercentage: number): number {
  return Math.round((amountInCents * refundPercentage) / 100)
}

// A same-day Wompi void reverses the charge before it ever settles, so no
// processing fee accrues — net equals gross. Any other refund happens after
// settlement, when Wompi has already kept its fee; that fee is deducted from
// what the tourist receives, floored at zero. Mirrors the SQL in
// mark_refund_request_processed() / cascade_refund_to_booking() (see
// supabase/migrations/20260831220000_add_refund_fee_deduction.sql) — kept in
// sync manually since one runs in Postgres and the other previews on the
// admin page before a request resolves.
export function computeNetRefundAmountCents(
  refundAmountCents: number,
  wompiFeeCents: number | null,
  refundMethod: 'void' | 'manual',
): number {
  if (refundMethod === 'void') return refundAmountCents
  const fee = wompiFeeCents ?? 0
  return refundAmountCents - Math.min(fee, refundAmountCents)
}
