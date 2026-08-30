// Pure, framework-free refund-window math — extracted for unit testing
// without mocking Supabase/Next.js, same reasoning as
// computeNetPayoutAmountCents in src/lib/wompi/payouts.ts.

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
