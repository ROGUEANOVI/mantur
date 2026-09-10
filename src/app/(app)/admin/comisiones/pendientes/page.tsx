import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import MarkCommissionCollectedForm from '@/components/admin/MarkCommissionCollectedForm'

const copy = adminCopy.comisiones.pending

type CommissionRow = {
  id: string
  booking_id: string | null
  transport_request_id: string | null
  recipient_type: 'business' | 'guide' | 'transporter'
  recipient_id: string
  commission_rate: number
  commission_amount_cents: number
  created_at: string
}

type Group = {
  recipientType: CommissionRow['recipient_type']
  recipientName: string
  subtotalCents: number
  rows: (CommissionRow & { itemLabel: string; dateLabel: string })[]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AdminComisionesPendientesPage() {
  const admin = createAdminClient()

  const { data: commissionsData } = await admin
    .from('provider_commissions')
    .select('id, booking_id, transport_request_id, recipient_type, recipient_id, commission_rate, commission_amount_cents, created_at')
    .eq('status', 'pending')
    .order('recipient_type', { ascending: true })
    .order('created_at', { ascending: true })

  const commissions = (commissionsData ?? []) as CommissionRow[]

  const businessIds = [...new Set(commissions.filter((c) => c.recipient_type === 'business').map((c) => c.recipient_id))]
  const guideIds = [...new Set(commissions.filter((c) => c.recipient_type === 'guide').map((c) => c.recipient_id))]
  const transporterIds = [...new Set(commissions.filter((c) => c.recipient_type === 'transporter').map((c) => c.recipient_id))]
  const bookingIds = [...new Set(commissions.map((c) => c.booking_id).filter((id): id is string => id != null))]
  const tripIds = [...new Set(commissions.map((c) => c.transport_request_id).filter((id): id is string => id != null))]

  const [{ data: businesses }, { data: guides }, { data: transporters }, { data: bookings }, { data: trips }] =
    await Promise.all([
      businessIds.length
        ? admin.from('businesses').select('id, name').in('id', businessIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      guideIds.length
        ? admin.from('tourist_guides').select('id, profiles!profile_id(full_name)').in('id', guideIds)
        : Promise.resolve({ data: [] as { id: string; profiles: { full_name: string | null } | null }[] }),
      transporterIds.length
        ? admin.from('transporters').select('id, profiles!profile_id(full_name)').in('id', transporterIds)
        : Promise.resolve({ data: [] as { id: string; profiles: { full_name: string | null } | null }[] }),
      bookingIds.length
        ? admin
            .from('bookings')
            .select('id, booking_date, services(name), guide_tours(name)')
            .in('id', bookingIds)
        : Promise.resolve({
            data: [] as { id: string; booking_date: string; services: { name: string } | null; guide_tours: { name: string } | null }[],
          }),
      tripIds.length
        ? admin.from('transport_requests').select('id, origin, destination, requested_datetime').in('id', tripIds)
        : Promise.resolve({ data: [] as { id: string; origin: string; destination: string; requested_datetime: string }[] }),
    ])

  const guideRows = (guides ?? []) as unknown as { id: string; profiles: { full_name: string | null } | null }[]
  const transporterRows = (transporters ?? []) as unknown as { id: string; profiles: { full_name: string | null } | null }[]
  const bookingRows = (bookings ?? []) as unknown as {
    id: string
    booking_date: string
    services: { name: string } | null
    guide_tours: { name: string } | null
  }[]

  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]))
  const guideNameById = new Map(guideRows.map((g) => [g.id, g.profiles?.full_name ?? '—']))
  const transporterNameById = new Map(transporterRows.map((t) => [t.id, t.profiles?.full_name ?? '—']))
  const bookingById = new Map(bookingRows.map((b) => [b.id, b]))
  const tripById = new Map((trips ?? []).map((t) => [t.id, t]))

  function recipientName(row: CommissionRow): string {
    if (row.recipient_type === 'business') return businessNameById.get(row.recipient_id) ?? '—'
    if (row.recipient_type === 'guide') return guideNameById.get(row.recipient_id) ?? '—'
    return transporterNameById.get(row.recipient_id) ?? '—'
  }

  function itemAndDate(row: CommissionRow): { itemLabel: string; dateLabel: string } {
    if (row.booking_id) {
      const booking = bookingById.get(row.booking_id)
      return {
        itemLabel: booking?.services?.name ?? booking?.guide_tours?.name ?? '—',
        dateLabel: booking ? formatDate(booking.booking_date) : '—',
      }
    }
    if (row.transport_request_id) {
      const trip = tripById.get(row.transport_request_id)
      return {
        itemLabel: trip ? `${trip.origin} → ${trip.destination}` : '—',
        dateLabel: trip ? formatDate(trip.requested_datetime) : '—',
      }
    }
    return { itemLabel: '—', dateLabel: '—' }
  }

  const groups = new Map<string, Group>()
  for (const row of commissions) {
    const key = `${row.recipient_type}:${row.recipient_id}`
    const { itemLabel, dateLabel } = itemAndDate(row)
    const existing = groups.get(key)
    if (existing) {
      existing.subtotalCents += row.commission_amount_cents
      existing.rows.push({ ...row, itemLabel, dateLabel })
    } else {
      groups.set(key, {
        recipientType: row.recipient_type,
        recipientName: recipientName(row),
        subtotalCents: row.commission_amount_cents,
        rows: [{ ...row, itemLabel, dateLabel }],
      })
    }
  }

  const totalCents = commissions.reduce((sum, c) => sum + c.commission_amount_cents, 0)

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
          <div className="mt-2 flex items-center gap-4">
            <Link href="/admin/comisiones" className="text-sm text-primary hover:underline">
              {copy.backToRates}
            </Link>
            <Link href="/admin/comisiones/historial" className="text-sm text-primary hover:underline">
              {copy.viewHistory}
            </Link>
          </div>
        </div>

        {commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card shadow-sm p-5 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{copy.totalLabel}</span>
              <span className="text-lg font-semibold text-primary">
                ${(totalCents / 100).toLocaleString('es-CO')} COP
              </span>
            </div>

            <div className="space-y-4">
              {[...groups.values()].map((group) => (
                <div key={`${group.recipientType}:${group.recipientName}`} className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{group.recipientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {copy.recipientType[group.recipientType] ?? group.recipientType}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      ${(group.subtotalCents / 100).toLocaleString('es-CO')} COP
                    </span>
                  </div>

                  <hr className="border-border" />

                  <div className="space-y-4">
                    {group.rows.map((row) => (
                      <div key={row.id} className="space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{row.itemLabel}</p>
                            <p className="text-xs text-muted-foreground">
                              {copy.dateLabel}: {row.dateLabel} · {copy.rateLabel}: {Number(row.commission_rate)}%
                            </p>
                          </div>
                          <span className="text-sm font-medium text-foreground shrink-0">
                            ${(row.commission_amount_cents / 100).toLocaleString('es-CO')} COP
                          </span>
                        </div>
                        <MarkCommissionCollectedForm commissionId={row.id} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
