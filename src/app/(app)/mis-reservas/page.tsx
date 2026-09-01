import Link from 'next/link'
import { CalendarDays, Users, Banknote, ShoppingBag } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import { cn } from '@/lib/utils'
import { bogotaDateString } from '@/lib/refunds'
import RequestRefundForm from '@/components/reservas/RequestRefundForm'

type BookingItem = {
  id: string
  booking_date: string
  quantity: number
  total_amount: number
  status: string
  created_at: string
  services: {
    name: string
    businesses: { name: string } | null
  } | null
  guide_tours: {
    name: string
    tourist_guides: { profiles: { full_name: string | null } | null } | null
  } | null
  // refund_requests.booking_id is UNIQUE, so PostgREST embeds this as a
  // to-one relation (an object, not an array) — same pattern already used
  // for guide_tours.tourist_guides (also unique) elsewhere in this file's
  // sibling confirmacion/page.tsx.
  refund_requests: { status: string } | null
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function MisReservasPage() {
  const supabase = await createClient()

  // RLS policies automatically filter to the authenticated tourist's own bookings.
  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, booking_date, quantity, total_amount, status, created_at, services(name, businesses(name)), guide_tours(name, tourist_guides(profiles!profile_id(full_name))), refund_requests(status)',
    )
    .order('created_at', { ascending: false })

  const items = (bookings ?? []) as unknown as BookingItem[]

  // Only bookings where RequestRefundForm actually renders (confirmed, no
  // existing refund_requests row) need this — everything else never shows
  // the form. `transactions` is admin-only under RLS ("clients never
  // interact with this table directly"), so this reads via the admin client
  // like every other tourist-scoped lookup that needs fields beyond what
  // RLS itself exposes — safe here because the booking ids themselves come
  // from the RLS-scoped `bookings` query above, already proven to belong to
  // this tourist, not from any client-supplied input.
  const eligibleBookingIds = items
    .filter((b) => b.status === 'confirmed' && !b.refund_requests)
    .map((b) => b.id)

  const likelyAutoVoidByBookingId = new Map<string, boolean>()
  if (eligibleBookingIds.length > 0) {
    const admin = createAdminClient()
    const { data: txRows } = await admin
      .from('transactions')
      .select('booking_id, payment_method_type, created_at')
      .in('booking_id', eligibleBookingIds)

    const todayBogota = bogotaDateString(new Date())
    for (const tx of txRows ?? []) {
      const chargedToday = bogotaDateString(new Date(tx.created_at)) === todayBogota
      likelyAutoVoidByBookingId.set(tx.booking_id, tx.payment_method_type === 'CARD' && chargedToday)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {bookingsCopy.list.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {bookingsCopy.list.pageSubtitle}
          </p>
        </div>

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 flex flex-col items-center text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <ShoppingBag
                className="size-7 text-primary"
                aria-hidden="true"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              {bookingsCopy.list.empty}
            </p>
            <Link
              href="/negocios"
              className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 px-6 hover:bg-primary/90 transition-colors"
            >
              {bookingsCopy.list.explore}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((booking) => {
              const statusColor =
                bookingsCopy.list.statusColors[booking.status] ??
                bookingsCopy.list.statusColors.pending_payment
              const statusLabel =
                bookingsCopy.list.status[booking.status] ??
                booking.status

              const refundStatus = booking.refund_requests?.status ?? null
              const refundColor = refundStatus
                ? (bookingsCopy.refund.statusColors[refundStatus] ?? bookingsCopy.refund.statusColors.pending)
                : null
              const refundLabel = refundStatus
                ? (bookingsCopy.refund.status[refundStatus] ?? refundStatus)
                : null

              return (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-4 hover:shadow-md transition-shadow"
                >
                  <Link href={`/reservas/${booking.id}/confirmacion`} className="block">
                    {/* Service / guide tour name + entity */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
                          {booking.guide_tours?.name ?? booking.services?.name ?? '—'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {booking.guide_tours
                            ? (booking.guide_tours.tourist_guides?.profiles?.full_name ?? '—')
                            : (booking.services?.businesses?.name ?? '—')}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0',
                          statusColor,
                        )}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {formatDate(booking.booking_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden="true" />
                        {booking.quantity}&nbsp;{bookingsCopy.list.quantity}
                      </span>
                      <span className="flex items-center gap-1 text-primary font-semibold">
                        <Banknote className="size-3.5" aria-hidden="true" />
                        ${Number(booking.total_amount).toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  </Link>

                  {/* Refund: either a status pill for an existing request, or
                      the request button — only offered for a paid, still-active
                      booking (refund_requests.booking_id is UNIQUE, so at most
                      one request can ever exist per booking). */}
                  {refundStatus ? (
                    <div className="mt-3 pt-3 border-t border-border">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          refundColor,
                        )}
                      >
                        {refundLabel}
                      </span>
                    </div>
                  ) : booking.status === 'confirmed' ? (
                    <div className="mt-3 pt-3 border-t border-border">
                      <RequestRefundForm
                        bookingId={booking.id}
                        likelyAutoVoid={likelyAutoVoidByBookingId.get(booking.id) ?? false}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
