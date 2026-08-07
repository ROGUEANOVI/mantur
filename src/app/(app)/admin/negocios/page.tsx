import Link from 'next/link'
import { Building2, Phone, MapPin, User, Star } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import {
  approveBusiness,
  rejectBusiness,
  toggleFeaturedBusiness,
  forceDeactivateBusiness,
  forceActivateBusiness,
} from '@/app/(app)/admin/actions'
import { cn } from '@/lib/utils'

type BusinessRow = {
  id: string
  name: string
  type: string
  address: string | null
  phone: string | null
  status: string
  is_featured: boolean
  created_at: string
  profiles: { full_name: string | null } | null
}

const VALID_STATUSES = ['pending', 'active', 'inactive', 'rejected'] as const
type StatusFilter = (typeof VALID_STATUSES)[number]

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function AdminNegociosPage({
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

  const { data: businesses } = await admin
    .from('businesses')
    .select('id, name, type, address, phone, status, is_featured, created_at, profiles(full_name)')
    .eq('status', statusFilter)
    .order('created_at', { ascending: true })

  const items = (businesses ?? []) as unknown as BusinessRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {adminCopy.negocios.title}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{adminCopy.negocios.subtitle}</p>
          </div>
          <Link
            href="/admin/negocios/nuevo"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-11 flex items-center shrink-0"
          >
            {adminCopy.negocios.new}
          </Link>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/negocios?status=${s}`}
              className={cn(
                'flex-1 text-center text-sm font-medium py-1.5 rounded-lg transition-colors',
                statusFilter === s
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {adminCopy.negocios.filter[s]}
            </Link>
          ))}
        </div>

        {/* Business list */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <p className="text-sm text-muted-foreground">{adminCopy.negocios.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((biz) => {
              const statusColor =
                adminCopy.negocios.statusColors[biz.status] ??
                adminCopy.negocios.statusColors.inactive
              const statusLabel =
                adminCopy.negocios.statusLabels[biz.status] ?? biz.status
              const typeLabel =
                businessesCopy.businesses.types[biz.type] ??
                businessesCopy.businesses.types.other

              return (
                <div
                  key={biz.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3"
                >
                  {/* Header: name + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Building2
                          className="size-5 text-primary"
                          aria-hidden="true"
                          strokeWidth={1.5}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
                            {biz.name}
                          </p>
                          {biz.is_featured && (
                            <Star
                              className="size-3.5 shrink-0 text-amber-500 fill-amber-500"
                              aria-label="Destacado"
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{typeLabel}</p>
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
                  <div className="space-y-1.5">
                    {biz.profiles?.full_name && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {adminCopy.negocios.owner}: {biz.profiles.full_name}
                        </span>
                      </p>
                    )}
                    {biz.address && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="line-clamp-1">{biz.address}</span>
                      </p>
                    )}
                    {biz.phone && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                        {biz.phone}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {adminCopy.negocios.createdAt}: {formatDate(biz.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  {statusFilter === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <form action={approveBusiness} className="flex-1">
                        <input type="hidden" name="businessId" value={biz.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-[40px] hover:bg-primary/90 transition-colors"
                        >
                          {adminCopy.negocios.approve}
                        </button>
                      </form>
                      <form action={rejectBusiness} className="flex-1">
                        <input type="hidden" name="businessId" value={biz.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl border border-border bg-background text-foreground text-sm font-semibold min-h-[40px] hover:bg-muted transition-colors"
                        >
                          {adminCopy.negocios.reject}
                        </button>
                      </form>
                    </div>
                  )}

                  {statusFilter === 'active' && (
                    <div className="flex gap-2 pt-1">
                      {/* Featured toggle */}
                      <form action={toggleFeaturedBusiness}>
                        <input type="hidden" name="businessId" value={biz.id} />
                        <input type="hidden" name="featured" value={biz.is_featured ? 'false' : 'true'} />
                        <button
                          type="submit"
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-xl border px-3 text-xs font-medium min-h-[36px] transition-colors',
                            biz.is_featured
                              ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted',
                          )}
                        >
                          <Star className={cn('size-3.5', biz.is_featured ? 'fill-accent text-accent' : '')} aria-hidden="true" />
                          {biz.is_featured ? adminCopy.negocios.unfeature : adminCopy.negocios.feature}
                        </button>
                      </form>
                      {/* Force deactivate */}
                      <form action={forceDeactivateBusiness} className="ml-auto">
                        <input type="hidden" name="businessId" value={biz.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-xl border border-destructive/40 text-destructive bg-destructive/5 text-xs font-medium px-3 min-h-[36px] hover:bg-destructive/10 transition-colors"
                        >
                          {adminCopy.negocios.forceDeactivate}
                        </button>
                      </form>
                    </div>
                  )}

                  {statusFilter === 'inactive' && (
                    <div className="pt-1">
                      <form action={forceActivateBusiness}>
                        <input type="hidden" name="businessId" value={biz.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-medium px-3 min-h-[36px] hover:bg-primary/90 transition-colors"
                        >
                          {adminCopy.negocios.forceActivate}
                        </button>
                      </form>
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
