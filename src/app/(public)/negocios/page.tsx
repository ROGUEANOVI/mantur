import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'

export const metadata: Metadata = {
  title: 'Negocios',
  description: 'Explora restaurantes, balnearios, fincas y más en Manaure Balcón del Cesar. Reserva servicios únicos con negocios locales.',
  alternates: { canonical: 'https://mantur.co/negocios' },
  openGraph: {
    title: 'Negocios locales en Manaure | ManTur',
    description: 'Explora restaurantes, balnearios, fincas y más en Manaure Balcón del Cesar.',
    url: 'https://mantur.co/negocios',
  },
}
import SearchInput from '@/components/shared/SearchInput'
import EntityListMapToggle from '@/components/shared/EntityListMapToggle'
import type { EntityMapMarker } from '@/components/shared/EntityMap'
import Reveal from '@/components/shared/Reveal'
import PaginationNav from '@/components/shared/PaginationNav'
import HeroControlCard from '@/components/shared/HeroControlCard'
import FilterPillsRail from '@/components/shared/FilterPillsRail'
import AuroraHero from '@/components/shared/AuroraHero'
import BusinessCard, { type BusinessCardRow } from '@/components/shared/BusinessCard'

const PAGE_SIZE = 12

type CategoryLink = {
  business_categories: { name: string; slug: string } | null
}

type BusinessRow = BusinessCardRow

type CategoryRow = { id: string; slug: string; name: string }

type MapBusinessRow = {
  id: string
  slug: string
  name: string
  images: string[] | null
  lat: number
  lng: number
  business_category_links: CategoryLink[]
}

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>
}) {
  const { type: rawType, q: rawQ, page: rawPage } = await searchParams

  const search = rawQ?.trim().slice(0, 100) ?? ''
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch active categories — drives filter pills and slug→id lookup
  const { data: categoriesData } = await supabase
    .from('business_categories')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const categories = (categoriesData ?? []) as CategoryRow[]
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]))

  const activeCategory = rawType ? (categoryBySlug.get(rawType) ?? null) : null

  // Use !inner join when filtering by category so only matching businesses are returned
  const selectClause = activeCategory
    ? 'id, slug, name, description, images, address, business_category_links!inner(business_categories(name, slug))'
    : 'id, slug, name, description, images, address, business_category_links(business_categories(name, slug))'

  let query = supabase
    .from('businesses')
    .select(selectClause, { count: 'exact' })
    .eq('verified', true)
    .eq('status', 'active')

  if (activeCategory) query = query.eq('business_category_links.category_id', activeCategory.id)
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: businesses, count, error } = await query
    .order('name')
    .range(from, to)

  if (error) throw new Error(error.message)

  const businessRows = (businesses ?? []) as unknown as BusinessRow[]

  let favoritedIds = new Set<string>()
  if (user && businessRows.length > 0) {
    const { data: favorites } = await supabase
      .from('favorites')
      .select('entity_id')
      .eq('user_id', user.id)
      .eq('entity_type', 'business')
      .in('entity_id', businessRows.map((b) => b.id))
    favoritedIds = new Set((favorites ?? []).map((f) => f.entity_id))
  }

  const mapSelectClause = activeCategory
    ? 'id, slug, name, images, lat, lng, business_category_links!inner(business_categories(name, slug))'
    : 'id, slug, name, images, lat, lng, business_category_links(business_categories(name, slug))'

  let mapQuery = supabase
    .from('businesses')
    .select(mapSelectClause)
    .eq('verified', true)
    .eq('status', 'active')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (activeCategory) mapQuery = mapQuery.eq('business_category_links.category_id', activeCategory.id)
  if (search) mapQuery = mapQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: mapBusinesses, error: mapError } = await mapQuery.order('name')

  if (mapError) throw new Error(mapError.message)

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const copy = businessesCopy.businesses

  const mapMarkers: EntityMapMarker[] = ((mapBusinesses ?? []) as unknown as MapBusinessRow[]).map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    lat: b.lat,
    lng: b.lng,
    images: b.images,
    subtitle: b.business_category_links
      .map((l) => l.business_categories?.name)
      .find((n): n is string => Boolean(n)),
  }))

  // Build base params for pagination (exclude page)
  const baseParams: Record<string, string> = {}
  if (activeCategory) baseParams.type = activeCategory.slug
  if (search) baseParams.q = search

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero — degradé orgánico de marca (verde/salvia/ámbar), sin silueta plana */}
      <AuroraHero>
        <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
        <p className="mt-1 text-sm text-white/85">{copy.pageSubtitle}</p>
      </AuroraHero>
      <div className="hero-weave-edge" />

      {/* Buscador + filtros agrupados en la tarjeta de control flotante,
          compartida con /lugares, /transportistas y /guias */}
      <HeroControlCard>
        <Suspense fallback={<div className="h-10 w-full rounded-xl bg-muted animate-pulse" />}>
          <SearchInput placeholder="Buscar negocio..." />
        </Suspense>
        <div className="mt-3">
          <FilterPillsRail
            items={[
              {
                key: 'all',
                label: 'Todos',
                href: search ? `/negocios?q=${encodeURIComponent(search)}` : '/negocios',
              },
              ...categories.map((cat) => ({
                key: cat.slug,
                label: cat.name,
                href: search
                  ? `/negocios?type=${cat.slug}&q=${encodeURIComponent(search)}`
                  : `/negocios?type=${cat.slug}`,
              })),
            ]}
            activeKey={activeCategory?.slug ?? 'all'}
          />
        </div>
      </HeroControlCard>

      <div className="max-w-5xl mx-auto w-full">
        <div className="mt-6 px-4">
        {/* Results count */}
        {/* Business grid */}
          {!businesses || businesses.length === 0 ? (
            <EmptyState message={search ? `Sin resultados para "${search}"` : copy.empty} />
          ) : (
            <EntityListMapToggle
              mapItems={mapMarkers}
              basePath="/negocios"
              listLabel={copy.listLabel}
              mapLabel={copy.mapLabel}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {businessRows.map((business, i) => (
                  <Reveal key={business.id} delay={Math.min(i, 8) * 50}>
                    <BusinessCard
                      business={business}
                      isFavorited={favoritedIds.has(business.id)}
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
                basePath="/negocios"
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
      <Store className="size-12 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
