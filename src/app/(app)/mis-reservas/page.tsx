import Link from 'next/link'
import { CalendarDays, Users, Banknote, ShoppingBag } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { bookingsCopy } from '@/lib/copy/bookings'
import { cn } from '@/lib/utils'

type BookingItem = {
  id: string
  booking_date: string
  people_count: number
  total_amount: number
  status: string
  created_at: string
  experiences: {
    name: string
    businesses: { name: string } | null
  } | null
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
      'id, booking_date, people_count, total_amount, status, created_at, experiences(name, businesses(name))',
    )
    .order('created_at', { ascending: false })

  const items = (bookings ?? []) as unknown as BookingItem[]

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
              className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] px-6 hover:bg-primary/90 transition-colors"
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

              return (
                <Link
                  key={booking.id}
                  href={`/reservas/${booking.id}/confirmacion`}
                  className="block rounded-2xl border border-border bg-card shadow-sm p-4 hover:shadow-md transition-shadow"
                >
                  {/* Experience name + business */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
                        {booking.experiences?.name ?? '—'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {booking.experiences?.businesses?.name ?? '—'}
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
                      {booking.people_count}&nbsp;{bookingsCopy.list.people}
                    </span>
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <Banknote className="size-3.5" aria-hidden="true" />
                      ${Number(booking.total_amount).toLocaleString('es-CO')} COP
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
