import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Store } from 'lucide-react'
import FavoriteButton from '@/components/shared/FavoriteButton'

type CategoryLink = {
  business_categories: { name: string; slug: string } | null
}

export type BusinessCardRow = {
  id: string
  slug: string
  name: string
  description: string | null
  images: string[] | null
  address: string | null
  business_category_links: CategoryLink[]
}

export default function BusinessCard({
  business,
  isFavorited,
  isGuest,
  compact = false,
}: {
  business: BusinessCardRow
  isFavorited: boolean
  isGuest: boolean
  // Small horizontal thumbnail+text row instead of the full vertical card —
  // for secondary "related content" rails (e.g. nearby businesses on a
  // place page) where a full-size image would out-compete the page's own
  // mosaic for attention. The main listing grids keep the default.
  compact?: boolean
}) {
  const imageUrl = business.images?.[0]
  const categoryNames = business.business_category_links
    .map((l) => l.business_categories?.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 2)

  if (compact) {
    return (
      <div className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-2 shadow-sm hover:shadow-md has-[a:active]:scale-[0.98] transition-all">
        <Link
          href={`/negocios/${business.slug}`}
          className="absolute inset-0 z-0"
          aria-label={business.name}
        >
          <span className="sr-only">{business.name}</span>
        </Link>

        <div className="relative size-16 shrink-0 rounded-lg overflow-hidden pointer-events-none">
          {imageUrl ? (
            <Image src={imageUrl} alt={business.name} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Store className="size-6 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
          {categoryNames.length > 0 && (
            <p className="text-xs font-medium text-accent line-clamp-1">{categoryNames[0]}</p>
          )}
          <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
            {business.name}
          </h3>
          {business.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{business.description}</p>
          )}
        </div>

        <FavoriteButton
          entityType="business"
          entityId={business.id}
          initialFavorited={isFavorited}
          isGuest={isGuest}
          variant="solid"
          className="pointer-events-auto relative z-10 size-8 shrink-0"
        />
      </div>
    )
  }

  return (
    <div className="group relative h-full rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 has-[a:active]:scale-[0.98] transition-all">
      <Link
        href={`/negocios/${business.slug}`}
        className="absolute inset-0 z-0"
        aria-label={business.name}
      >
        <span className="sr-only">{business.name}</span>
      </Link>

      {/* pointer-events-none lets clicks fall through to the background Link
          above (image needs `relative` for next/image `fill`, which would
          otherwise intercept them); the favorite button opts back in. */}
      <div className="relative aspect-[4/3] pointer-events-none">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={business.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Store className="size-12 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
        <FavoriteButton
          entityType="business"
          entityId={business.id}
          initialFavorited={isFavorited}
          isGuest={isGuest}
          className="pointer-events-auto absolute top-3 right-3 z-10"
        />
      </div>

      <div className="relative z-10 p-4 space-y-1.5 pointer-events-none">
        {categoryNames.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {categoryNames.map((name) => (
              <span key={name} className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {name}
              </span>
            ))}
          </div>
        )}
        <h3 className="font-semibold text-foreground text-base leading-snug line-clamp-1">
          {business.name}
        </h3>
        {business.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {business.description}
          </p>
        )}
        {business.address && (
          <div className="flex items-center gap-1 pt-1">
            <MapPin className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted-foreground line-clamp-1">{business.address}</span>
          </div>
        )}
      </div>
    </div>
  )
}
