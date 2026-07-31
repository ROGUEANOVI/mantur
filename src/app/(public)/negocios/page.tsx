import Link from 'next/link'
import { Suspense } from 'react'
import { Store, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import SearchInput from '@/components/shared/SearchInput'
import PaginationNav from '@/components/shared/PaginationNav'

const PAGE_SIZE = 12

type BusinessRow = {
  id: string
  name: string
  description: string | null
  type: string
  images: string[] | null
  address: string | null
}

const VALID_TYPES = ['resort', 'restaurant', 'farm', 'eatery', 'other'] as const
type BusinessType = (typeof VALID_TYPES)[number]

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>
}) {
  const { type: rawType, q: rawQ, page: rawPage } = await searchParams

  const typeFilter: BusinessType | null =
    VALID_TYPES.includes(rawType as BusinessType) ? (rawType as BusinessType) : null

  const search = rawQ?.trim().slice(0, 100) ?? ''
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  let query = supabase
    .from('businesses')
    .select('id, name, description, type, images, address', { count: 'exact' })
    .eq('verified', true)
    .eq('status', 'active')

  if (typeFilter) query = query.eq('type', typeFilter)
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: businesses, count, error } = await query
    .order('name')
    .range(from, to)

  if (error) throw new Error(error.message)

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const copy = businessesCopy.businesses

  // Build base params for pagination (exclude page)
  const baseParams: Record<string, string> = {}
  if (typeFilter) baseParams.type = typeFilter
  if (search) baseParams.q = search

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero + search + pills — zona oscura unificada */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
        {/* Town/building silhouette */}
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.13]"
          viewBox="0 0 1200 80"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,80 L0,55 L60,55 L60,40 L80,40 L80,30 L100,30 L100,40 L130,40 L130,55
               L200,55 L200,35 L215,35 L215,20 L230,20 L230,35 L260,35 L260,55
               L320,55 L320,45 L345,45 L345,55 L400,55 L400,38 L420,38 L420,25 L440,25 L440,38 L470,38 L470,55
               L540,55 L540,42 L560,42 L560,55 L600,55 L600,30 L618,30 L618,18 L636,18 L636,30 L660,30 L660,55
               L720,55 L720,45 L750,45 L750,55 L800,55 L800,35 L820,35 L820,22 L840,22 L840,35 L870,35 L870,55
               L930,55 L930,42 L950,42 L950,55 L1000,55 L1000,40 L1020,40 L1020,28 L1045,28 L1045,40 L1070,40 L1070,55
               L1140,55 L1140,45 L1165,45 L1165,55 L1200,55 L1200,80 Z"
            fill="white"
          />
        </svg>
        {/* Título y buscador */}
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-5 text-center space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
            <p className="mt-1 text-sm text-white/70">{copy.pageSubtitle}</p>
          </div>
          <Suspense fallback={<div className="h-10 w-full rounded-xl bg-white/20 animate-pulse" />}>
            <SearchInput placeholder="Buscar negocio..." dark />
          </Suspense>
        </div>

        {/* Pills de tipo sobre el mismo fondo oscuro */}
        <div className="border-t border-white/10 py-3">
          <div className="flex flex-wrap justify-center gap-2 px-4 max-w-4xl mx-auto">
            <Link
              href={search ? `/negocios?q=${encodeURIComponent(search)}` : '/negocios'}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                !typeFilter
                  ? 'border-white bg-white text-primary'
                  : 'border-white/30 bg-white/10 text-white hover:bg-white/20',
              )}
            >
              Todos
            </Link>
            {VALID_TYPES.map((t) => {
              const href = search
                ? `/negocios?type=${t}&q=${encodeURIComponent(search)}`
                : `/negocios?type=${t}`
              return (
                <Link
                  key={t}
                  href={href}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                    typeFilter === t
                      ? 'border-white bg-white text-primary'
                      : 'border-white/30 bg-white/10 text-white hover:bg-white/20',
                  )}
                >
                  {copy.types[t]}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto w-full">
        <div className="mt-4 px-4">
        {/* Results count */}
        {/* Business grid */}
          {!businesses || businesses.length === 0 ? (
            <EmptyState message={search ? `Sin resultados para "${search}"` : copy.empty} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(businesses as BusinessRow[]).map((business) => (
                  <BusinessCard key={business.id} business={business} />
                ))}
              </div>
              <PaginationNav
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                baseParams={baseParams}
                basePath="/negocios"
              />
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function BusinessCard({ business }: { business: BusinessRow }) {
  const copy = businessesCopy.businesses
  const imageUrl = business.images?.[0]
  const typeLabel = copy.types[business.type] ?? copy.types.other

  return (
    <Link
      href={`/negocios/${business.id}`}
      className="group rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow
                 flex items-center gap-3 p-3 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0"
    >
      {/* Image — compact square on mobile, wide top image on sm+ */}
      <div className="relative size-24 rounded-xl overflow-hidden shrink-0 sm:size-auto sm:rounded-none sm:aspect-[4/3]">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label={business.name}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Store className="size-8 sm:size-12 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5 sm:p-4 sm:flex sm:flex-col sm:gap-1.5">
        <span className="inline-block text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full mb-1 sm:mb-0 sm:self-start">
          {typeLabel}
        </span>
        <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug line-clamp-1">
          {business.name}
        </h3>
        {business.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 sm:line-clamp-3 leading-relaxed mt-0.5 sm:mt-0">
            {business.description}
          </p>
        )}
        {business.address && (
          <div className="flex items-center gap-1 mt-1.5 sm:mt-auto sm:pt-2">
            <MapPin className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted-foreground line-clamp-1">{business.address}</span>
          </div>
        )}
      </div>
    </Link>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <Store className="size-12 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
