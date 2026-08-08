import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { Clock, Users, Phone } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import TourBookingForm from '@/components/guias/TourBookingForm'
import Breadcrumbs from '@/components/shared/Breadcrumbs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const query = createAdminClient().from('tourist_guides').select('slug, bio, profiles(full_name)')
  const { data } = UUID_RE.test(slug)
    ? await query.eq('id', slug).single()
    : await query.eq('slug', slug).single()

  if (!data) return {}

  const name = (data.profiles as unknown as { full_name: string | null } | null)?.full_name ?? 'Guía turístico'
  const description = data.bio ?? `Conoce a ${name}, guía turístico local en Manaure Balcón del Cesar.`
  const url = `https://mantur.co/guias/${data.slug}`

  return {
    title: name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} — Guía turístico | ManTur`,
      description,
      url,
    },
  }
}

type Guide = {
  id: string
  slug: string
  is_available: boolean
  bio: string | null
  phone: string
  specialties: string[]
  languages: string[]
  profiles: { full_name: string | null } | null
}

type Tour = {
  id: string
  name: string
  description: string | null
  price: number | string
  capacity: number
  duration_minutes: number | null
  images: string[]
}

export default async function GuideProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const isLegacyId = UUID_RE.test(slug)

  const admin = createAdminClient()
  const supabase = await createClient()

  const [guideResult, userResult] = await Promise.all([
    admin
      .from('tourist_guides')
      .select('id, slug, is_available, bio, phone, specialties, languages, profiles(full_name)')
      .eq(isLegacyId ? 'id' : 'slug', slug)
      .single(),
    supabase.auth.getUser(),
  ])

  if (guideResult.error || !guideResult.data) notFound()

  const guide = guideResult.data as unknown as Guide

  if (isLegacyId) permanentRedirect(`/guias/${guide.slug}`)

  const { data: toursData } = await admin
    .from('guide_tours')
    .select('id, name, description, price, capacity, duration_minutes, images')
    .eq('guide_id', guide.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  const tours = (toursData ?? []) as unknown as Tour[]

  let bookingAccess: 'tourist' | 'guest' | 'other_role' = 'guest'
  if (userResult.data.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userResult.data.user.id)
      .single()
    bookingAccess = profile?.role === 'tourist' ? 'tourist' : 'other_role'
  }

  const copy = guidesCopy.profilePage
  const name = guide.profiles?.full_name ?? 'Guía turístico'

  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs
          items={[
            { label: breadcrumbsCopy.home, href: '/' },
            { label: breadcrumbsCopy.guides, href: '/guias' },
            { label: name },
          ]}
        />
      </div>

      {/* Guide header */}
      <section className="relative overflow-hidden bg-linear-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.13]"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,60 L0,40 L150,15 L300,35 L450,5 L600,30 L750,10 L900,28 L1050,8 L1200,22 L1200,60 Z"
            fill="white"
          />
        </svg>
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-8 text-center">
          <h1 className="text-2xl font-bold text-white">{name}</h1>
          {guide.is_available && (
            <span className="mt-2 inline-flex items-center rounded-full bg-green-500/20 text-green-300 border border-green-400/30 px-3 py-0.5 text-xs font-semibold">
              {copy.available}
            </span>
          )}
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Profile info card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          {guide.bio && (
            <p className="text-sm text-muted-foreground leading-relaxed">{guide.bio}</p>
          )}

          {guide.specialties.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{copy.specialtiesLabel}</p>
              <div className="flex flex-wrap gap-1.5">
                {guide.specialties.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {roleRequestsCopy.form.touristGuide.specialtyOptions[s as keyof typeof roleRequestsCopy.form.touristGuide.specialtyOptions] ?? s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {guide.languages.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{copy.languagesLabel}</p>
              <div className="flex flex-wrap gap-1.5">
                {guide.languages.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
                  >
                    {roleRequestsCopy.form.touristGuide.languageOptions[l as keyof typeof roleRequestsCopy.form.touristGuide.languageOptions] ?? l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {guide.phone && (
            <div className="flex items-center gap-2 text-sm border-t border-border pt-3">
              <Phone className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span className="text-foreground font-medium">{guide.phone}</span>
            </div>
          )}
        </div>

        {/* Tours section */}
        <section>
          <h2 className="text-lg font-bold text-foreground mb-4">{copy.toursTitle}</h2>

          {tours.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{copy.noTours}</p>
          ) : (
            <div className="space-y-4">
              {tours.map((tour) => (
                <div
                  key={tour.id}
                  className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
                >
                  {tour.images.length > 0 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tour.images[0]}
                      alt={tour.name}
                      className="w-full h-36 object-cover"
                    />
                  )}

                  <div className="p-4 space-y-3">
                    <h3 className="font-semibold text-foreground text-base">{tour.name}</h3>

                    {tour.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {tour.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-base font-semibold text-accent">
                        ${Number(tour.price).toLocaleString('es-CO')} COP
                      </p>
                      {tour.duration_minutes != null && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3.5" aria-hidden="true" />
                          {tour.duration_minutes}&nbsp;{copy.duration}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3.5" aria-hidden="true" />
                        {tour.capacity}&nbsp;{copy.people}
                      </span>
                    </div>

                    <TourBookingForm
                      guideTourId={tour.id}
                      price={Number(tour.price)}
                      access={bookingAccess}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
