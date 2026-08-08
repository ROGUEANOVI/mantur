import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import BusinessImageCarousel from '@/components/shared/BusinessImageCarousel'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import Reveal from '@/components/shared/Reveal'

const APP_URL = 'https://mantur.co'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; expId: string }>
}): Promise<Metadata> {
  const { slug, expId } = await params

  const { data } = await createAdminClient()
    .from('experiences')
    .select('name, description, price, images, business_id, businesses!inner(slug)')
    .eq('id', expId)
    .eq('status', 'active')
    .eq('businesses.slug', slug)
    .eq('businesses.verified', true)
    .eq('businesses.status', 'active')
    .single()

  if (!data) return {}

  const title = data.name
  const description =
    data.description ?? `Descubre esta actividad en Manaure Balcón del Cesar.`
  const image = (data.images as string[] | null)?.[0]
  const url = `${APP_URL}/negocios/${slug}/actividades/${expId}`

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

type ExperienceDetail = {
  id: string
  name: string
  description: string | null
  price: string | number
  capacity: number | null
  duration_minutes: number | null
  images: string[] | null
  videos: string[] | null
  status: string
  business_id: string
  businesses: { id: string; slug: string; name: string; verified: boolean; status: string }
}

export default async function ActividadDetailPage({
  params,
}: {
  params: Promise<{ slug: string; expId: string }>
}) {
  const { slug, expId } = await params
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

  const { data: experience, error } = await supabase
    .from('experiences')
    .select(
      'id, name, description, price, capacity, duration_minutes, images, videos, status, business_id, businesses!inner(id, slug, name, verified, status)'
    )
    .eq('id', expId)
    .eq('status', 'active')
    .eq('businesses.slug', slug)
    .eq('businesses.verified', true)
    .eq('businesses.status', 'active')
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const exp = experience as unknown as ExperienceDetail
  const copy = businessesCopy.experiences

  const experienceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: exp.name,
    description: exp.description ?? undefined,
    image: exp.images?.[0] ? [exp.images[0]] : undefined,
    offers: {
      '@type': 'Offer',
      price: String(exp.price),
      priceCurrency: 'COP',
    },
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <script {...jsonLdScriptProps(experienceJsonLd)} />
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs
          items={[
            { label: breadcrumbsCopy.home, href: '/' },
            { label: breadcrumbsCopy.businesses, href: '/negocios' },
            { label: exp.businesses.name, href: `/negocios/${exp.businesses.slug}` },
            { label: exp.name },
          ]}
        />

        {/* Image carousel */}
        <BusinessImageCarousel images={exp.images ?? []} videos={exp.videos ?? []} name={exp.name} />

        {/* Activity name + business link */}
        <section className="px-4 mt-4">
          <Link
            href={`/negocios/${exp.businesses.slug}`}
            className="text-xs font-medium text-accent uppercase tracking-wide mb-0.5 inline-block hover:underline"
          >
            {exp.businesses.name}
          </Link>
          <h1 className="text-2xl font-bold text-foreground leading-tight">{exp.name}</h1>
        </section>

        {/* Activity info */}
        <section className="px-4 mt-4">
        <Reveal className="space-y-3">
          {exp.description && (
            <p className="text-sm text-foreground/80 leading-relaxed">{exp.description}</p>
          )}

          <div className="space-y-2">
            {exp.duration_minutes != null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm">
                  {copy.duration}: {exp.duration_minutes}&nbsp;{copy.minutes}
                </span>
              </div>
            )}
            {exp.capacity != null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm">
                  {copy.capacity}: {exp.capacity}&nbsp;{copy.people}
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {copy.price}:{' '}
              <span className="text-base font-semibold text-accent">
                ${Number(exp.price).toLocaleString('es-CO')} COP
              </span>
            </p>
          </div>

          {isTourist ? (
            <Link
              href={`/reservas/nueva?exp=${exp.id}`}
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
        </section>
      </div>
    </main>
  )
}
