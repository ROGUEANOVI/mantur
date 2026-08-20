import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { MapPin, TreePine, Droplets, Eye, Waves, Trees, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import MediaGallery from '@/components/shared/MediaGallery'
import DetailSplitLayout from '@/components/shared/DetailSplitLayout'
import FavoriteButton from '@/components/shared/FavoriteButton'
import ExpandableText from '@/components/shared/ExpandableText'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import BusinessCard, { type BusinessCardRow } from '@/components/shared/BusinessCard'
import PlaceCard, { type PlaceCardRow } from '@/components/shared/PlaceCard'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import { haversineDistanceKm } from '@/lib/geo'
import Reveal from '@/components/shared/Reveal'

// Beyond this radius a business no longer reads as "near" this place, so the
// section is better omitted than showing something misleadingly far away.
const NEARBY_BUSINESS_RADIUS_KM = 15
const NEARBY_BUSINESS_LIMIT = 4
const SIMILAR_PLACES_LIMIT = 3

const APP_URL = 'https://mantur.co'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const query = createAdminClient().from('places').select('slug, name, description, images')
  const { data } = UUID_RE.test(slug)
    ? await query.eq('id', slug).single()
    : await query.eq('slug', slug).single()

  if (!data) return {}

  const title = data.name
  const description =
    data.description ?? `Descubre ${data.name} en Manaure Balcón del Cesar.`
  const image = (data.images as string[] | null)?.[0]
  const url = `https://mantur.co/lugares/${data.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

type PlaceDetail = {
  id: string
  slug: string
  name: string
  description: string | null
  type: string
  images: string[] | null
  videos: string[] | null
  lat: number | null
  lng: number | null
}

export default async function LugarDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLegacyId = UUID_RE.test(slug)
  const { data: place, error } = await supabase
    .from('places')
    .select('id, slug, name, description, type, images, videos, lat, lng')
    .eq(isLegacyId ? 'id' : 'slug', slug)
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const p = place as PlaceDetail

  if (isLegacyId) permanentRedirect(`/lugares/${p.slug}`)

  let isFavorited = false
  if (user) {
    const { data: favorite } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('entity_type', 'place')
      .eq('entity_id', p.id)
      .maybeSingle()
    isFavorited = Boolean(favorite)
  }

  const copy = businessesCopy.places
  const typeLabel = copy.types[p.type] ?? copy.types.other
  const Icon = TYPE_ICONS[p.type as PlaceType] ?? TreePine

  // Nearby businesses — computed in JS rather than in SQL since this is a
  // single small municipality (a handful of businesses total), so fetching
  // every geolocated business and sorting by distance here is simpler than
  // a bounding-box query, and avoids depending on a PostGIS extension.
  let nearbyBusinesses: (BusinessCardRow & { distanceKm: number })[] = []
  if (p.lat != null && p.lng != null) {
    const { data: candidates } = await supabase
      .from('businesses')
      .select(
        'id, slug, name, description, images, address, lat, lng, business_category_links(business_categories(name, slug))',
      )
      .eq('verified', true)
      .eq('status', 'active')
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    const placeCoords: [number, number] = [p.lat, p.lng]
    nearbyBusinesses = (
      (candidates ?? []) as unknown as (BusinessCardRow & { lat: number; lng: number })[]
    )
      .map((b) => ({ ...b, distanceKm: haversineDistanceKm(placeCoords, [b.lat, b.lng]) }))
      .filter((b) => b.distanceKm <= NEARBY_BUSINESS_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, NEARBY_BUSINESS_LIMIT)
  }

  const { data: similarPlacesData } = await supabase
    .from('places')
    .select('id, slug, name, description, type, images')
    .eq('type', p.type)
    .neq('id', p.id)
    .order('name')
    .limit(SIMILAR_PLACES_LIMIT)
  const similarPlaces = (similarPlacesData ?? []) as PlaceCardRow[]

  let favoritedBusinessIds = new Set<string>()
  if (user && nearbyBusinesses.length > 0) {
    const { data } = await supabase
      .from('favorites')
      .select('entity_id')
      .eq('user_id', user.id)
      .eq('entity_type', 'business')
      .in('entity_id', nearbyBusinesses.map((b) => b.id))
    favoritedBusinessIds = new Set((data ?? []).map((f) => f.entity_id))
  }

  let favoritedPlaceIds = new Set<string>()
  if (user && similarPlaces.length > 0) {
    const { data } = await supabase
      .from('favorites')
      .select('entity_id')
      .eq('user_id', user.id)
      .eq('entity_type', 'place')
      .in('entity_id', similarPlaces.map((pl) => pl.id))
    favoritedPlaceIds = new Set((data ?? []).map((f) => f.entity_id))
  }

  const placeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: p.name,
    description: p.description ?? undefined,
    image: p.images?.[0] ? [p.images[0]] : undefined,
    url: `${APP_URL}/lugares/${p.slug}`,
    geo:
      p.lat != null && p.lng != null
        ? { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng }
        : undefined,
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <script {...jsonLdScriptProps(placeJsonLd)} />
      <div className="max-w-5xl mx-auto px-4">
        <DetailSplitLayout
          gallery={
            <>
              <Breadcrumbs
                items={[
                  { label: breadcrumbsCopy.home, href: '/' },
                  { label: breadcrumbsCopy.places, href: '/lugares' },
                  { label: p.name },
                ]}
              />

              <MediaGallery images={p.images ?? []} videos={p.videos ?? []} name={p.name} />

              {/* Place name + type */}
              <div className="mt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-accent uppercase tracking-wide mb-0.5">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {typeLabel}
                    </p>
                    <h1 className="text-2xl font-bold text-foreground leading-tight">{p.name}</h1>
                  </div>
                  <FavoriteButton
                    entityType="place"
                    entityId={p.id}
                    initialFavorited={isFavorited}
                    isGuest={!user}
                    variant="solid"
                    className="shrink-0"
                  />
                </div>

                {p.description && <ExpandableText text={p.description} className="mt-4" />}
              </div>
            </>
          }
        >
          {/* Invisible spacer matching the breadcrumb's height (rendered for
              real at the top of the sticky gallery column) so this column's
              content starts level with the mosaic instead of the breadcrumb. */}
          <div className="invisible" aria-hidden="true">
            <Breadcrumbs
              items={[
                { label: breadcrumbsCopy.home, href: '/' },
                { label: breadcrumbsCopy.places, href: '/lugares' },
                { label: p.name },
              ]}
            />
          </div>

          {/* Map */}
          {p.lat != null && p.lng != null && (
            <Reveal className="space-y-3">
              <div className="rounded-2xl overflow-hidden h-48 md:h-64">
                <iframe
                  src={`https://www.google.com/maps?q=${p.lat},${p.lng}&output=embed`}
                  title={p.name}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="w-full h-full border-0"
                />
              </div>
              <a
                href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline active:scale-95 transition-transform"
              >
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                {copy.viewMap}
              </a>
            </Reveal>
          )}

          {/* Nearby businesses */}
          {nearbyBusinesses.length > 0 && (
            <section className="mt-8">
              <h2 className="text-base font-semibold text-foreground mb-3">
                {copy.nearbyBusinessesTitle}
              </h2>
              <div className="space-y-3">
                {nearbyBusinesses.map((business, i) => (
                  <Reveal key={business.id} delay={Math.min(i, 8) * 60}>
                    <BusinessCard
                      business={business}
                      isFavorited={favoritedBusinessIds.has(business.id)}
                      isGuest={!user}
                      compact
                    />
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {/* Similar places */}
          {similarPlaces.length > 0 && (
            <section className="mt-8">
              <h2 className="text-base font-semibold text-foreground mb-3">
                {copy.similarPlacesTitle}
              </h2>
              <div className="space-y-3">
                {similarPlaces.map((place, i) => (
                  <Reveal key={place.id} delay={Math.min(i, 8) * 60}>
                    <PlaceCard
                      place={place}
                      isFavorited={favoritedPlaceIds.has(place.id)}
                      isGuest={!user}
                      compact
                    />
                  </Reveal>
                ))}
              </div>
            </section>
          )}
        </DetailSplitLayout>
      </div>
    </main>
  )
}
