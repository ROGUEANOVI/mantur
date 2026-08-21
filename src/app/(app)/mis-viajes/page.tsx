import Link from 'next/link'
import { Car, MapPin, Calendar, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import { cancelTransportRequest } from '@/app/(app)/transporte/actions'
import { cn } from '@/lib/utils'

type TransportRequest = {
  id: string
  origin: string
  destination: string
  requested_datetime: string
  people_count: number
  status: string
  created_at: string
  transporters: {
    license_plate: string
    vehicle_type: string
    phone: string
    profiles: { full_name: string | null } | null
  } | null
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function MisViajesPage() {
  const supabase = await createClient()

  // Explicit filter ensures we only fetch this user's requests even when accessed by other roles.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('transport_requests')
    .select(
      'id, origin, destination, requested_datetime, people_count, status, created_at, transporters(license_plate, vehicle_type, phone, profiles!profile_id(full_name))',
    )
    .eq('tourist_id', user!.id)
    .order('created_at', { ascending: false })

  const items = (data ?? []) as unknown as TransportRequest[]
  const copy = transportCopy.myTrips

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{copy.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.pageSubtitle}</p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 flex flex-col items-center text-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <Car className="size-7 text-primary" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">{copy.empty}</p>
            <Link
              href="/transportistas"
              className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 px-6 hover:bg-primary/90 transition-colors"
            >
              {copy.explore}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((req) => {
              const statusColor =
                copy.statusColors[req.status] ?? copy.statusColors.pending
              const statusLabel = copy.status[req.status] ?? req.status

              return (
                <div
                  key={req.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-4"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <span className="truncate">{req.origin}</span>
                        <MapPin className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="truncate">{req.destination}</span>
                      </div>
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

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" aria-hidden="true" />
                      {formatDatetime(req.requested_datetime)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden="true" />
                      {req.people_count}&nbsp;{copy.people}
                    </span>
                  </div>

                  {/* Transporter info when accepted */}
                  {req.status === 'accepted' && req.transporters && (
                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 mb-3 text-xs space-y-1">
                      <p className="font-medium text-foreground">
                        {copy.transporter}:{' '}
                        {req.transporters.profiles?.full_name ?? '—'}
                      </p>
                      <p className="text-muted-foreground">
                        {copy.phone}: {req.transporters.phone}
                      </p>
                      <p className="text-muted-foreground">
                        {copy.vehicle}:{' '}
                        {req.transporters.vehicle_type} · {req.transporters.license_plate}
                      </p>
                    </div>
                  )}

                  {/* Cancel action for pending requests */}
                  {req.status === 'pending' && (
                    <form action={cancelTransportRequest}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <button
                        type="submit"
                        className="text-xs text-destructive hover:text-destructive/80 font-medium transition-colors"
                      >
                        {copy.cancel}
                      </button>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
