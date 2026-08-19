import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Percent,
  TreePine,
  ChevronRight,
  Users,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { approveBusiness, rejectBusiness } from '@/app/(app)/admin/actions'
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

const BOOKING_STATUS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  confirmed:       { label: 'Confirmada',  icon: CheckCircle2, color: 'text-primary' },
  pending_payment: { label: 'En pago',     icon: Clock,        color: 'text-amber-500' },
  completed:       { label: 'Completada',  icon: CheckCircle2, color: 'text-muted-foreground' },
  cancelled:       { label: 'Cancelada',   icon: Ban,          color: 'text-destructive' },
}

export default async function AdminPage() {
  const admin = createAdminClient()

  const [
    { count: pendingCount },
    { count: activeCount },
    { count: bookingsCount },
    { count: lugaresCount },
    { count: usersCount },
    { data: commissions },
    { data: paidTransactions },
    { data: pendingBusinesses },
    { data: recentBookings },
  ] = await Promise.all([
    admin.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('bookings').select('id', { count: 'exact', head: true }),
    admin.from('places').select('id', { count: 'exact', head: true }),
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('commission_config').select('service_type, rate'),
    admin.from('transactions').select('amount_in_cents').eq('status', 'paid'),
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
  ])

  const tourActivityRate = commissions?.find((c) => c.service_type === 'tour_activity')?.rate ?? '—'
  const totalRevenueCents = (paidTransactions ?? []).reduce(
    (sum, t) => sum + Number(t.amount_in_cents),
    0,
  )

  const pendingList = (pendingBusinesses ?? []) as unknown as PendingBusiness[]
  const bookingList = (recentBookings ?? []) as unknown as RecentBooking[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{adminCopy.dashboard.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Resumen de actividad de la plataforma</p>
        </div>

        {/* Pending alert */}
        {!!pendingCount && pendingCount > 0 && (
          <Link
            href="/admin/negocios?status=pending"
            className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-4 hover:shadow-md transition-shadow"
          >
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {pendingCount} {adminCopy.dashboard.pendingAlert}
            </p>
            <ChevronRight className="size-4 text-amber-500 ml-auto shrink-0" aria-hidden="true" />
          </Link>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            icon={Building2}
            iconColor="text-accent"
            label={adminCopy.dashboard.stats.pendingBusinesses}
            value={pendingCount ?? 0}
            valueColor={pendingCount ? 'text-amber-600 dark:text-amber-400' : undefined}
            href="/admin/negocios?status=pending"
          />
          <StatCard
            icon={Building2}
            iconColor="text-primary"
            label={adminCopy.dashboard.stats.activeBusinesses}
            value={activeCount ?? 0}
            href="/admin/negocios?status=active"
          />
          <StatCard
            icon={CalendarDays}
            iconColor="text-primary"
            label={adminCopy.dashboard.stats.totalBookings}
            value={bookingsCount ?? 0}
          />
          <StatCard
            icon={TrendingUp}
            iconColor="text-primary"
            label="Ingresos confirmados"
            value={formatCOP(totalRevenueCents)}
            valueSmall
          />
          <StatCard
            icon={TreePine}
            iconColor="text-primary"
            label={adminCopy.dashboard.stats.totalLugares}
            value={lugaresCount ?? 0}
            href="/admin/lugares"
          />
          <StatCard
            icon={Users}
            iconColor="text-primary"
            label="Usuarios registrados"
            value={usersCount ?? 0}
          />
        </div>

        {/* Comisión vigente — standalone pill */}
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card shadow-sm px-4 py-3">
          <Percent className="size-4 text-primary shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{adminCopy.dashboard.stats.commissionRate}</p>
          <span className="ml-auto text-lg font-bold text-foreground">{tourActivityRate}%</span>
          <Link
            href="/admin/comisiones"
            className="text-xs text-primary font-medium hover:underline"
          >
            Editar
          </Link>
        </div>

        {/* Two-column section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Pending businesses */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">En espera de aprobación</h2>
              <Link href="/admin/negocios?status=pending" className="text-xs text-primary hover:underline">
                Ver todos
              </Link>
            </div>
            {pendingList.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card shadow-sm p-6 text-center">
                <CheckCircle2 className="size-8 text-primary/30 mx-auto mb-2" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Sin negocios pendientes</p>
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
                          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-[34px] hover:bg-primary/90 transition-colors"
                        >
                          Aprobar
                        </button>
                      </form>
                      <form action={rejectBusiness} className="flex-1">
                        <input type="hidden" name="businessId" value={biz.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl border border-border bg-background text-foreground text-xs font-semibold min-h-[34px] hover:bg-muted transition-colors"
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
            <h2 className="text-sm font-semibold text-foreground">Reservas recientes</h2>
            {bookingList.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card shadow-sm p-6 text-center">
                <CalendarDays className="size-8 text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Sin reservas aún</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookingList.map((booking) => {
                  const s = BOOKING_STATUS[booking.status] ?? { label: booking.status, icon: Clock, color: 'text-muted-foreground' }
                  const StatusIcon = s.icon
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
                          <span className={cn('inline-flex items-center gap-1 text-xs', s.color)}>
                            <StatusIcon className="size-3" aria-hidden="true" />
                            {s.label}
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

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  valueColor,
  valueSmall,
  href,
}: {
  icon: React.ElementType
  iconColor: string
  label: string
  value: string | number
  valueColor?: string
  valueSmall?: boolean
  href?: string
}) {
  const content = (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 h-full">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('size-4', iconColor)} aria-hidden="true" strokeWidth={1.5} />
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className={cn('font-bold text-foreground', valueSmall ? 'text-xl' : 'text-3xl', valueColor)}>
        {value}
      </p>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-80 transition-opacity">
        {content}
      </Link>
    )
  }
  return content
}
