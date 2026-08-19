import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  Store,
  Waves,
  Utensils,
  Home,
  Beer,
  Wine,
  Coffee,
  BedDouble,
  Sandwich,
  Star,
  MapPin,
  Search,
  ArrowRight,
  ChevronRight,
  Droplets,
  Eye,
  Landmark,
  Trees,
  TreePine,
  Car,
  Compass,
} from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { landingCopy } from '@/lib/copy/landing'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import Reveal from '@/components/shared/Reveal'
import { cn } from '@/lib/utils'
import FeaturedCarousel from '@/components/shared/FeaturedCarousel'
import HeroSlideshow from '@/components/shared/HeroSlideshow'

export const metadata: Metadata = {
  title: 'ManTur — Turismo con alma local',
  description: 'Descubre Manaure Balcón del Cesar. Reserva servicios en negocios locales, contrata guías turísticos y encuentra transporte con alma local.',
  alternates: { canonical: 'https://mantur.co' },
  openGraph: {
    title: 'ManTur — Turismo con alma local',
    description: 'Descubre Manaure Balcón del Cesar. Reserva servicios, guías y transporte local.',
    url: 'https://mantur.co',
  },
}

type FeaturedBusiness = {
  id: string
  slug: string
  name: string
  description: string | null
  type: string
  images: string[] | null
  address: string | null
}

type PlaceType = 'waterfall' | 'river' | 'viewpoint' | 'plaza' | 'park' | 'other'

type PlacePreview = {
  id: string
  slug: string
  name: string
  description: string | null
  type: PlaceType
  images: string[] | null
}

type CategoryRow = {
  id: string
  slug: string
  name: string
}

const MAX_LANDING_CATEGORIES = 5

// Keyed by business_categories.slug — covers every category seeded today
// plus a couple of legacy/inactive slugs, with Store as the generic fallback.
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  resort: Waves,
  balneario: Waves,
  restaurant: Utensils,
  farm: Home,
  casa_de_campo: Trees,
  eatery: Beer,
  cafeteria: Coffee,
  hospedaje: BedDouble,
  comidas_rapidas: Sandwich,
  estanco: Wine,
  other: Store,
}

const PRIMARY_STYLE = 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground'
const ACCENT_STYLE = 'bg-accent/15 text-accent group-hover:bg-accent group-hover:text-accent-foreground'
const NEUTRAL_STYLE = 'bg-muted text-muted-foreground group-hover:bg-foreground/10 group-hover:text-foreground'

const PLACE_TYPE_ICONS: Record<PlaceType, React.ElementType> = {
  waterfall: Droplets,
  river: Waves,
  viewpoint: Eye,
  plaza: Landmark,
  park: Trees,
  other: TreePine,
}

// Hero slideshow order. Plaza Simón Bolívar leads — it's the municipality's
// most emblematic landmark — followed by a scenic-first ordering for the rest.
const PLACE_HERO_PRIORITY: Record<PlaceType, number> = {
  plaza: 0,
  viewpoint: 1,
  waterfall: 2,
  river: 3,
  park: 4,
  other: 5,
}

// Same three roles /solicitar-rol offers — icons and copy stay in sync with
// that page so clicking through feels like a continuation, not a new pitch.
const JOIN_ROLES = [
  { key: 'business_owner', Icon: Store } as const,
  { key: 'transporter', Icon: Car } as const,
  { key: 'tourist_guide', Icon: Compass } as const,
]

