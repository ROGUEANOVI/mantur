import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, CalendarDays, Users, Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import PaginationNav from '@/components/shared/PaginationNav'

const VALID_STATUSES = ['all', 'pending_payment', 'confirmed', 'completed', 'cancelled'] as const
type StatusFilter = (typeof VALID_STATUSES)[number]
const PAGE_SIZE = 10

type BookingRow = {
  id: string
  booking_date: string
  quantity: number
  total_amount: number
  status: string
  notes: string | null
  services: { name: string } | null
  profiles: { full_name: string | null } | null
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function MiNegocioReservasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const { id } = await params
  const { status: rawStatus, page: rawPage } = await searchParams
  const statusFilter: StatusFilter = VALID_STATUSES.includes(rawStatus as StatusFilter)
    ? (rawStatus as StatusFilter)
    : 'all'
  const page = Math.max(1, Math.floor(Number(rawPage)) || 1)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) notFound()

  const copy = miNegocioCopy.bookings
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('bookings')
    .select('id, booking_date, quantity, total_amount, status, notes, services(name), profiles!tourist_id(full_name)', {
      count: 'exact',
    })
    .eq('business_id', business.id)

  if (statusFilter !== 'all') query = query.eq('status', statusFilter)

  const { data, count } = await query.order('created_at', { ascending: false }).range(from, to)

  const bookings = (data ?? []) as unknown as BookingRow[]
  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/mi-negocio/${id}`}
          className={cn(
            'inline-flex items-center gap-1.5 mb-5',
            'text-sm font-medium text-primary min-h-11 py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {business.name}
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-5">{copy.title}</h1>

        {/* Status filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted mb-5 overflow-x-auto">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/mi-negocio/${id}/reservas?status=${s}`}
              className={cn(
                'flex-1 text-center text-sm font-medium py-1.5 px-2 rounded-lg transition-colors whitespace-nowrap',
                statusFilter === s
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'all' ? copy.all : copy.status[s]}
            </Link>
          ))}
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => {
              const statusColor = copy.statusColors[booking.status] ?? copy.statusColors.pending_payment
              const statusLabel = copy.status[booking.status] ?? booking.status

              return (
                <div key={booking.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-sm text-foreground leading-snug line-clamp-1">
                      {booking.services?.name ?? '—'}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        statusColor,
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {copy.tourist}: <span className="font-medium text-foreground">{booking.profiles?.full_name ?? '—'}</span>
                  </p>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" aria-hidden="true" />
                      {formatDate(booking.booking_date)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden="true" />
                      {booking.quantity}&nbsp;{copy.quantity}
                    </span>
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <Banknote className="size-3.5" aria-hidden="true" />
                      ${Number(booking.total_amount).toLocaleString('es-CO')} COP
                    </span>
                  </div>

                  {booking.notes && (
                    <div className="rounded-lg bg-muted px-2.5 py-1.5 space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">{copy.notesLabel}</p>
                      <p className="text-xs text-foreground leading-relaxed">{booking.notes}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <PaginationNav
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          baseParams={{ status: statusFilter }}
          basePath={`/mi-negocio/${id}/reservas`}
        />
      </div>
    </main>
  )
}
