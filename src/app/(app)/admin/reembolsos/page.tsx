import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { cn } from '@/lib/utils'
import RefundPolicyForm from '@/components/admin/RefundPolicyForm'
import RejectRefundForm from './RejectRefundForm'
import { markRefundProcessedManually } from './actions'

type PolicyRow = {
  id: string
  min_hours_before_booking: number
  refund_percentage: number
}

type RefundRequestRow = {
  id: string
  refund_percentage: number
  refund_amount_cents: number
  reason: string | null
  status: string
  refund_method: string | null
  admin_notes: string | null
  created_at: string
  profiles: { full_name: string | null } | null
  bookings: {
    booking_date: string
    services: { name: string } | null
    guide_tours: { name: string } | null
  } | null
}

const VALID_STATUSES = ['pending', 'processing', 'processed', 'rejected'] as const
type StatusFilter = (typeof VALID_STATUSES)[number]

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AdminReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: rawStatus } = await searchParams
  const statusFilter: StatusFilter =
    VALID_STATUSES.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : 'pending'

  const admin = createAdminClient()
  const copy = adminCopy.reembolsos

  const { data: policyRows } = await admin
    .from('refund_policy_config')
    .select('id, min_hours_before_booking, refund_percentage')
    .order('min_hours_before_booking', { ascending: false })

  const policies = (policyRows ?? []) as PolicyRow[]

  const { data: requests } = await admin
    .from('refund_requests')
    .select(
      'id, refund_percentage, refund_amount_cents, reason, status, refund_method, admin_notes, created_at, profiles!requested_by(full_name), bookings!booking_id(booking_date, services(name), guide_tours(name))',
    )
    .eq('status', statusFilter)
    .order('created_at', { ascending: true })

  const items = (requests ?? []) as unknown as RefundRequestRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {/* Editable refund-window policy */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">{copy.policyTitle}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.policySubtitle}</p>
          </div>
          {policies.map((row) => (
            <RefundPolicyForm
              key={row.id}
              configId={row.id}
              minHoursBeforeBooking={row.min_hours_before_booking}
              currentRate={Number(row.refund_percentage)}
            />
          ))}
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/reembolsos?status=${s}`}
              className={cn(
                'flex-1 text-center text-sm font-medium py-1.5 rounded-lg transition-colors',
                statusFilter === s
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {copy.filter[s]}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((req) => {
              const serviceName = req.bookings?.guide_tours?.name ?? req.bookings?.services?.name ?? '—'

              return (
                <div key={req.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm line-clamp-1">{serviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {copy.requestedBy}: {req.profiles?.full_name ?? '—'} · {formatDate(req.created_at)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-primary shrink-0">
                      {req.refund_percentage}%
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    {req.bookings?.booking_date && (
                      <p>
                        <span className="font-medium text-foreground">{copy.booking}: </span>
                        {formatDate(req.bookings.booking_date)}
                      </p>
                    )}
                    <p>
                      <span className="font-medium text-foreground">{copy.amount}: </span>
                      ${Math.round(req.refund_amount_cents / 100).toLocaleString('es-CO')} COP
                    </p>
                    {req.reason && (
                      <p>
                        <span className="font-medium text-foreground">{copy.reason}: </span>
                        {req.reason}
                      </p>
                    )}
                    {req.refund_method && (
                      <p>{copy.method[req.refund_method] ?? req.refund_method}</p>
                    )}
                    {statusFilter === 'rejected' && req.admin_notes && (
                      <p className="text-destructive">
                        <span className="font-medium">{req.admin_notes}</span>
                      </p>
                    )}
                  </div>

                  {statusFilter === 'processing' && (
                    <p className="text-xs text-muted-foreground">{copy.processingHint}</p>
                  )}

                  {(statusFilter === 'pending' || statusFilter === 'processing') && (
                    <div className="flex gap-2 pt-1">
                      <form action={markRefundProcessedManually} className="flex-1">
                        <input type="hidden" name="refundRequestId" value={req.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-8.5 hover:bg-primary/90 transition-colors"
                        >
                          {copy.markProcessed}
                        </button>
                      </form>
                      <div className="flex-1">
                        <RejectRefundForm refundRequestId={req.id} />
                      </div>
                    </div>
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
