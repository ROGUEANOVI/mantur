import Link from 'next/link'
import {
  Building2,
  CalendarDays,
  Percent,
  TreePine,
  Users,
  TrendingUp,
  Wallet,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
  Compass,
  IdCard,
  Undo2,
  UserPlus,
  ShieldAlert,
  Banknote,
  Receipt,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { approveBusiness, rejectBusiness } from '@/app/(app)/admin/actions'
import { getSidebarPendingCounts, STUCK_PAYOUT_HOURS } from './pendingCounts'
import StatCard from '@/components/admin/StatCard'
import AttentionQueue, { type PendingQueueItem } from '@/components/admin/AttentionQueue'
import { cn } from '@/lib/utils'

type PendingBusiness = {
  id: string
  name: string
  type: string
  created_at: string
  profiles: { full_name: string | null } | null
}

type RecentBooking = {
  id: string
  total_amount: number
  status: string
  booking_date: string
  created_at: string
  services: { name: string } | null
  profiles: { full_name: string | null } | null
}

type ProfileRoleRow = { role: string } | null

type VerificationRow = {
  verification_status: string
  profiles: ProfileRoleRow
}

type PayoutRow = { status: string; created_at: string }

const REVENUE_TREND_DAYS = 14

const BOOKING_STATUS_ORDER = ['pending_payment', 'confirmed', 'completed', 'cancelled'] as const

const BOOKING_STATUS_ICON: Record<string, React.ElementType> = {
  confirmed: CheckCircle2,
  pending_payment: Clock,
  completed: CheckCircle2,
  cancelled: Ban,
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCOP(cents: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

// Buckets paid transactions from the last REVENUE_TREND_DAYS into one
// cents-sum per day (oldest first) for the dashboard's revenue sparkline.
function buildRevenueTrend(rows: { amount_in_cents: number; created_at: string }[]): number[] {
  const buckets = new Array(REVENUE_TREND_DAYS).fill(0)
  const now = new Date()
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  for (const row of rows) {
    const created = new Date(row.created_at)
    const createdDay = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate())
    const diffDays = Math.round((startOfToday - createdDay) / 86_400_000)
    const idx = REVENUE_TREND_DAYS - 1 - diffDays
    if (idx >= 0 && idx < REVENUE_TREND_DAYS) buckets[idx] += Number(row.amount_in_cents)
  }

  return buckets
}

export default async function AdminPage() {
  const admin = createAdminClient()
  const trendCutoff = new Date(Date.now() - REVENUE_TREND_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const stuckPayoutCutoff = new Date(Date.now() - STUCK_PAYOUT_HOURS * 60 * 60 * 1000).toISOString()

  const [
    counts,
    { count: activeCount },
    { count: lugaresCount },
    { count: usersCount },
    { data: commissions },
    { data: paidTransactions },
    { data: pendingBusinesses },
    { data: recentBookings },
    { count: pendingPaymentCount },
    { count: confirmedCount },
    { count: cancelledCount },
    { count: completedCount },
    { data: payoutRows },
    { count: pendingInvoicesCount },
    { count: failedPaymentsCount },
    { count: pendingRntCount },
    { data: guideRows },
    { data: transporterRows },
    { data: revenueTrendRows },
  ] = await Promise.all([
    getSidebarPendingCounts(),
    admin.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('places').select('id', { count: 'exact', head: true }),
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('commission_config').select('service_type, rate'),
    admin.from('transactions').select('amount_in_cents, commission_amount_cents, wompi_fee_cents').eq('status', 'paid'),
    admin
      .from('businesses')
      .select('id, name, type, created_at, profiles!owner_id(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(3),
    admin
      .from('bookings')
      .select('id, total_amount, status, booking_date, created_at, services(name), profiles!tourist_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(5),
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending_payment'),
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
    admin.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    admin.from('provider_payouts').select('status, created_at').in('status', ['failed', 'pending']),
    admin.from('transactions').select('id', { count: 'exact', head: true }).eq('alegra_invoice_status', 'pending'),
    admin.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('rnt_status', 'pending_review'),
    admin.from('tourist_guides').select('verification_status, profiles!profile_id!inner(role)'),
    admin.from('transporters').select('verification_status, profiles!profile_id!inner(role)'),
    admin.from('transactions').select('amount_in_cents, created_at').eq('status', 'paid').gte('created_at', trendCutoff),
  ])

  const tourActivityRate = commissions?.find((c) => c.service_type === 'tour_activity')?.rate ?? '—'
  const totalRevenueCents = (paidTransactions ?? []).reduce(
    (sum, t) => sum + Number(t.amount_in_cents),
    0,
  )
  // wompi_fee_cents is only populated for transactions confirmed after
  // 20260831210000 shipped — older paid rows treat it as 0 (no fee estimate
  // available), which understates their true cost slightly but never
  // fabricates a number for a transaction this feature never ran against.
  const netMarginCents = (paidTransactions ?? []).reduce(
    (sum, t) => sum + Number(t.commission_amount_cents) - Number(t.wompi_fee_cents ?? 0),
    0,
  )

  const bookingStatusCounts: Record<string, number> = {
    pending_payment: pendingPaymentCount ?? 0,
    confirmed: confirmedCount ?? 0,
    completed: completedCount ?? 0,
    cancelled: cancelledCount ?? 0,
  }
  const totalBookingsCount = Object.values(bookingStatusCounts).reduce((a, b) => a + b, 0)

  const stuckPayoutsCount = ((payoutRows ?? []) as PayoutRow[]).filter(
    (p) => p.status === 'failed' || (p.status === 'pending' && p.created_at < stuckPayoutCutoff),
  ).length

  const guides = ((guideRows ?? []) as unknown as VerificationRow[])
  const activeGuidesCount = guides.filter((g) => g.profiles?.role === 'tourist_guide').length
  const pendingGuideVerificationCount = guides.filter((g) => g.verification_status === 'pending_review').length

  const transporters = ((transporterRows ?? []) as unknown as VerificationRow[])
  const activeTransportersCount = transporters.filter((t) => t.profiles?.role === 'transporter').length
  const pendingTransporterVerificationCount = transporters.filter((t) => t.verification_status === 'pending_review').length

  const revenueTrend = buildRevenueTrend(revenueTrendRows ?? [])

  const pendingList = (pendingBusinesses ?? []) as unknown as PendingBusiness[]
  const bookingList = (recentBookings ?? []) as unknown as RecentBooking[]

  const attentionCopy = adminCopy.dashboard.attention
  const allAttentionItems: PendingQueueItem[] = [
    {
      key: 'stuckPayouts',
      label: attentionCopy.items.stuckPayouts,
      count: stuckPayoutsCount,
      icon: Banknote,
      tone: 'critical',
      hint: attentionCopy.stuckPayoutsHint,
      href: '/admin/pagos-proveedores',
    },
    {
      key: 'pendingRefunds',
      label: attentionCopy.items.pendingRefunds,
      count: counts.reembolsos,
      icon: Undo2,
      tone: 'critical',
      // Land on whichever status actually has something to review — a
      // hardcoded '?status=pending' would show an empty list whenever every
      // unresolved refund happens to be 'processing' (e.g. a same-day void
      // awaiting Wompi's webhook confirmation).
      href: counts.reembolsosPending > 0 ? '/admin/reembolsos?status=pending' : '/admin/reembolsos?status=processing',
    },
    {
      key: 'pendingBusinesses',
      label: attentionCopy.items.pendingBusinesses,
      count: counts.negocios,
      icon: Building2,
      tone: 'warning',
      href: '/admin/negocios?status=pending',
    },
    {
      key: 'pendingRoleRequests',
      label: attentionCopy.items.pendingRoleRequests,
      count: counts.solicitudes,
      icon: UserPlus,
      tone: 'warning',
      href: '/admin/solicitudes',
    },
    {
      key: 'pendingRnt',
      label: attentionCopy.items.pendingRnt,
      count: pendingRntCount ?? 0,
      icon: ShieldAlert,
      tone: 'warning',
      href: '/admin/negocios?status=active',
    },
    {
      key: 'pendingGuideVerification',
      label: attentionCopy.items.pendingGuideVerification,
      count: pendingGuideVerificationCount,
      icon: Compass,
      tone: 'default',
      href: '/admin/guias',
    },
    {
      key: 'pendingTransporterVerification',
      label: attentionCopy.items.pendingTransporterVerification,
      count: pendingTransporterVerificationCount,
      icon: IdCard,
      tone: 'default',
      href: '/admin/transportistas',
    },
  ]
  const attentionItems = allAttentionItems.filter((item) => item.count > 0)

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{adminCopy.dashboard.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{adminCopy.dashboard.subtitle}</p>
        </div>

        {/* Attention queue */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{attentionCopy.title}</h2>
          <AttentionQueue items={attentionItems} />
        </section>

        {/* Financial health */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{adminCopy.dashboard.sections.financialHealth}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              icon={TrendingUp}
              iconColor="text-primary"
              label={adminCopy.dashboard.stats.totalRevenue}
              value={formatCOP(totalRevenueCents)}
              valueSmall
              trend={revenueTrend}
              trendLabel={adminCopy.dashboard.revenueTrendLabel}
            />
            <StatCard
              icon={Wallet}
              iconColor="text-primary"
              label={adminCopy.dashboard.stats.netMargin}
              value={formatCOP(netMarginCents)}
              valueSmall
            />
            <StatCard
              icon={XCircle}
              iconColor="text-destructive"
              label={adminCopy.dashboard.stats.failedPayments}
              value={failedPaymentsCount ?? 0}
              valueColor={failedPaymentsCount ? 'text-destructive' : undefined}
            />
            <StatCard
              icon={Receipt}
              iconColor="text-accent"
              label={adminCopy.dashboard.stats.pendingInvoices}
              value={pendingInvoicesCount ?? 0}
            />
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card shadow-sm px-4 py-3">
            <Percent className="size-4 text-primary shrink-0" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{adminCopy.dashboard.stats.commissionRate}</p>
            <span className="ml-auto text-lg font-bold text-foreground">{tourActivityRate}%</span>
            <Link href="/admin/comisiones" className="text-xs text-primary font-medium hover:underline">
              Editar
            </Link>
          </div>
        </section>

        {/* Growth & supply */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{adminCopy.dashboard.sections.growth}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              icon={Building2}
              iconColor="text-primary"
              label={adminCopy.dashboard.stats.activeBusinesses}
              value={activeCount ?? 0}
              href="/admin/negocios?status=active"
            />
            <StatCard
              icon={Users}
              iconColor="text-primary"
              label={adminCopy.dashboard.stats.registeredUsers}
              value={usersCount ?? 0}
            />
            <StatCard
              icon={TreePine}
              iconColor="text-primary"
              label={adminCopy.dashboard.stats.totalLugares}
              value={lugaresCount ?? 0}
              href="/admin/lugares"
            />
            <StatCard
              icon={Compass}
              iconColor="text-primary"
              label={adminCopy.dashboard.stats.activeGuides}
              value={activeGuidesCount}
              href="/admin/guias"
            />
            <StatCard
              icon={IdCard}
              iconColor="text-primary"
              label={adminCopy.dashboard.stats.activeTransporters}
              value={activeTransportersCount}
              href="/admin/transportistas"
            />
          </div>
        </section>

        {/* Bookings by status */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{adminCopy.dashboard.sections.bookingsByStatus}</h2>
          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {BOOKING_STATUS_ORDER.map((status) => {
                const count = bookingStatusCounts[status]
                const pct = totalBookingsCount > 0 ? Math.round((count / totalBookingsCount) * 100) : 0
                const StatusIcon = BOOKING_STATUS_ICON[status]
                return (
                  <div key={status} className="text-center">
                    <StatusIcon
                      className={cn('size-4 mx-auto mb-1', adminCopy.dashboard.bookingStatus.colors[status])}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <p className={cn('text-2xl font-bold tabular-nums', adminCopy.dashboard.bookingStatus.colors[status])}>
                      {count}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {adminCopy.dashboard.bookingStatus.labels[status]}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">{pct}%</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Two-column section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Pending businesses */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{adminCopy.dashboard.sections.pendingApprovals}</h2>
              <Link href="/admin/negocios?status=pending" className="text-xs text-primary hover:underline">
                {adminCopy.dashboard.sections.viewAll}
              </Link>
            </div>
            {pendingList.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card shadow-sm p-6 text-center">
                <CheckCircle2 className="size-8 text-primary/30 mx-auto mb-2" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{adminCopy.dashboard.sections.pendingApprovalsEmpty}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingList.map((biz) => (
                  <div key={biz.id} className="rounded-2xl border border-border bg-card shadow-sm p-3 space-y-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="size-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-1">{biz.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {biz.profiles?.full_name ?? '—'} · {formatDate(biz.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <form action={approveBusiness} className="flex-1">
                        <input type="hidden" name="businessId" value={biz.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-8.5 hover:bg-primary/90 transition-colors"
                        >
                          Aprobar
                        </button>
                      </form>
                      <form action={rejectBusiness} className="flex-1">
                        <input type="hidden" name="businessId" value={biz.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl border border-border bg-background text-foreground text-xs font-semibold min-h-8.5 hover:bg-muted transition-colors"
                        >
                          Rechazar
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent bookings */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{adminCopy.dashboard.sections.recentBookings}</h2>
            {bookingList.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card shadow-sm p-6 text-center">
                <CalendarDays className="size-8 text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{adminCopy.dashboard.sections.recentBookingsEmpty}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookingList.map((booking) => {
                  const label = adminCopy.dashboard.bookingStatus.labels[booking.status] ?? booking.status
                  const color = adminCopy.dashboard.bookingStatus.colors[booking.status] ?? 'text-muted-foreground'
                  const StatusIcon = BOOKING_STATUS_ICON[booking.status] ?? Clock
                  return (
                    <div key={booking.id} className="rounded-2xl border border-border bg-card shadow-sm p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground line-clamp-1">
                            {booking.services?.name ?? '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {booking.profiles?.full_name ?? '—'} · {formatDate(booking.booking_date)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-foreground tabular-nums">
                            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(booking.total_amount))}
                          </p>
                          <span className={cn('inline-flex items-center gap-1 text-xs', color)}>
                            <StatusIcon className="size-3" aria-hidden="true" />
                            {label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  )
}
