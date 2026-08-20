import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import { PRICING_UNIT_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import MediaGallery from '@/components/shared/MediaGallery'
import DetailSplitLayout from '@/components/shared/DetailSplitLayout'
import ExpandableText from '@/components/shared/ExpandableText'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import Reveal from '@/components/shared/Reveal'

const APP_URL = 'https://mantur.co'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; serviceId: string }>
}): Promise<Metadata> {
  const { slug, serviceId } = await params

  const { data } = await createAdminClient()
    .from('services')
    .select('name, description, base_price, images, business_id, businesses!inner(slug)')
    .eq('id', serviceId)
    .eq('status', 'active')
    .eq('businesses.slug', slug)
    .eq('businesses.verified', true)
    .eq('businesses.status', 'active')
    .single()

  if (!data) return {}

  const title = data.name
  const description =
    data.description ?? `Descubre este servicio en Manaure Balcón del Cesar.`
  const image = (data.images as string[] | null)?.[0]
  const url = `${APP_URL}/negocios/${slug}/servicios/${serviceId}`

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

type ServiceDetail = {
  id: string
  name: string
  description: string | null
  base_price: string | number
  capacity: number | null
  attributes: Record<string, unknown>
  images: string[] | null
  videos: string[] | null
  status: string
  business_id: string
  businesses: { id: string; slug: string; name: string; verified: boolean; status: string }
  service_types: { pricing_unit: PricingUnit } | null
}

export default async function ServicioDetailPage({
  params,
}: {
  params: Promise<{ slug: string; serviceId: string }>
}) {
  const { slug, serviceId } = await params
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

  const { data: serviceRow, error } = await supabase
    .from('services')
    .select(
      'id, name, description, base_price, capacity, attributes, images, videos, status, business_id, businesses!inner(id, slug, name, verified, status), service_types(pricing_unit)'
    )
    .eq('id', serviceId)
    .eq('status', 'active')
    .eq('businesses.slug', slug)
    .eq('businesses.verified', true)
    .eq('businesses.status', 'active')
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const svc = serviceRow as unknown as ServiceDetail
  const copy = businessesCopy.services
  const durationMinutes = svc.attributes?.duration_minutes as number | undefined
  const pricingUnit = svc.service_types?.pricing_unit ?? 'per_person'

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: svc.name,
    description: svc.description ?? undefined,
    image: [svc.images?.[0] ?? `${APP_URL}/opengraph-image`],
    provider: {
      '@type': 'LocalBusiness',
      name: svc.businesses.name,
    },
    offers: {
      '@type': 'Offer',
      price: String(svc.base_price),
      priceCurrency: 'COP',
      availability: 'https://schema.org/InStock',
    },
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <script {...jsonLdScriptProps(serviceJsonLd)} />
      <div className="max-w-5xl mx-auto px-4">
        <DetailSplitLayout
          gallery={
            <>
              <Breadcrumbs
                items={[
                  { label: breadcrumbsCopy.home, href: '/' },
                  { label: breadcrumbsCopy.businesses, href: '/negocios' },
                  { label: svc.businesses.name, href: `/negocios/${svc.businesses.slug}` },
                  { label: svc.name },
                ]}
              />

              <MediaGallery images={svc.images ?? []} videos={svc.videos ?? []} name={svc.name} />

              {/* Service name + business link */}
              <div className="mt-4">
                <Link
                  href={`/negocios/${svc.businesses.slug}`}
                  className="text-xs font-medium text-accent uppercase tracking-wide mb-0.5 inline-block hover:underline"
                >
                  {svc.businesses.name}
                </Link>
                <h1 className="text-2xl font-bold text-foreground leading-tight">{svc.name}</h1>

                {svc.description && <ExpandableText text={svc.description} className="mt-4" />}
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
                { label: breadcrumbsCopy.businesses, href: '/negocios' },
                { label: svc.businesses.name, href: `/negocios/${svc.businesses.slug}` },
                { label: svc.name },
              ]}
            />
          </div>

          {/* Duration, capacity, price, and booking CTA */}
          <Reveal className="space-y-3">
            <div className="space-y-2">
              {durationMinutes != null && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm">
                    {copy.duration}: {durationMinutes}&nbsp;{copy.minutes}
                  </span>
                </div>
              )}
              {svc.capacity != null && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm">
                    {copy.capacity}: {svc.capacity}&nbsp;{copy.people}
                  </span>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {PRICING_UNIT_LABELS[pricingUnit]}:{' '}
                <span className="text-base font-semibold text-accent">
                  ${Number(svc.base_price).toLocaleString('es-CO')} COP
                </span>
              </p>
            </div>

            {isTourist ? (
              <Link
                href={`/reservas/nueva?service=${svc.id}`}
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                {copy.book}
              </Link>
            ) : isGuest ? (
              <Link
                href="/login"
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-primary text-primary text-sm font-semibold min-h-11 hover:bg-primary/10 active:scale-[0.98] transition-all"
              >
                {copy.bookGuest}
              </Link>
            ) : null}
          </Reveal>
        </DetailSplitLayout>
      </div>
    </main>
  )
}
