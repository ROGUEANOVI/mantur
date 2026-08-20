import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TreePine } from 'lucide-react'
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
import PlaceCard, { type PlaceCardRow } from '@/components/shared/PlaceCard'

const PAGE_SIZE = 15

type PlaceRow = PlaceCardRow

const VALID_TYPES = ['waterfall', 'river', 'viewpoint', 'plaza', 'park', 'other'] as const
type PlaceType = (typeof VALID_TYPES)[number]

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let query = supabase
    .from('places')
    .select('id, slug, name, description, type, images', { count: 'exact' })

  if (typeFilter) query = query.eq('type', typeFilter)
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: places, count, error } = await query
    .order('name')
    .range(from, to)

  if (error) throw new Error(error.message)

  const placeRows = (places ?? []) as PlaceRow[]

  let favoritedIds = new Set<string>()
  if (user && placeRows.length > 0) {
    const { data: favorites } = await supabase
      .from('favorites')
      .select('entity_id')
      .eq('user_id', user.id)
      .eq('entity_type', 'place')
      .in('entity_id', placeRows.map((p) => p.id))
    favoritedIds = new Set((favorites ?? []).map((f) => f.entity_id))
  }

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
                {placeRows.map((place, i) => (
                  <Reveal key={place.id} delay={Math.min(i, 8) * 50}>
                    <PlaceCard
                      place={place}
                      isFavorited={favoritedIds.has(place.id)}
                      isGuest={!user}
                    />
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <TreePine className="size-12 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
