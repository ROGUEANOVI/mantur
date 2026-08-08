import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, ChevronLeft, TreePine, Droplets, Eye, Waves, Trees, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import BusinessImageCarousel from '@/components/shared/BusinessImageCarousel'

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
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  if (!UUID_RE.test(id)) return {}

  const { data } = await createAdminClient()
    .from('places')
    .select('name, description, images')
    .eq('id', id)
    .single()

  if (!data) return {}

  const title = data.name
  const description =
    data.description ?? `Descubre ${data.name} en Manaure Balcón del Cesar.`
  const image = (data.images as string[] | null)?.[0]

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://mantur.co/lugares/${id}`,
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
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: place, error } = await supabase
    .from('places')
    .select('id, name, description, type, images, videos, lat, lng')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const p = place as PlaceDetail
  const copy = businessesCopy.places
  const copyDetail = businessesCopy.detail
  const typeLabel = copy.types[p.type] ?? copy.types.other
  const Icon = TYPE_ICONS[p.type as PlaceType] ?? TreePine

  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <div className="px-4 pt-4">
          <Link
            href="/lugares"
            className={cn(
              'inline-flex items-center gap-1.5',
              'text-sm font-medium text-primary',
              'min-h-11 py-2 hover:underline'
            )}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {copyDetail.back}
          </Link>
        </div>

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
