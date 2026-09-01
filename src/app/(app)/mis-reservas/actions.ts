'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import { refundRequestRateLimit, checkRateLimit } from '@/lib/rate-limit'
import { computeHoursUntilBooking, computeRefundAmountCents } from '@/lib/refunds'
import { voidWompiTransaction } from '@/lib/wompi/refunds'
import { sendRefundProcessedEmail } from '@/lib/email/refundEmails'

type RefundResult = { error: string } | void

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthenticatedTourist() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'tourist') redirect('/')

  return { userId: user.id, email: user.email ?? null }
}

function bogotaDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(date)
}

export async function requestRefund(formData: FormData): Promise<RefundResult> {
  const { userId, email } = await getAuthenticatedTourist()

  const allowed = await checkRateLimit(refundRequestRateLimit, userId)
  if (!allowed) return { error: bookingsCopy.errors.rateLimited }

  const bookingId = formData.get('booking_id') as string
  if (!UUID_RE.test(bookingId)) return { error: bookingsCopy.errors.notFound }

  const reason = (formData.get('reason') as string | null)?.trim() || null

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, tourist_id, booking_date, status')
    .eq('id', bookingId)
    .single()

  // Read via admin (bypasses RLS) then check ownership explicitly — same
  // pattern as every other tourist-scoped Server Action in this codebase
  // that needs fields beyond what RLS alone would filter for.
  if (!booking || booking.tourist_id !== userId) return { error: bookingsCopy.errors.notFound }

  // Only a paid, still-active booking can be refunded: pending_payment was
  // never charged, and cancelled/completed are already terminal.
  if (booking.status !== 'confirmed') return { error: bookingsCopy.refund.errors.notRefundable }

  const { data: transaction } = await admin
    .from('transactions')
    .select('id, status, amount_in_cents, wompi_reference, created_at, wompi_fee_cents')
    .eq('booking_id', bookingId)
    .single()

  if (!transaction || transaction.status !== 'paid') return { error: bookingsCopy.refund.errors.notRefundable }

  const todayBogota = bogotaDateString(new Date())
  const hoursUntilBooking = computeHoursUntilBooking(booking.booking_date, todayBogota)

  const { data: refundPercentage, error: rateError } = await admin.rpc('get_refund_percentage', {
    p_hours_until_booking: hoursUntilBooking,
  })
  if (rateError || refundPercentage === null) return { error: bookingsCopy.errors.generic }

  const refundAmountCents = computeRefundAmountCents(transaction.amount_in_cents, Number(refundPercentage))

  const { data: refundRequest, error: insertError } = await admin
    .from('refund_requests')
    .insert({
      booking_id: bookingId,
      transaction_id: transaction.id,
      requested_by: userId,
      refund_percentage: refundPercentage,
      refund_amount_cents: refundAmountCents,
      wompi_fee_cents: transaction.wompi_fee_cents,
      reason,
    })
    .select('id')
    .single()

  if (insertError || !refundRequest) {
    // 23505 = unique_violation on refund_requests.booking_id — a request
    // already exists for this booking (this MVP allows exactly one, ever).
    if (insertError?.code === '23505') return { error: bookingsCopy.refund.errors.alreadyRequested }
    return { error: bookingsCopy.errors.generic }
  }

  // Only a same-day, full-refund charge is eligible for an instant Wompi
  // void: voiding reverses the ENTIRE original charge (no partial void),
  // and is only possible before settlement. Anything else — a partial
  // percentage, or a charge from an earlier day — is left 'pending' here
  // for an admin to process manually (see /admin/reembolsos), per
  // docs/wompi-alegra-integration-plan.md §5.2.
  const chargedTodayBogota = bogotaDateString(new Date(transaction.created_at)) === todayBogota

  if (Number(refundPercentage) === 100 && chargedTodayBogota && transaction.wompi_reference) {
    // Claim the row BEFORE calling Wompi: a Postgres transaction can't stay
    // open across the external HTTP call, so the claim/revert split (see
    // the migration comment on claim_refund_request_for_void) is what
    // prevents an admin's reject/manual-process action from racing this
    // same 'pending' row while the void call is in flight.
    const { data: claimed } = await admin.rpc('claim_refund_request_for_void', {
      p_refund_request_id: refundRequest.id,
    })

    if (claimed) {
      const voidResult = await voidWompiTransaction(transaction.wompi_reference)
      if (voidResult.ok) {
        // Wompi's void response almost never confirms VOIDED synchronously
        // (confirmed against a real sandbox call — see the comment on
        // voidWompiTransaction) — the normal case is that the row stays
        // 'processing' here and the webhook's
        // confirm_refund_request_void_by_wompi_reference() finishes the job
        // once Wompi's transaction.updated event actually arrives. Only take
        // this fast path on the rare response that already says VOIDED.
        if (voidResult.status === 'VOIDED') {
          // `cascaded` is false if this is a no-op — e.g. the webhook's own
          // confirm_refund_request_void_by_wompi_reference() already won the
          // race and cascaded first. Only the caller that actually flipped
          // paid -> voided sends the notification, so the tourist is never
          // emailed twice for the same refund.
          const { data: cascaded } = await admin.rpc('cascade_refund_to_booking', { p_refund_request_id: refundRequest.id })
          if (cascaded && email) await sendRefundProcessedEmail(email, refundAmountCents, 'void')
        }
      } else {
        // Undo the claim so the row goes back to 'pending' for an admin to
        // process manually — this is a ledger entry for follow-up, not a
        // failure of the request itself (the tourist's request was recorded).
        await admin.rpc('revert_refund_request_void_claim', { p_refund_request_id: refundRequest.id })
        console.error('Wompi void failed for a refund request; reverted the claim so it stays pending for manual processing', voidResult.error)
      }
    }
    // claimed === false means an admin action won the race in the narrow
    // window between the insert above and this claim attempt — the row is
    // already 'processed' or 'rejected' by that action, nothing more to do.
  }

  revalidatePath('/mis-reservas')
}
