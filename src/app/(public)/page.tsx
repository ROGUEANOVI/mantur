import type { Metadata } from 'next'
import Link from 'next/link'
import { Store, TreePine, Waves, Utensils, Home, Star, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { landingCopy } from '@/lib/copy/landing'
import { cn } from '@/lib/utils'
import FeaturedCarousel from '@/components/shared/FeaturedCarousel'

export const metadata: Metadata = {
  title: 'ManTur — Turismo con alma local',
  description: 'Descubre Manaure Balcón del Cesar. Reserva experiencias en negocios locales, contrata guías turísticos y encuentra transporte con alma local.',
  openGraph: {
    title: 'ManTur — Turismo con alma local',
    description: 'Descubre Manaure Balcón del Cesar. Reserva experiencias, guías y transporte local.',
    url: 'https://mantur.co',
  },
}

type FeaturedBusiness = {
  id: string
  name: string
  description: string | null
  type: string
  images: string[] | null
  address: string | null
}

type PlacePreview = {
  id: string
  name: string
  description: string | null
  type: string
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  resort: Waves,
  restaurant: Utensils,
  farm: Home,
  eatery: Utensils,
  other: Store,
}

export default async function LandingPage() {
  const admin = createAdminClient()
  const copy = landingCopy

  const [{ data: featured }, { data: places }] = await Promise.all([
    admin
      .from('businesses')
      .select('id, name, description, type, images, address')
      .eq('is_featured', true)
      .eq('status', 'active')
      .eq('verified', true)
      .order('name'),
    admin
      .from('places')
      .select('id, name, description, type')
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const featuredList = (featured ?? []) as FeaturedBusiness[]
  const placesList = (places ?? []) as PlacePreview[]

  const categories = [
    { key: 'resort', label: copy.categories.resort },
    { key: 'restaurant', label: copy.categories.restaurant },
    { key: 'farm', label: copy.categories.farm },
    { key: 'eatery', label: copy.categories.eatery },
    { key: 'other', label: copy.categories.other },
  ]

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28] px-4 py-16 sm:py-24">
        {/* decorative circles */}
        <div className="pointer-events-none absolute -top-16 -right-16 size-72 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 size-48 rounded-full bg-white/5" />

        <div className="relative mx-auto max-w-lg text-center">
          <p className="mb-3 inline-block rounded-full border border-white/30 bg-white/10 px-4 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
            {copy.hero.eyebrow}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            {copy.hero.title}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-base text-white/80">
            {copy.hero.subtitle}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/negocios"
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-white px-6 text-sm font-bold text-[#0e7a54] shadow-lg hover:bg-white/90 transition-colors"
            >
              {copy.hero.ctaPrimary}
            </Link>
            <Link
              href="/lugares"
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-white/40 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
            >
              {copy.hero.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Destacados ───────────────────────────────────────── */}
      {featuredList.length > 0 && (
        <section className="py-10">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2 px-4 mb-5">
              <Star className="size-5 text-amber-500 fill-amber-500" aria-hidden="true" />
              <h2 className="text-lg font-bold text-foreground">
                {copy.featured.title}
              </h2>
            </div>
            <FeaturedCarousel>
              {featuredList.map((b) => (
                <FeaturedCard key={b.id} business={b} />
              ))}
            </FeaturedCarousel>
          </div>
        </section>
      )}

      {/* ── Categorías ───────────────────────────────────────── */}
      <section className="py-10 bg-muted/30">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-lg font-bold text-foreground mb-5">
            {copy.categories.title}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {categories.map(({ key, label }) => {
              const Icon = CATEGORY_ICONS[key] ?? Store
              return (
                <Link
                  key={key}
                  href={`/negocios?type=${key}`}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center hover:border-primary/40 hover:shadow-sm transition-all group"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Icon className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
                  </div>
                  <span className="text-xs font-medium text-foreground leading-tight">
                    {label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Lugares preview ──────────────────────────────────── */}
      {placesList.length > 0 && (
        <section className="py-10">
          <div className="mx-auto max-w-5xl px-4">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {copy.placesPreview.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {copy.placesPreview.subtitle}
                </p>
              </div>
              <Link
                href="/lugares"
                className="text-sm font-medium text-primary hover:underline shrink-0"
              >
                {copy.placesPreview.viewAll}
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {placesList.map((place) => (
                <PlaceCard key={place.id} place={place} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

function FeaturedCard({ business }: { business: FeaturedBusiness }) {
  const copy = landingCopy.featured
  const imageUrl = business.images?.[0]

  return (
    <div
      data-carousel-item
      className="snap-start shrink-0 w-64 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-card border border-border"
    >
      <div className="relative aspect-[4/3]">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label={business.name}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/20 dark:from-primary/20 dark:to-primary/10 flex items-center justify-center">
            <Store className="size-10 text-primary/40" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {/* Featured badge */}
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white shadow">
          <Star className="size-3 fill-white" aria-hidden="true" />
          {copy.badge}
        </span>
        <p className="absolute bottom-2.5 left-3 right-3 text-white font-semibold text-sm leading-tight line-clamp-1">
          {business.name}
        </p>
      </div>
      <div className="p-3">
        {business.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {business.description}
          </p>
        )}
        <Link
          href={`/negocios/${business.id}`}
          className={cn(
            'flex items-center justify-center w-full min-h-[40px]',
            'rounded-xl bg-primary text-primary-foreground',
            'text-xs font-medium px-3',
            'hover:bg-primary/90 transition-colors',
          )}
        >
          {copy.viewDetail}
        </Link>
      </div>
    </div>
  )
}

function PlaceCard({ place }: { place: PlacePreview }) {
  return (
    <Link
      href={`/lugares/${place.id}`}
      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:shadow-sm transition-shadow"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <MapPin className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-1">
          {place.name}
        </p>
        {place.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {place.description}
          </p>
        )}
      </div>
    </Link>
  )
}
