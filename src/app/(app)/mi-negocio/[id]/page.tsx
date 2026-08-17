import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Store,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pencil,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy, businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import BusinessStatusToggle from '@/components/mi-negocio/BusinessStatusToggle'

type Business = {
  id: string
  name: string
  description: string | null
  type: string
  address: string | null
  phone: string | null
  status: string
  verified: boolean
}

const STATUS_MAP: Record<
  string,
  { label: string; badgeClass: string; Icon: React.ElementType }
> = {
  pending: {
    label: miNegocioCopy.overview.statusPending,
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    Icon: Clock,
  },
  active: {
    label: miNegocioCopy.overview.statusActive,
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Icon: CheckCircle2,
  },
  inactive: {
    label: miNegocioCopy.overview.statusInactive,
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    Icon: AlertCircle,
  },
}

export default async function MiNegocioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, description, type, address, phone, status, verified')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) notFound()

  const b = business as Business
  const statusConfig = STATUS_MAP[b.status] ?? STATUS_MAP.inactive
  const StatusIcon = statusConfig.Icon
  const typeLabel =
    businessesCopy.businesses.types[b.type] ?? businessesCopy.businesses.types.other

  const { count: activeBookingsCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', b.id)
    .in('status', ['confirmed', 'pending_payment'])

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        {/* Back */}
        <Link
          href="/mi-negocio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Mis negocios
        </Link>

        {/* Header with edit */}
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Store className="size-6 text-primary" aria-hidden="true" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-foreground text-xl leading-snug line-clamp-1">
              {b.name}
            </h1>
            <p className="text-sm text-muted-foreground">{typeLabel}</p>
          </div>
          <Link
            href={`/mi-negocio/${b.id}/editar`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium min-h-11 hover:bg-muted/50 transition-colors"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar
          </Link>
        </div>

        {/* Status card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">
              {miNegocioCopy.overview.statusLabel}:
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                statusConfig.badgeClass,
              )}
            >
              <StatusIcon className="size-3.5" aria-hidden="true" />
              {statusConfig.label}
            </span>
          </div>

          {b.status === 'pending' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
              <p className="text-sm text-amber-800 leading-relaxed dark:text-amber-400">
                {miNegocioCopy.overview.pendingNote}
              </p>
            </div>
          )}

          {b.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
          )}
        </div>

        {/* Bookings stat */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <p className="text-sm text-muted-foreground">{miNegocioCopy.overview.activeBookings}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{activeBookingsCount ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {miNegocioCopy.overview.activeBookingsNote}
          </p>
        </div>

        {/* Experiences link */}
        <Link
          href={`/mi-negocio/${b.id}/experiencias`}
          className={cn(
            'flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm',
            'hover:shadow-md transition-shadow min-h-[72px]',
          )}
        >
          <div className="min-w-0 mr-3">
            <p className="font-semibold text-foreground">{miNegocioCopy.nav.experiences}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {miNegocioCopy.overview.experiencesSubtitle}
            </p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground shrink-0" aria-hidden="true" />
        </Link>

        {/* Visibility toggle — hidden while pending: nothing to toggle before the first admin approval */}
        {b.status !== 'pending' && <BusinessStatusToggle businessId={b.id} status={b.status} />}
      </div>
    </main>
  )
}
