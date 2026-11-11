import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronRight, Compass, Package, Users } from 'lucide-react'
import { packagesCopy } from '@/lib/copy/packages'
import { cn } from '@/lib/utils'
import Reveal from '@/components/shared/Reveal'
import WhatsappButton from '@/components/shared/WhatsappButton'
import { packagePriceParts } from '@/lib/packages/price'

export type ShowcasePackage = {
  id: string
  slug: string
  name: string
  description: string | null
  // Structured 1-2 sentence pitch; preferred over the long description.
  summary?: string | null
  base_price: number | string
  pricing_unit: string
  capacity: number | null
  images: string[] | null
  is_featured: boolean
}

// One desktop row of equal cards. Every package gets the same weight on
// purpose — order (is_featured, sort_order) decides position, never size.
export const MAX_SHOWCASE_PACKAGES = 4

// Home page's first section: ManTur's own packages, which are what actually
// sells today. Packages arrive already ordered (is_featured, sort_order,
// name).
//
// Mobile: a horizontal snap carousel of equal photo cards, each peeking the
// next. Desktop: the same cards in a 4-column row. The "a tu medida" banner
// sits below both. CSS-only — no client JS needed for either layout.
export default function PackageShowcase({ packages }: { packages: ShowcasePackage[] }) {
  const copy = packagesCopy.showcase
  const shown = packages.slice(0, MAX_SHOWCASE_PACKAGES)

  if (shown.length === 0) return null

  return (
    <section aria-labelledby="package-showcase-title" className="relative -mt-14 px-4">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2
              id="package-showcase-title"
              className="text-balance text-xl font-extrabold leading-tight text-foreground sm:text-2xl"
            >
              {copy.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          <Link
            href="/paquetes"
            className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {copy.viewAll}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Reveal>

        <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
          {shown.map((pkg, i) => (
            <li key={pkg.id} className="w-[78%] max-w-[20rem] shrink-0 snap-start lg:w-auto lg:max-w-none">
              <Reveal delay={i * 70} className="h-full">
                <ShowcaseCard pkg={pkg} priority={i === 0} />
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal delay={shown.length * 70} className="mt-4">
          <CustomPackageBanner />
        </Reveal>
      </div>
    </section>
  )
}

function ShowcaseCard({ pkg, priority }: { pkg: ShowcasePackage; priority: boolean }) {
  const copy = packagesCopy.showcase
  const imageUrl = pkg.images?.[0]
  const price = packagePriceParts(pkg.base_price, pkg.pricing_unit)

  return (
    <article
      className="group relative isolate flex aspect-[4/5] h-full flex-col justify-end overflow-hidden rounded-2xl bg-primary shadow-md transition-shadow duration-300 hover:shadow-xl"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 248px, 78vw"
          priority={priority}
          className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 -z-10 flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
          <Package className="size-14 text-primary-foreground/30" aria-hidden="true" strokeWidth={1.5} />
        </div>
      )}
      {/* Scrim tall enough to keep white text ≥4.5:1 over any photo. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/0" />

      {/* Mouse/touch convenience: the whole card opens the detail page.
          Hidden from assistive tech and the tab order — the visible
          "Ver paquete" button below is the accessible link. */}
      <Link
        href={`/paquetes/${pkg.slug}`}
        className="absolute inset-0 z-0"
        aria-hidden="true"
        tabIndex={-1}
      />

      {pkg.is_featured && (
        <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground shadow">
          {copy.recommended}
        </span>
      )}

      <div className="pointer-events-none relative z-10 flex flex-col gap-3 p-4">
        <div className="space-y-1.5">
          <h3 className="line-clamp-2 text-balance text-lg font-bold leading-snug text-white">
            {pkg.name}
          </h3>
          {(pkg.summary ?? pkg.description) && (
            <p className="line-clamp-2 text-sm text-white/80">{pkg.summary ?? pkg.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-white">
            <span className="mr-1 text-xs text-white/75">{price.from}</span>
            <span className="text-xl font-extrabold tabular-nums">{price.amount}</span>
            {price.unit && <span className="ml-1.5 text-xs text-white/75">{price.unit}</span>}
          </p>
          {pkg.capacity != null && (
            <span className="flex items-center gap-1 text-xs text-white/75">
              <Users className="size-3.5 shrink-0" aria-hidden="true" />
              {copy.capacity(pkg.capacity)}
            </span>
          )}
        </div>

        {/* Detail first: visitors should see what the package includes
            before jumping to a chat. WhatsApp stays one tap away for those
            already decided. */}
        <div className="flex items-center gap-2">
          <Link
            href={`/paquetes/${pkg.slug}`}
            aria-label={`${copy.viewDetail}: ${pkg.name}`}
            className={cn(
              'pointer-events-auto inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-foreground shadow-md transition-colors hover:bg-white/90 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40',
            )}
          >
            {copy.viewDetail}
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
          <WhatsappButton
            message={packagesCopy.whatsapp.message(pkg.name, pkg.slug)}
            label={packagesCopy.whatsapp.cta}
            tracking={{
              paquete_id: pkg.slug,
              paquete_nombre: pkg.name,
              value: Number(pkg.base_price),
              currency: 'COP',
              ubicacion: 'home_showcase',
            }}
            iconOnly
            className="pointer-events-auto shadow-md"
          />
        </div>
      </div>
    </article>
  )
}

function CustomPackageBanner() {
  const copy = packagesCopy.showcase

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-primary p-5 shadow-md sm:flex-row sm:items-center sm:gap-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
        <Compass className="size-5 text-primary-foreground" aria-hidden="true" strokeWidth={1.5} />
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-lg font-bold leading-snug text-primary-foreground">{copy.customTitle}</h3>
        <p className="text-sm text-primary-foreground/80">{copy.customBody}</p>
      </div>
      <WhatsappButton
        message={packagesCopy.whatsapp.customMessage}
        label={copy.customCta}
        tracking={{ ubicacion: 'home_custom_package' }}
        className="shadow-md sm:w-auto sm:shrink-0 sm:px-6"
      />
    </div>
  )
}
