import Link from 'next/link'
import { Store, ChevronRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy, businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import CreateBusinessForm from '@/components/mi-negocio/CreateBusinessForm'

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

type StatusConfig = {
  label: string
  badgeClass: string
  Icon: React.ElementType
}

const STATUS_MAP: Record<string, StatusConfig> = {
  pending: {
    label: miNegocioCopy.overview.statusPending,
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    Icon: Clock,
  },
  active: {
    label: miNegocioCopy.overview.statusActive,
    badgeClass:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    Icon: CheckCircle2,
  },
  inactive: {
    label: miNegocioCopy.overview.statusInactive,
    badgeClass:
      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    Icon: AlertCircle,
  },
}

export default async function MiNegocioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, description, type, address, phone, status, verified')
    .eq('owner_id', user!.id)
    .single()

  // ── No business yet: show creation form ─────────────────────────────────
  if (!business) {
    return (
      <main className="min-h-screen bg-background px-4 py-6">
        <div className="mx-auto max-w-lg">
          {/* Illustration + headings */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Store
                className="size-8 text-primary"
                aria-hidden="true"
                strokeWidth={1.5}
              />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {miNegocioCopy.setup.title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {miNegocioCopy.setup.subtitle}
            </p>
          </div>

          <CreateBusinessForm />
        </div>
      </main>
    )
  }

  // ── Business exists: show overview ───────────────────────────────────────
  const b = business as Business
  const statusConfig = STATUS_MAP[b.status] ?? STATUS_MAP.inactive
  const StatusIcon = statusConfig.Icon
  const typeLabel =
    businessesCopy.businesses.types[b.type] ??
    businessesCopy.businesses.types.other

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        {/* Page heading */}
        <h1 className="text-2xl font-bold text-foreground">
          {miNegocioCopy.overview.title}
        </h1>

        {/* Business card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          {/* Icon + name + type */}
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Store
                className="size-6 text-primary"
                aria-hidden="true"
                strokeWidth={1.5}
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground text-lg leading-snug line-clamp-1">
                {b.name}
              </h2>
              <p className="text-sm text-muted-foreground">{typeLabel}</p>
            </div>
          </div>

          {/* Status badge */}
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

          {/* Pending review note */}
          {b.status === 'pending' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
              <p className="text-sm text-amber-800 leading-relaxed dark:text-amber-400">
                {miNegocioCopy.overview.pendingNote}
              </p>
            </div>
          )}

          {/* Description */}
          {b.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {b.description}
            </p>
          )}
        </div>

        {/* Link to experiences management */}
        <Link
          href="/mi-negocio/experiencias"
          className={cn(
            'flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm',
            'hover:shadow-md transition-shadow min-h-[72px]',
          )}
        >
          <div className="min-w-0 mr-3">
            <p className="font-semibold text-foreground">
              {miNegocioCopy.nav.experiences}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {miNegocioCopy.overview.experiencesSubtitle}
            </p>
          </div>
          <ChevronRight
            className="size-5 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        </Link>
      </div>
    </main>
  )
}
