import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import { transportCopy } from '@/lib/copy/transport'
import { cn } from '@/lib/utils'

const copy = adminCopy.reservasList

type RowType = 'service' | 'guide_tour' | 'package' | 'transport'
const VALID_TYPES: RowType[] = ['service', 'guide_tour', 'package', 'transport']

type UnifiedRow = {
  id: string
  type: RowType
  touristName: string
  providerName: string
  itemLabel: string
  dateLabel: string
  amountLabel: string
  status: string
  statusLabel: string
  statusColor: string
  createdAt: string
  commissionSourceId: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCOP(amount: number): string {
  return `$${amount.toLocaleString('es-CO')} COP`
}

type BookingRow = {
  id: string
  quantity: number
  total_amount: number
  booking_date: string
  status: string
  created_at: string
  tourist_id: string
  service_id: string | null
  guide_tour_id: string | null
  package_id: string | null
  profiles: { full_name: string | null } | null
  services: { name: string; businesses: { name: string } | null } | null
  guide_tours: { name: string; tourist_guides: { profiles: { full_name: string | null } | null } | null } | null
  packages: { name: string } | null
}

type TransportRow = {
  id: string
  origin: string
  destination: string
  requested_datetime: string
  people_count: number
  price_cents: number | null
  status: string
  created_at: string
  tourist_id: string
  transporter_id: string | null
  profiles: { full_name: string | null } | null
  transporters: { profiles: { full_name: string | null } | null } | null
}

export default async function AdminReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const { tipo: rawTipo } = await searchParams
  const typeFilter: 'todos' | RowType = rawTipo && VALID_TYPES.includes(rawTipo as RowType) ? (rawTipo as RowType) : 'todos'

  const admin = createAdminClient()

  const [{ data: bookingsData }, { data: transportData }] = await Promise.all([
    admin
      .from('bookings')
      .select(
        'id, quantity, total_amount, booking_date, status, created_at, tourist_id, service_id, guide_tour_id, package_id, ' +
          'profiles!tourist_id(full_name), services(name, businesses(name)), ' +
          'guide_tours(name, tourist_guides(profiles!profile_id(full_name))), packages(name)',
      )
      .order('created_at', { ascending: false }),
    admin
      .from('transport_requests')
      .select(
        'id, origin, destination, requested_datetime, people_count, price_cents, status, created_at, tourist_id, transporter_id, ' +
          'profiles!tourist_id(full_name), transporters!transporter_id(profiles!profile_id(full_name))',
      )
      .order('created_at', { ascending: false }),
  ])

  const bookings = (bookingsData ?? []) as unknown as BookingRow[]
  const transports = (transportData ?? []) as unknown as TransportRow[]

  const bookingIds = bookings.map((b) => b.id)
  const transportIds = transports.map((t) => t.id)

  const [{ data: bookingCommissions }, { data: transportCommissions }] = await Promise.all([
    bookingIds.length
      ? admin.from('provider_commissions').select('booking_id, status').in('booking_id', bookingIds)
      : Promise.resolve({ data: [] as { booking_id: string | null; status: string }[] }),
    transportIds.length
      ? admin.from('provider_commissions').select('transport_request_id, status').in('transport_request_id', transportIds)
      : Promise.resolve({ data: [] as { transport_request_id: string | null; status: string }[] }),
  ])

  const commissionByBookingId = new Map((bookingCommissions ?? []).map((c) => [c.booking_id, c.status]))
  const commissionByTransportId = new Map((transportCommissions ?? []).map((c) => [c.transport_request_id, c.status]))

  const bookingRows: UnifiedRow[] = bookings.map((b) => {
    const type: RowType = b.package_id ? 'package' : b.guide_tour_id ? 'guide_tour' : 'service'
    const providerName =
      type === 'package'
        ? 'ManTur'
        : type === 'guide_tour'
          ? (b.guide_tours?.tourist_guides?.profiles?.full_name ?? '—')
          : (b.services?.businesses?.name ?? '—')
    const itemLabel = b.services?.name ?? b.guide_tours?.name ?? b.packages?.name ?? '—'
    const statusLabel = bookingsCopy.list.status[b.status] ?? b.status
    const statusColor = bookingsCopy.list.statusColors[b.status] ?? bookingsCopy.list.statusColors.pending_payment

    return {
      id: b.id,
      type,
      touristName: b.profiles?.full_name ?? '—',
      providerName,
      itemLabel,
      dateLabel: formatDate(b.booking_date),
      amountLabel: formatCOP(Number(b.total_amount)),
      status: b.status,
      statusLabel,
      statusColor,
      createdAt: b.created_at,
      commissionSourceId: b.id,
    }
  })

  const transportRows: UnifiedRow[] = transports.map((t) => {
    const statusLabel = transportCopy.adminPage.status[t.status] ?? t.status
    const statusColor = transportCopy.adminPage.statusColors[t.status] ?? transportCopy.adminPage.statusColors.pending

    return {
      id: t.id,
      type: 'transport',
      touristName: t.profiles?.full_name ?? '—',
      providerName: t.transporters?.profiles?.full_name ?? '—',
      itemLabel: `${t.origin} → ${t.destination}`,
      dateLabel: formatDate(t.requested_datetime),
      amountLabel: t.price_cents != null ? formatCOP(t.price_cents / 100) : '—',
      status: t.status,
      statusLabel,
      statusColor,
      createdAt: t.created_at,
      commissionSourceId: t.id,
    }
  })

  const allRows = [...bookingRows, ...transportRows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const rows = typeFilter === 'todos' ? allRows : allRows.filter((r) => r.type === typeFilter)

  function commissionStatusFor(row: UnifiedRow): string {
    const status =
      row.type === 'transport' ? commissionByTransportId.get(row.commissionSourceId) : commissionByBookingId.get(row.commissionSourceId)
    return copy.commissionStatus[status ?? 'none']
  }

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          <Link
            href="/admin/reservas/nueva"
            className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-10 px-4 hover:bg-primary/90 transition-colors shrink-0"
          >
            {copy.newButton}
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['todos', ...VALID_TYPES] as const).map((t) => (
            <Link
              key={t}
              href={t === 'todos' ? '/admin/reservas' : `/admin/reservas?tipo=${t}`}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'todos' ? copy.type.all : copy.type[t]}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <div className="rounded-2xl border border-border bg-card shadow-sm divide-y divide-border overflow-x-auto">
            {rows.map((row) => (
              <div key={`${row.type}:${row.id}`} className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.itemLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {copy.type[row.type]} · {row.providerName}
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0', row.statusColor)}>
                    {row.statusLabel}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {copy.touristLabel}: {row.touristName} · {copy.dateLabel}: {row.dateLabel}
                  </span>
                  <span className="flex items-center gap-3">
                    <span>
                      {copy.commissionLabel}: {commissionStatusFor(row)}
                    </span>
                    <span className="font-medium text-foreground">{row.amountLabel}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
