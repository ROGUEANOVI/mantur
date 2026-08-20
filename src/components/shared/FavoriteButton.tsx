'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { toggleFavorite, type FavoriteEntityType } from '@/app/actions/favorites'
import { favoritesCopy } from '@/lib/copy/favorites'
import { cn } from '@/lib/utils'

const ICON_CLASS = 'size-4'

// "overlay" sits on a photo (card thumbnails, gallery) so it needs its own
// dark backdrop and a white idle icon to stay legible over any image.
// "solid" sits directly on the page background (detail-page header, next to
// the title) where that backdrop would look like a stray dark chip instead.
type Variant = 'overlay' | 'solid'

const VARIANT_CLASS: Record<Variant, string> = {
  overlay: 'bg-black/40 hover:bg-black/60',
  solid: 'bg-muted hover:bg-muted/70',
}

const IDLE_ICON_CLASS: Record<Variant, string> = {
  overlay: 'text-white',
  solid: 'text-foreground',
}

export default function FavoriteButton({
  entityType,
  entityId,
  initialFavorited,
  isGuest,
  variant = 'overlay',
  className,
}: {
  entityType: FavoriteEntityType
  entityId: string
  initialFavorited: boolean
  isGuest: boolean
  variant?: Variant
  className?: string
}) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [isPending, startTransition] = useTransition()
  const copy = favoritesCopy.button

  if (isGuest) {
    return (
      <Link
        href="/login"
        aria-label={copy.loginToSave}
        className={cn(
          'flex items-center justify-center size-9 rounded-full text-white transition-colors',
          VARIANT_CLASS[variant],
          className,
        )}
      >
        <Heart className={cn(ICON_CLASS, IDLE_ICON_CLASS[variant])} aria-hidden="true" />
      </Link>
    )
  }

  function handleClick() {
    const next = !favorited
    setFavorited(next) // optimistic — reverted below if the action reports an error
    startTransition(async () => {
      const result = await toggleFavorite(entityType, entityId)
      if ('error' in result) setFavorited(!next)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={favorited}
      aria-label={favorited ? copy.remove : copy.add}
      className={cn(
        'flex items-center justify-center size-9 rounded-full transition-colors disabled:opacity-70',
        VARIANT_CLASS[variant],
        className,
      )}
    >
      <Heart
        className={cn(ICON_CLASS, favorited ? 'text-rose-500 fill-rose-500' : IDLE_ICON_CLASS[variant])}
        aria-hidden="true"
      />
    </button>
  )
}
