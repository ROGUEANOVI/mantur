import Link from 'next/link'
import { Store, Plus, ChevronRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy, businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'

type Business = {
  id: string
  name: string
  type: string
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

export default async function MiNegocioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, type, status, verified')
    .eq('owner_id', user!.id)
    .order('created_at', { ascending: true })

  const list = (businesses ?? []) as Business[]

  if (list.length === 0) {
    return (
      <main className="min-h-screen bg-background px-4 py-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Store className="size-8 text-primary" aria-hidden="true" strokeWidth={1.5} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">{miNegocioCopy.setup.title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{miNegocioCopy.setup.subtitle}</p>
          </div>
          <Link
            href="/mi-negocio/nuevo"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" aria-hidden="true" />
            {miNegocioCopy.setup.submit}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">{miNegocioCopy.overview.title}</h1>
          <Link
            href="/mi-negocio/nuevo"
            className="inline-flex items-center gap-1.5 shrink-0 rounded-xl bg-primary text-primary-foreground text-sm font-medium px-3 min-h-[44px] hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" aria-hidden="true" />
            Nuevo
          </Link>
        </div>

        <ul className="space-y-3" role="list">
          {list.map((b) => {
            const statusConfig = STATUS_MAP[b.status] ?? STATUS_MAP.inactive
            const StatusIcon = statusConfig.Icon
            const typeLabel =
              businessesCopy.businesses.types[b.type] ??
              businessesCopy.businesses.types.other

            return (
              <li key={b.id}>
                <Link
                  href={`/mi-negocio/${b.id}`}
                  className={cn(
                    'flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm',
                    'hover:shadow-md transition-shadow',
                  )}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Store className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground leading-snug line-clamp-1">
                      {b.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{typeLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        statusConfig.badgeClass,
                      )}
                    >
                      <StatusIcon className="size-3" aria-hidden="true" />
                      {statusConfig.label}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
