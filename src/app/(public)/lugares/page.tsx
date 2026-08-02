import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { TreePine, Droplets, Eye, Waves, Trees, MapPin, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'

export const metadata: Metadata = {
  title: 'Lugares Imperdibles',
  description: 'Descubre los atractivos turísticos de Manaure: cerros, parques, ríos y sitios históricos de la Serranía del Perijá.',
  openGraph: {
    title: 'Lugares imperdibles en Manaure | ManTur',
    description: 'Descubre los atractivos turísticos de Manaure: cerros, parques, ríos y sitios históricos.',
    url: 'https://mantur.co/lugares',
  },
}
import { cn } from '@/lib/utils'
import SearchInput from '@/components/shared/SearchInput'
import PaginationNav from '@/components/shared/PaginationNav'

const PAGE_SIZE = 15

type PlaceRow = {
  id: string
  name: string
  description: string | null
  type: string
  images: string[] | null
}

const VALID_TYPES = ['waterfall', 'river', 'viewpoint', 'plaza', 'park', 'other'] as const
type PlaceType = (typeof VALID_TYPES)[number]

const TYPE_ICONS: Record<PlaceType, React.ElementType> = {
  waterfall: Droplets,
  river: Waves,
  viewpoint: Eye,
  plaza: Landmark,
  park: Trees,
  other: TreePine,
}

export default async function LugaresPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>
}) {
  const { type: rawType, q: rawQ, page: rawPage } = await searchParams

  const typeFilter: PlaceType | null =
    VALID_TYPES.includes(rawType as PlaceType) ? (rawType as PlaceType) : null

  const search = rawQ?.trim().slice(0, 100) ?? ''
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  let query = supabase
    .from('places')
    .select('id, name, description, type, images', { count: 'exact' })

  if (typeFilter) query = query.eq('type', typeFilter)
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: places, count, error } = await query
    .order('name')
    .range(from, to)

  if (error) throw new Error(error.message)

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const copy = businessesCopy.places

  const baseParams: Record<string, string> = {}
  if (typeFilter) baseParams.type = typeFilter
  if (search) baseParams.q = search

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero + search + pills — zona oscura unificada */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
        {/* Mountain silhouette — Serranía del Perijá */}
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.13]"
          viewBox="0 0 1200 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,90 L120,52 L240,70 L380,28 L500,55 L620,10 L740,42 L860,18 L980,48 L1100,22 L1200,38 L1200,90 Z"
            fill="white"
          />
        </svg>
        {/* Faint nature icon top-right */}
        <div className="pointer-events-none absolute -top-4 right-4 opacity-[0.10]">
          <TreePine className="size-44 text-white" strokeWidth={0.75} />
        </div>
        {/* Título y buscador */}
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-5 text-center space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
            <p className="mt-1 text-sm text-white/70">{copy.pageSubtitle}</p>
          </div>
          <Suspense fallback={<div className="h-10 w-full rounded-xl bg-white/20 animate-pulse" />}>
            <SearchInput placeholder="Buscar lugar..." dark />
          </Suspense>
        </div>

        {/* Pills de tipo sobre el mismo fondo oscuro */}
        <div className="border-t border-white/10 py-3">
          <div className="flex flex-wrap justify-center gap-2 px-4 max-w-4xl mx-auto">
            <Link
              href={search ? `/lugares?q=${encodeURIComponent(search)}` : '/lugares'}
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
                ? `/lugares?type=${t}&q=${encodeURIComponent(search)}`
                : `/lugares?type=${t}`
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
        {/* Place grid */}
          {!places || places.length === 0 ? (
            <EmptyState message={search ? `Sin resultados para "${search}"` : copy.empty} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(places as PlaceRow[]).map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </div>
              <PaginationNav
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                baseParams={baseParams}
                basePath="/lugares"
              />
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function PlaceCard({ place }: { place: PlaceRow }) {
  const copy = businessesCopy.places
  const imageUrl = place.images?.[0]
  const typeLabel = copy.types[place.type] ?? copy.types.other
  const Icon = TYPE_ICONS[(place.type as PlaceType)] ?? TreePine

  return (
    <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow
                    flex items-center gap-3 p-3 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0">
      {/* Image */}
      <div className="relative size-24 rounded-xl overflow-hidden shrink-0 sm:size-auto sm:rounded-none sm:aspect-[4/3]">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label={place.name}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-primary/30 flex items-center justify-center">
            <Icon className="size-9 sm:size-14 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5 sm:p-4 sm:flex sm:flex-col sm:gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full mb-1 sm:mb-0 sm:self-start">
          <MapPin className="size-3" aria-hidden="true" />
          {typeLabel}
        </span>
        <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug line-clamp-1">
          {place.name}
        </h3>
        {place.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 sm:line-clamp-3 leading-relaxed mt-0.5 sm:mt-0">
            {place.description}
          </p>
        )}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <TreePine className="size-12 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
