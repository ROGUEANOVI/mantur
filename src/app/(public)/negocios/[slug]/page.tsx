import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound, permanentRedirect } from 'next/navigation'
import { MapPin, Phone, Store, Clock, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import { cn } from '@/lib/utils'
import BusinessImageCarousel from '@/components/shared/BusinessImageCarousel'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import Reveal from '@/components/shared/Reveal'
import { MANAURE_CENTER } from '@/lib/geo'

const APP_URL = 'https://mantur.co'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const query = createAdminClient()
    .from('businesses')
    .select('slug, name, description, images')
    .eq('verified', true)
    .eq('status', 'active')
  const { data } = UUID_RE.test(slug)
    ? await query.eq('id', slug).single()
    : await query.eq('slug', slug).single()

  if (!data) return {}

  const title = data.name
  const seoTitle = `${data.name} en Manaure Balcón del Cesar`
  const description =
    data.description ??
    `Reserva servicios en ${data.name} en Manaure Balcón del Cesar.`
  const image = (data.images as string[] | null)?.[0]
  const url = `https://mantur.co/negocios/${data.slug}`

  return {
    title: seoTitle,
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

type ServiceRow = {
  id: string
  name: string
  description: string | null
  base_price: string | number
  capacity: number | null
  attributes: Record<string, unknown>
  images: string[] | null
  status: string
  service_types: { slug: string; pricing_unit: 'per_person' | 'per_night' | 'fixed' } | null
}

type BusinessDetail = {
  id: string
  slug: string
  name: string
  description: string | null
  type: string
  address: string | null
  phone: string | null
  images: string[] | null
  videos: string[] | null
  lat: number | null
  lng: number | null
  services: ServiceRow[]
}

export default async function NegocioDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const isGuest = !user
  let isTourist = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isTourist = profile?.role === 'tourist'
  }

  const isLegacyId = UUID_RE.test(slug)
  const { data: business, error } = await supabase
    .from('businesses')
    .select(
      'id, slug, name, description, type, address, phone, images, videos, lat, lng, services(id, name, description, base_price, capacity, attributes, images, status, service_types(slug, pricing_unit))'
    )
    .eq(isLegacyId ? 'id' : 'slug', slug)
    .eq('verified', true)
    .eq('status', 'active')
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const b = business as unknown as BusinessDetail

  if (isLegacyId) permanentRedirect(`/negocios/${b.slug}`)

  const copySvc = businessesCopy.services

  const activeServices = (b.services ?? []).filter((s) => s.status === 'active')

  const businessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: b.name,
    description: b.description ?? undefined,
    image: b.images?.[0] ? [b.images[0]] : undefined,
    telephone: b.phone ?? undefined,
    address: b.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: b.address,
          addressLocality: 'Manaure Balcón del Cesar',
          addressRegion: 'Cesar',
          addressCountry: 'CO',
        }
      : undefined,
    geo:
      b.lat != null && b.lng != null
        ? { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng }
        : { '@type': 'GeoCoordinates', latitude: MANAURE_CENTER[0], longitude: MANAURE_CENTER[1] },
    url: `${APP_URL}/negocios/${b.slug}`,
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <script {...jsonLdScriptProps(businessJsonLd)} />
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs
          items={[
            { label: breadcrumbsCopy.home, href: '/' },
            { label: breadcrumbsCopy.businesses, href: '/negocios' },
            { label: b.name },
          ]}
        />

        {/* Image carousel */}
        <BusinessImageCarousel images={b.images ?? []} videos={b.videos ?? []} name={b.name} />

        {/* Business name + type */}
        <section className="px-4 mt-4">
          <p className="text-xs font-medium text-accent uppercase tracking-wide mb-0.5">
            {businessesCopy.businesses.types[b.type] ?? businessesCopy.businesses.types.other}
          </p>
          <h1 className="text-2xl font-bold text-foreground leading-tight">{b.name}</h1>
        </section>

        {/* Business info */}
        <section className="px-4 mt-4 space-y-3">
          {b.description && (
            <p className="text-sm text-foreground/80 leading-relaxed">{b.description}</p>
          )}
          <div className="space-y-2">
            {b.address && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="size-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm">{b.address}</span>
              </div>
            )}
            {b.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <a href={`tel:${b.phone}`} className="text-sm hover:text-primary transition-colors">
                  {b.phone}
                </a>
              </div>
            )}
          </div>
          {b.lat != null && b.lng != null && (
            <div className="rounded-2xl overflow-hidden h-48 md:h-64">
              <iframe
                src={`https://www.google.com/maps?q=${b.lat},${b.lng}&output=embed`}
                title={b.name}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full border-0"
              />
            </div>
          )}
        </section>

        {/* Services */}
        <section className="px-4 mt-8">
          <h2 className="text-base font-semibold text-foreground mb-3">{copySvc.sectionTitle}</h2>
          {activeServices.length === 0 ? (
            <div className="rounded-2xl border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">{copySvc.empty}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeServices.map((svc, i) => (
                <Reveal key={svc.id} delay={Math.min(i, 8) * 60}>
                  <ServiceCard
                    service={svc}
                    businessSlug={b.slug}
                    isTourist={isTourist}
                    isGuest={isGuest}
                  />
                </Reveal>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function ServiceCard({
  service: svc,
  businessSlug,
  isTourist,
  isGuest,
}: {
  service: ServiceRow
  businessSlug: string
  isTourist: boolean
  isGuest: boolean
}) {
  const copy = businessesCopy.services
  const imageUrl = svc.images?.[0]
  const detailHref = `/negocios/${businessSlug}/servicios/${svc.id}`
  const durationMinutes = svc.attributes?.duration_minutes as number | undefined

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 has-[a:active]:scale-[0.98] transition-all bg-card border border-border flex">
      <Link href={detailHref} className="absolute inset-0 z-0" aria-label={svc.name}>
        <span className="sr-only">{svc.name}</span>
      </Link>

      <div
        className={cn(
          'relative w-24 shrink-0 self-stretch',
          !imageUrl && 'bg-gradient-to-br from-primary/20 to-accent/20'
        )}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={svc.name} fill sizes="96px" className="object-cover" />
        ) : (
          <div className="h-full min-h-[96px] flex items-center justify-center">
            <Store className="size-6 text-primary/50" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 p-4 space-y-1.5">
        <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
          {svc.name}
        </h3>
        {svc.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {svc.description}
          </p>
        )}
        <p className="text-base font-semibold text-accent">
          ${Number(svc.base_price).toLocaleString('es-CO')} COP
        </p>
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          {durationMinutes != null && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {durationMinutes}&nbsp;{copy.minutes}
            </span>
          )}
          {svc.capacity != null && (
            <span className="flex items-center gap-1">
              <Users className="size-3" aria-hidden="true" />
              {svc.capacity}&nbsp;{copy.people}
            </span>
          )}
        </div>

        {isTourist ? (
          <Link
            href={`/reservas/nueva?service=${svc.id}`}
            className="relative z-10 mt-2 inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            {copy.book}
          </Link>
        ) : isGuest ? (
          <Link
            href="/login"
            className="relative z-10 mt-2 inline-flex w-full items-center justify-center rounded-xl border border-primary text-primary text-sm font-semibold min-h-11 hover:bg-primary/10 active:scale-[0.98] transition-all"
          >
            {copy.bookGuest}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
