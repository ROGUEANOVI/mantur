import Link from 'next/link'
import Image from 'next/image'
import { TreePine, Droplets, Eye, Waves, Trees, MapPin, Landmark } from 'lucide-react'
import FavoriteButton from '@/components/shared/FavoriteButton'
import { businessesCopy } from '@/lib/copy/businesses'

export type PlaceCardRow = {
  id: string
  slug: string
  name: string
  description: string | null
  type: string
  images: string[] | null
}

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

export default function PlaceCard({
  place,
  isFavorited,
  isGuest,
  compact = false,
}: {
  place: PlaceCardRow
  isFavorited: boolean
  isGuest: boolean
  // Small horizontal thumbnail+text row instead of the full vertical card —
  // for secondary "related content" rails (e.g. similar places on a place
  // page) where a full-size image would out-compete the page's own mosaic
  // for attention. The main listing grids keep the default.
  compact?: boolean
}) {
  const copy = businessesCopy.places
  const imageUrl = place.images?.[0]
  const typeLabel = copy.types[place.type] ?? copy.types.other
  const Icon = TYPE_ICONS[place.type as PlaceType] ?? TreePine

  if (compact) {
    return (
      <div className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-2 shadow-sm hover:shadow-md has-[a:active]:scale-[0.98] transition-all">
        <Link
          href={`/lugares/${place.slug}`}
          className="absolute inset-0 z-0"
          aria-label={place.name}
        >
          <span className="sr-only">{place.name}</span>
        </Link>

        <div className="relative size-16 shrink-0 rounded-lg overflow-hidden pointer-events-none">
          {imageUrl ? (
            <Image src={imageUrl} alt={place.name} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-primary/30 flex items-center justify-center">
              <Icon className="size-6 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
          <p className="text-xs font-medium text-primary line-clamp-1">{typeLabel}</p>
          <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
            {place.name}
          </h3>
          {place.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{place.description}</p>
          )}
        </div>

        <FavoriteButton
          entityType="place"
          entityId={place.id}
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
        href={`/lugares/${place.slug}`}
        className="absolute inset-0 z-0"
        aria-label={place.name}
      >
        <span className="sr-only">{place.name}</span>
      </Link>

      {/* pointer-events-none lets clicks fall through to the background Link
          above (image needs `relative` for next/image `fill`, which would
          otherwise intercept them); the favorite button opts back in. */}
      <div className="relative aspect-[4/3] pointer-events-none">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={place.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-primary/30 flex items-center justify-center">
            <Icon className="size-12 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
        <FavoriteButton
          entityType="place"
          entityId={place.id}
          initialFavorited={isFavorited}
          isGuest={isGuest}
          className="pointer-events-auto absolute top-3 right-3 z-10"
        />
      </div>

      <div className="relative z-10 p-4 space-y-1.5 pointer-events-none">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          <MapPin className="size-3" aria-hidden="true" />
          {typeLabel}
        </span>
        <h3 className="font-semibold text-foreground text-base leading-snug line-clamp-1">
          {place.name}
        </h3>
        {place.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {place.description}
          </p>
        )}
      </div>
    </div>
  )
}