export default async function LandingPage() {
  const admin = createAdminClient()
  const copy = landingCopy

  const [{ data: featured }, { data: places }, { data: categoriesData }, { data: categoryLinks }] = await Promise.all([
    admin
      .from('businesses')
      .select('id, slug, name, description, type, images, address')
      .eq('is_featured', true)
      .eq('status', 'active')
      .eq('verified', true)
      .order('name'),
    // No limit here — the hero slideshow needs every place with a photo,
    // not just the ones that also happen to fit the "Imperdibles" preview.
    admin
      .from('places')
      .select('id, slug, name, description, type, images')
      .order('created_at', { ascending: false }),
    // Same source as /negocios' filter pills — the landing's category
    // shortcuts must stay in sync with what's actually active there.
    admin
      .from('business_categories')
      .select('id, slug, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    admin.from('business_category_links').select('category_id'),
  ])

  const featuredList = (featured ?? []) as FeaturedBusiness[]
  const allPlaces = (places ?? []) as PlacePreview[]
  const placesList = allPlaces.slice(0, 6)

  // Show only the categories with actual listings — an active-but-empty
  // category (e.g. Estanco today) is a dead end as a landing shortcut, even
  // though it's legitimately a valid filter once /negocios has businesses in it.
  const businessCountByCategory = new Map<string, number>()
  for (const link of categoryLinks ?? []) {
    businessCountByCategory.set(link.category_id, (businessCountByCategory.get(link.category_id) ?? 0) + 1)
  }
  const categories = ((categoriesData ?? []) as CategoryRow[])
    .map((c) => ({ ...c, count: businessCountByCategory.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_LANDING_CATEGORIES)

  // One image per distinct place (not every photo of the same place) so the
  // slideshow actually shows variety instead of looping the same spot.
  // Falls back to the plain gradient if no place has a photo yet.
  const heroImages = allPlaces
    .filter((p) => (p.images?.length ?? 0) > 0)
    .sort((a, b) => PLACE_HERO_PRIORITY[a.type] - PLACE_HERO_PRIORITY[b.type])
    .map((p) => p.images![0])

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pt-16 pb-28 sm:pt-24 sm:pb-36">
        {/* Background photo(s) */}
        <div className="absolute inset-0 z-0 bg-primary">
          {heroImages.length > 0 && <HeroSlideshow images={heroImages} />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a2b1e]/60 via-[#0a2b1e]/35 to-background" />
        </div>

        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-24 -right-20 size-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-72 rounded-full bg-white/5 blur-2xl" />

        <div className="relative mx-auto max-w-2xl text-center">
          <span className="animate-fade-up inline-block rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">
            {copy.hero.eyebrow}
          </span>
          <h1 className="animate-fade-up [animation-delay:100ms] mt-4 text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            {copy.hero.title}
          </h1>
          <p className="animate-fade-up [animation-delay:200ms] mx-auto mt-4 max-w-lg text-base text-white/85 sm:text-lg">
            {copy.hero.subtitle}
          </p>

          {/* Search */}
          <form
            action="/negocios"
            method="GET"
            className="animate-fade-up [animation-delay:300ms] mx-auto mt-8 flex w-full max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-xl sm:flex-row"
          >
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                name="q"
                placeholder="¿Qué quieres explorar hoy?"
                className="h-12 w-full rounded-xl border border-transparent bg-transparent pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="min-h-11 shrink-0 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-md transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg"
            >
              Explorar
            </button>
          </form>
        </div>
      </section>

      {/* ── Categorías ───────────────────────────────────────── */}
      {categories.length > 0 && (
        <section className="relative -mt-14 px-4">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <h2 className="mb-4 text-lg font-bold text-foreground">
                {copy.categories.title}
              </h2>
            </Reveal>
            <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
              {categories.map((category, i) => {
                const Icon = CATEGORY_ICONS[category.slug] ?? Store
                const style = category.slug === 'other' ? NEUTRAL_STYLE : i % 2 === 0 ? PRIMARY_STYLE : ACCENT_STYLE
                return (
                  <Reveal key={category.id} delay={i * 60} className="shrink-0 snap-start">
                    <Link
                      href={`/negocios?type=${category.slug}`}
                      className="group flex h-32 w-28 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:h-36 sm:w-32"
                    >
                      <div className={cn('flex size-14 shrink-0 items-center justify-center rounded-full transition-colors', style)}>
                        <Icon className="size-6" aria-hidden="true" strokeWidth={1.5} />
                      </div>
                      <span className="line-clamp-2 text-xs font-semibold leading-tight text-foreground group-hover:text-primary">
                        {category.name}
                      </span>
                    </Link>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── Destacados ───────────────────────────────────────── */}
      {featuredList.length > 0 && (
        <section className="py-12">
          <div className="mx-auto max-w-5xl">
            <Reveal className="mb-5 flex items-center gap-2 px-4">
              <Star className="size-5 fill-accent text-accent" aria-hidden="true" />
              <h2 className="text-lg font-bold text-foreground">{copy.featured.title}</h2>
            </Reveal>
            <FeaturedCarousel>
              {featuredList.map((b) => (
                <FeaturedCard key={b.id} business={b} />
              ))}
            </FeaturedCarousel>
          </div>
        </section>
      )}

      {/* ── Imperdibles ──────────────────────────────────────── */}
      {placesList.length > 0 && (
        <section className="bg-muted/30 py-12">
          <div className="mx-auto max-w-5xl px-4">
            <Reveal className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-lg font-bold text-foreground">{copy.placesPreview.title}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{copy.placesPreview.subtitle}</p>
              </div>
              <Link
                href="/lugares"
                className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                {copy.placesPreview.viewAll}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </Reveal>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {placesList.map((place, i) => (
                <Reveal key={place.id} delay={i * 80}>
                  <PlaceCard place={place} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Únete a ManTur ───────────────────────────────────── */}
      {/* Accent-forward on purpose: every other section on the page leans
          green, and this is the one CTA whose whole job is to stand out —
          also keeps it visually distinct from the dark footer right below. */}
      <section className="relative overflow-hidden bg-accent px-4 pb-16 pt-24">
        <div className="pointer-events-none absolute top-10 -left-12 size-64 rounded-full bg-white/20" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 size-72 rounded-full bg-[#0a2b1e]/10 blur-2xl" />

        {/* Mountain skyline connecting down from "Imperdibles" above — a
            crisp shape instead of a blurred fade between two flat colors.
            Same silhouette technique already used on /negocios' hero. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-20 w-full text-muted"
          viewBox="0 0 1200 90"
          preserveAspectRatio="none"
        >
          <path
            d="M0,0 L0,30 L120,70 L220,30 L320,52 L400,30 L520,78 L620,30 L720,48
               L820,30 L920,60 L1020,30 L1120,50 L1200,30 L1200,0 Z"
            fill="currentColor"
          />
        </svg>

        <div className="relative mx-auto max-w-3xl text-center">
          <Reveal className="duration-300">
            <span className="inline-block rounded-full bg-[#0a2b1e] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white">
              ¿Eres parte de Manaure?
            </span>
            <h2 className="mt-4 text-2xl font-extrabold leading-tight text-accent-foreground sm:text-3xl">
              Súmate como negocio, guía o transportador
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-accent-foreground/80 sm:text-base">
              ManTur conecta turistas con la gente que hace posible el turismo en Manaure. Publica tu negocio, ofrece transporte o comparte lo que sabes como guía.
            </p>
          </Reveal>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {JOIN_ROLES.map(({ key, Icon }, i) => {
              const card = roleRequestsCopy.roleCards[key]
              return (
                <Reveal key={key} delay={i * 70} className="duration-300">
                  <div className="flex h-full flex-col items-center gap-2 rounded-2xl bg-white/90 p-5 text-center shadow-sm backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg hover:bg-white">
                    <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{card.hook}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={210} className="duration-300">
            <Link
              href="/solicitar-rol"
              className="group mt-8 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#0a2b1e] px-7 text-sm font-bold text-white shadow-lg transition-all duration-200 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:bg-[#0a2b1e]/90 hover:shadow-xl active:scale-[0.98]"
            >
              {landingCopy.nav.joinMantur}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  )
}

function FeaturedCard({ business }: { business: FeaturedBusiness }) {
  const copy = landingCopy.featured
  const imageUrl = business.images?.[0]

  return (
    <Link
      href={`/negocios/${business.slug}`}
      data-carousel-item
      className="group block w-72 shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl active:scale-[0.98]"
    >
      <div className="relative h-48 overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={business.name}
            fill
            sizes="288px"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 dark:from-primary/20 dark:to-primary/10">
            <Store className="size-10 text-primary/40" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground shadow">
          <Star className="size-3 fill-current" aria-hidden="true" />
          {copy.badge}
        </span>
        <p className="absolute bottom-3 left-4 right-4 line-clamp-1 text-lg font-bold text-white drop-shadow">
          {business.name}
        </p>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {business.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{business.description}</p>
        )}
        <div className="flex items-center justify-between">
          {business.address ? (
            <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-primary">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{business.address}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
            Ver más <ArrowRight className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  )
}

function PlaceCard({ place }: { place: PlacePreview }) {
  const Icon = PLACE_TYPE_ICONS[place.type] ?? TreePine
  const imageUrl = place.images?.[0]

  return (
    <Link
      href={`/lugares/${place.slug}`}
      className="group flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-primary/10">
        {imageUrl ? (
          <Image src={imageUrl} alt={place.name} fill sizes="64px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon className="size-6 text-primary" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
          {place.name}
        </h3>
        {place.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{place.description}</p>
        )}
      </div>
    </Link>
  )
}
