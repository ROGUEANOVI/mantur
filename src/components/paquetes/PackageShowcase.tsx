import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronRight, Compass, Package, Users } from 'lucide-react'
import { packagesCopy } from '@/lib/copy/packages'
import { cn } from '@/lib/utils'
import Reveal from '@/components/shared/Reveal'
import WhatsappButton from '@/components/shared/WhatsappButton'

export type ShowcasePackage = {
  id: string
  slug: string
  name: string
  description: string | null
  base_price: number | string
  pricing_unit: string
  capacity: number | null
  images: string[] | null
  is_featured: boolean
}

// Lead card + three secondaries fill the desktop 4×2 grid exactly, with the
// "a tu medida" tile taking the last cell.
export const MAX_SHOWCASE_PACKAGES = 4

// Home page's first section: ManTur's own packages, which are what actually
// sells today. Packages arrive already ordered (is_featured, sort_order,
// name) — the first one is the lead card.
//
// Mobile: a horizontal snap carousel of tall photo cards, each peeking the
// next. Desktop: the lead card spans 2×2 of a 4-column grid, with the rest
// beside it. CSS-only — no client JS needed for either layout.
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

        <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:grid-rows-[repeat(2,15rem)] lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
          {shown.map((pkg, i) => {
            const isLead = i === 0
            return (
              <li
                key={pkg.id}
                className={cn(
                  'w-[82%] max-w-[22rem] shrink-0 snap-start lg:w-auto lg:max-w-none',
                  isLead && 'lg:col-span-2 lg:row-span-2',
                )}
              >
                <Reveal delay={i * 70} className="h-full">
                  <ShowcaseCard pkg={pkg} isLead={isLead} />
                </Reveal>
              </li>
            )
          })}

          <li className="w-[82%] max-w-[22rem] shrink-0 snap-start lg:w-auto lg:max-w-none">
            <Reveal delay={shown.length * 70} className="h-full">
              <CustomPackageTile />
            </Reveal>
          </li>
        </ul>
      </div>
    </section>
  )
}

function formatPrice(value: number | string) {
  return `$${Number(value).toLocaleString('es-CO')}`
}

function ShowcaseCard({ pkg, isLead }: { pkg: ShowcasePackage; isLead: boolean }) {
  const copy = packagesCopy.showcase
  const imageUrl = pkg.images?.[0]
  const unit = copy.unitSuffix[pkg.pricing_unit]

  return (
    <article
      className={cn(
        'group relative isolate flex aspect-[4/5] h-full flex-col justify-end overflow-hidden rounded-2xl bg-primary shadow-md transition-shadow duration-300 hover:shadow-xl lg:aspect-auto',
        'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background',
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes={isLead ? '(min-width: 1024px) 512px, 82vw' : '(min-width: 1024px) 256px, 82vw'}
          priority={isLead}
          className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 -z-10 flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
          <Package className="size-14 text-primary-foreground/30" aria-hidden="true" strokeWidth={1.5} />
        </div>
      )}
      {/* Scrim tall enough to keep white text ≥4.5:1 over any photo. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/0" />

      {/* Whole-card link sits under the content; the WhatsApp button opts
          back into pointer events above it (same pattern as PackageCard). */}
      <Link href={`/paquetes/${pkg.slug}`} className="absolute inset-0 z-0 focus:outline-none" aria-label={pkg.name}>
        <span className="sr-only">{pkg.name}</span>
      </Link>

      {pkg.is_featured && (
        <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground shadow">
          {copy.recommended}
        </span>
      )}

      <div className={cn('pointer-events-none relative z-10 flex flex-col gap-3 p-4', isLead && 'lg:gap-4 lg:p-6')}>
        <div className="space-y-1.5">
          <h3
            className={cn(
              'line-clamp-2 text-balance text-lg font-bold leading-snug text-white',
              isLead && 'text-xl lg:text-3xl lg:leading-tight',
            )}
          >
            {pkg.name}
          </h3>
          {isLead && pkg.description && (
            <p className="line-clamp-2 max-w-prose text-sm text-white/80">{pkg.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-white">
            <span className={cn('text-xl font-extrabold tabular-nums', isLead && 'lg:text-2xl')}>
              {formatPrice(pkg.base_price)}
            </span>
            {unit && <span className="ml-1.5 text-xs text-white/75">{unit}</span>}
          </p>
          {pkg.capacity != null && (
            <span className="flex items-center gap-1 text-xs text-white/75">
              <Users className="size-3.5 shrink-0" aria-hidden="true" />
              {copy.capacity(pkg.capacity)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <WhatsappButton
            message={packagesCopy.whatsapp.message(pkg.name)}
            label={isLead ? packagesCopy.whatsapp.cta : packagesCopy.whatsapp.ctaShort}
            className="pointer-events-auto w-auto whitespace-nowrap px-4 shadow-md"
          />
          {/* Only the desktop lead card has room for both; everywhere else
              the whole card is the link anyway. */}
          {isLead && (
            <span
              aria-hidden="true"
              className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-white lg:flex"
            >
              {copy.viewDetail}
              <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
      </div>
    </article>
  )
}

function CustomPackageTile() {
  const copy = packagesCopy.showcase

  return (
    <div className="flex aspect-[4/5] h-full flex-col justify-between gap-4 rounded-2xl bg-primary p-5 shadow-md lg:aspect-auto">
      <div className="flex size-11 items-center justify-center rounded-full bg-primary-foreground/15">
        <Compass className="size-5 text-primary-foreground" aria-hidden="true" strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-bold leading-snug text-primary-foreground">{copy.customTitle}</h3>
        <p className="text-sm text-primary-foreground/80">{copy.customBody}</p>
      </div>
      <WhatsappButton message={packagesCopy.whatsapp.customMessage} label={copy.customCta} className="shadow-md" />
    </div>
  )
}
