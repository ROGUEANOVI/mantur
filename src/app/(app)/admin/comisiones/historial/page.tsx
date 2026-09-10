import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { cn } from '@/lib/utils'

const copy = adminCopy.comisiones.historial

type StatusFilter = 'all' | 'collected' | 'voided'
const VALID_STATUSES: StatusFilter[] = ['all', 'collected', 'voided']

type CommissionRow = {
  id: string
  recipient_type: 'business' | 'guide' | 'transporter'
  recipient_id: string
  commission_rate: number
  commission_amount_cents: number
  status: 'collected' | 'voided'
  collected_by: string | null
  admin_notes: string | null
  updated_at: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AdminComisionesHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: rawStatus } = await searchParams
  const statusFilter: StatusFilter = VALID_STATUSES.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : 'all'

  const admin = createAdminClient()

  let query = admin
    .from('provider_commissions')
    .select('id, recipient_type, recipient_id, commission_rate, commission_amount_cents, status, collected_by, admin_notes, updated_at')
    .in('status', ['collected', 'voided'])
    .order('updated_at', { ascending: false })

  if (statusFilter !== 'all') query = query.eq('status', statusFilter)

  const { data: commissionsData } = await query
  const commissions = (commissionsData ?? []) as CommissionRow[]

  const businessIds = [...new Set(commissions.filter((c) => c.recipient_type === 'business').map((c) => c.recipient_id))]
  const guideIds = [...new Set(commissions.filter((c) => c.recipient_type === 'guide').map((c) => c.recipient_id))]
  const transporterIds = [...new Set(commissions.filter((c) => c.recipient_type === 'transporter').map((c) => c.recipient_id))]
  const collectedByIds = [...new Set(commissions.map((c) => c.collected_by).filter((id): id is string => id != null))]

  const [{ data: businesses }, { data: guides }, { data: transporters }, { data: collectors }] = await Promise.all([
    businessIds.length
      ? admin.from('businesses').select('id, name').in('id', businessIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    guideIds.length
      ? admin.from('tourist_guides').select('id, profiles!profile_id(full_name)').in('id', guideIds)
      : Promise.resolve({ data: [] as { id: string; profiles: { full_name: string | null } | null }[] }),
    transporterIds.length
      ? admin.from('transporters').select('id, profiles!profile_id(full_name)').in('id', transporterIds)
      : Promise.resolve({ data: [] as { id: string; profiles: { full_name: string | null } | null }[] }),
    collectedByIds.length
      ? admin.from('profiles').select('id, full_name').in('id', collectedByIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  const guideRows = (guides ?? []) as unknown as { id: string; profiles: { full_name: string | null } | null }[]
  const transporterRows = (transporters ?? []) as unknown as { id: string; profiles: { full_name: string | null } | null }[]

  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]))
  const guideNameById = new Map(guideRows.map((g) => [g.id, g.profiles?.full_name ?? '—']))
  const transporterNameById = new Map(transporterRows.map((t) => [t.id, t.profiles?.full_name ?? '—']))
  const adminNameById = new Map((collectors ?? []).map((p) => [p.id, p.full_name ?? '—']))

  function recipientName(row: CommissionRow): string {
    if (row.recipient_type === 'business') return businessNameById.get(row.recipient_id) ?? '—'
    if (row.recipient_type === 'guide') return guideNameById.get(row.recipient_id) ?? '—'
    return transporterNameById.get(row.recipient_id) ?? '—'
  }

  const totalCollectedCents = commissions
    .filter((c) => c.status === 'collected')
    .reduce((sum, c) => sum + c.commission_amount_cents, 0)

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
            <Link href="/admin/comisiones/pendientes" className="text-sm text-primary hover:underline">
              {copy.viewPending}
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{copy.totalCollectedLabel}</span>
          <span className="text-lg font-semibold text-primary">
            ${(totalCollectedCents / 100).toLocaleString('es-CO')} COP
          </span>
        </div>

        <div className="flex gap-2">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/comisiones/historial?status=${s}`}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {copy.filter[s]}
            </Link>
          ))}
        </div>

        {commissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <div className="rounded-2xl border border-border bg-card shadow-sm divide-y divide-border">
            {commissions.map((row) => (
              <div key={row.id} className="p-5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{recipientName(row)}</p>
                    <p className="text-xs text-muted-foreground">
                      {copy.recipientType[row.recipient_type] ?? row.recipient_type}
                    </p>
                  </div>
                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', copy.statusColors[row.status])}>
                    {copy.statusLabel[row.status]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {copy.dateLabel}: {formatDate(row.updated_at)} · {copy.rateLabel}: {Number(row.commission_rate)}%
                  </span>
                  <span className="font-medium text-foreground">
                    ${(row.commission_amount_cents / 100).toLocaleString('es-CO')} COP
                  </span>
                </div>
                {row.status === 'collected' && row.collected_by && (
                  <p className="text-xs text-muted-foreground">
                    {copy.collectedByLabel}: {adminNameById.get(row.collected_by) ?? '—'}
                  </p>
                )}
                {row.admin_notes && (
                  <p className="text-xs text-muted-foreground italic">
                    {copy.notesLabel}: {row.admin_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
