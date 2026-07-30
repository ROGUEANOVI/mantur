import Link from 'next/link'
import { AlertTriangle, Building2, CalendarDays, Percent, TreePine, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { cn } from '@/lib/utils'

export default async function AdminPage() {
  const admin = createAdminClient()

  const [
    { count: pendingCount },
    { count: activeCount },
    { count: bookingsCount },
    { count: lugaresCount },
    { data: commissions },
  ] = await Promise.all([
    admin
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    admin
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    admin.from('bookings').select('id', { count: 'exact', head: true }),
    admin.from('places').select('id', { count: 'exact', head: true }),
    admin.from('commission_config').select('service_type, rate'),
  ])

  const experienceRate =
    commissions?.find((c) => c.service_type === 'experience')?.rate ?? '—'

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <h1 className="text-2xl font-bold text-foreground">
          {adminCopy.dashboard.title}
        </h1>

        {/* Pending alert */}
        {!!pendingCount && pendingCount > 0 && (
          <Link
            href="/admin/negocios?status=pending"
            className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-4 hover:shadow-md transition-shadow"
          >
            <AlertTriangle
              className="size-5 text-amber-600 dark:text-amber-400 shrink-0"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {pendingCount} {adminCopy.dashboard.pendingAlert}
            </p>
            <ChevronRight
              className="size-4 text-amber-500 ml-auto shrink-0"
              aria-hidden="true"
            />
          </Link>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2
                className="size-4 text-amber-500"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                {adminCopy.dashboard.stats.pendingBusinesses}
              </p>
            </div>
            <p
              className={cn(
                'text-3xl font-bold',
                pendingCount
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-foreground',
              )}
            >
              {pendingCount ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2
                className="size-4 text-green-500"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                {adminCopy.dashboard.stats.activeBusinesses}
              </p>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {activeCount ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays
                className="size-4 text-primary"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                {adminCopy.dashboard.stats.totalBookings}
              </p>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {bookingsCount ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <TreePine
                className="size-4 text-primary"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                {adminCopy.dashboard.stats.totalLugares}
              </p>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {lugaresCount ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Percent
                className="size-4 text-primary"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <p className="text-xs text-muted-foreground">
                {adminCopy.dashboard.stats.commissionRate}
              </p>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {experienceRate}%
            </p>
          </div>
        </div>

        {/* Quick-link sections */}
        <div className="space-y-3">
          <Link
            href="/admin/negocios"
            className="flex items-center justify-between rounded-2xl border border-border bg-card shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Building2
                  className="size-5 text-primary"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">
                  {adminCopy.dashboard.sections.businesses}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {adminCopy.dashboard.sections.businessesDesc}
                </p>
              </div>
            </div>
            <ChevronRight
              className="size-5 text-muted-foreground shrink-0"
              aria-hidden="true"
            />
          </Link>

          <Link
            href="/admin/lugares"
            className="flex items-center justify-between rounded-2xl border border-border bg-card shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <TreePine
                  className="size-5 text-primary"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">
                  {adminCopy.dashboard.sections.lugares}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {adminCopy.dashboard.sections.lugaresDesc}
                </p>
              </div>
            </div>
            <ChevronRight
              className="size-5 text-muted-foreground shrink-0"
              aria-hidden="true"
            />
          </Link>

          <Link
            href="/admin/comisiones"
            className="flex items-center justify-between rounded-2xl border border-border bg-card shadow-sm p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Percent
                  className="size-5 text-primary"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">
                  {adminCopy.dashboard.sections.commissions}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {adminCopy.dashboard.sections.commissionsDesc}
                </p>
              </div>
            </div>
            <ChevronRight
              className="size-5 text-muted-foreground shrink-0"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </main>
  )
}
