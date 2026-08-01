import Link from 'next/link'
import { MapPin, Calendar, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { transportCopy } from '@/lib/copy/transport'
import { cn } from '@/lib/utils'

const VALID_STATUSES = ['pending', 'accepted', 'completed', 'cancelled'] as const
type StatusFilter = (typeof VALID_STATUSES)[number]

type RequestRow = {
  id: string
  origin: string
  destination: string
  requested_datetime: string
  people_count: number
  status: string
  created_at: string
  tourist: { full_name: string | null } | null
  transporter_profile: { full_name: string | null } | null
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

export default async function AdminTransportesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: rawStatus } = await searchParams
  const statusFilter: StatusFilter =
    VALID_STATUSES.includes(rawStatus as StatusFilter)
      ? (rawStatus as StatusFilter)
      : 'pending'

  const admin = createAdminClient()
  const copy = transportCopy.adminPage

  const { data } = await admin
    .from('transport_requests')
    .select(
      'id, origin, destination, requested_datetime, people_count, status, created_at, tourist:profiles!tourist_id(full_name), transporter_profile:transporters!transporter_id(profiles!profile_id(full_name))',
    )
    .eq('status', statusFilter)
    .order('created_at', { ascending: true })

  const requests = (data ?? []) as unknown as RequestRow[]

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10 lg:ml-14">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{copy.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.pageSubtitle}</p>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/transportes?status=${s}`}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {copy.status[s]}
            </Link>
          ))}
        </div>

        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin solicitudes {copy.status[statusFilter].toLowerCase()}.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const statusColor = copy.statusColors[req.status] ?? copy.statusColors.pending
              const statusLabel = copy.status[req.status] ?? req.status

              return (
                <div key={req.id} className="rounded-2xl border border-border bg-card shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground min-w-0">
                      <span className="truncate">{req.origin}</span>
                      <MapPin className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="truncate">{req.destination}</span>
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

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" aria-hidden="true" />
                      {formatDatetime(req.requested_datetime)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden="true" />
                      {req.people_count}&nbsp;{copy.people}
                    </span>
                    <span>
                      {copy.tourist}: <span className="font-medium text-foreground">{req.tourist?.full_name ?? '—'}</span>
                    </span>
                    <span>
                      {copy.transporter}:{' '}
                      <span className="font-medium text-foreground">
                        {(req.transporter_profile as unknown as { profiles: { full_name: string | null } | null } | null)?.profiles?.full_name ?? copy.unassigned}
                      </span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
