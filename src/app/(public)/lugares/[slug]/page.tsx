import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { MapPin, TreePine, Droplets, Eye, Waves, Trees, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import BusinessImageCarousel from '@/components/shared/BusinessImageCarousel'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'

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

  const copy = businessesCopy.places
  const typeLabel = copy.types[p.type] ?? copy.types.other
  const Icon = TYPE_ICONS[p.type as PlaceType] ?? TreePine

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
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs
          items={[
            { label: breadcrumbsCopy.home, href: '/' },
            { label: breadcrumbsCopy.places, href: '/lugares' },
            { label: p.name },
          ]}
        />

        {/* Image carousel */}
        <BusinessImageCarousel images={p.images ?? []} videos={p.videos ?? []} name={p.name} />

        {/* Place name + type */}
        <section className="px-4 mt-4">
          <p className="inline-flex items-center gap-1 text-xs font-medium text-accent uppercase tracking-wide mb-0.5">
            <Icon className="size-3.5" aria-hidden="true" />
            {typeLabel}
          </p>
          <h1 className="text-2xl font-bold text-foreground leading-tight">{p.name}</h1>
        </section>

        {/* Place info */}
        <section className="px-4 mt-4 space-y-3">
          {p.description && (
            <p className="text-sm text-foreground/80 leading-relaxed">{p.description}</p>
          )}
          {p.lat != null && p.lng != null && (
            <a
              href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {copy.viewMap}
            </a>
          )}
        </section>
      </div>
    </main>
  )
}
