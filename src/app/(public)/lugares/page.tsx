import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { TreePine, Droplets, Eye, Waves, Trees, MapPin, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'

export const metadata: Metadata = {
  title: 'Lugares Imperdibles',
  description: 'Descubre los atractivos turísticos de Manaure: cerros, parques, ríos y sitios históricos de la Serranía del Perijá.',
  alternates: { canonical: 'https://mantur.co/lugares' },
  openGraph: {
    title: 'Lugares imperdibles en Manaure | ManTur',
    description: 'Descubre los atractivos turísticos de Manaure: cerros, parques, ríos y sitios históricos.',
    url: 'https://mantur.co/lugares',
  },
}
import SearchInput from '@/components/shared/SearchInput'
import PaginationNav from '@/components/shared/PaginationNav'
import Reveal from '@/components/shared/Reveal'
import EntityListMapToggle from '@/components/shared/EntityListMapToggle'
import type { EntityMapMarker } from '@/components/shared/EntityMap'
import HeroControlCard from '@/components/shared/HeroControlCard'
import FilterPillsRail from '@/components/shared/FilterPillsRail'
import AuroraHero from '@/components/shared/AuroraHero'

const PAGE_SIZE = 15

type PlaceRow = {
  id: string
  slug: string
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
    .select('id, slug, name, description, type, images', { count: 'exact' })

  if (typeFilter) query = query.eq('type', typeFilter)
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: places, count, error } = await query
    .order('name')
    .range(from, to)

  if (error) throw new Error(error.message)

  let mapQuery = supabase
    .from('places')
    .select('id, slug, name, type, lat, lng, images')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (typeFilter) mapQuery = mapQuery.eq('type', typeFilter)
  if (search) mapQuery = mapQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: mapPlaces, error: mapError } = await mapQuery.order('name')

  if (mapError) throw new Error(mapError.message)

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const copy = businessesCopy.places

  const mapMarkers: EntityMapMarker[] = (mapPlaces ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    lat: p.lat as number,
    lng: p.lng as number,
    images: p.images,
    subtitle: copy.types[p.type] ?? copy.types.other,
  }))

  const baseParams: Record<string, string> = {}
  if (typeFilter) baseParams.type = typeFilter
  if (search) baseParams.q = search

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero — mismo degradé orgánico que /negocios; el copy y las fotos diferencian la página */}
      <AuroraHero>
        <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
        <p className="mt-1 text-sm text-white/85">{copy.pageSubtitle}</p>
      </AuroraHero>
      <div className="hero-weave-edge" />

      <HeroControlCard>
        <Suspense fallback={<div className="h-10 w-full rounded-xl bg-muted animate-pulse" />}>
          <SearchInput placeholder="Buscar lugar..." />
        </Suspense>
        <div className="mt-3">
          <FilterPillsRail
            items={[
              {
                key: 'all',
                label: 'Todos',
                href: search ? `/lugares?q=${encodeURIComponent(search)}` : '/lugares',
              },
              ...VALID_TYPES.map((t) => ({
                key: t,
                label: copy.types[t],
                href: search ? `/lugares?type=${t}&q=${encodeURIComponent(search)}` : `/lugares?type=${t}`,
              })),
            ]}
            activeKey={typeFilter ?? 'all'}
          />
        </div>
      </HeroControlCard>

      <div className="max-w-5xl mx-auto w-full">
        <div className="mt-6 px-4">
        {/* Results count */}
        {/* Place grid */}
          {!places || places.length === 0 ? (
            <EmptyState message={search ? `Sin resultados para "${search}"` : copy.empty} />
          ) : (
            <EntityListMapToggle
              mapItems={mapMarkers}
              basePath="/lugares"
              listLabel={copy.listLabel}
              mapLabel={copy.mapLabel}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(places as PlaceRow[]).map((place, i) => (
                  <Reveal key={place.id} delay={Math.min(i, 8) * 50}>
                    <PlaceCard place={place} />
                  </Reveal>
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
            </EntityListMapToggle>
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
    <Link
      href={`/lugares/${place.slug}`}
      className="group h-full rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all
                    flex items-center gap-3 p-3 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0"
    >
      {/* Image */}
      <div className="relative size-24 rounded-xl overflow-hidden shrink-0 sm:size-auto sm:rounded-none sm:aspect-[4/3]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={place.name}
            fill
            sizes="(min-width: 640px) 33vw, 96px"
            className="object-cover"
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
    </Link>
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
