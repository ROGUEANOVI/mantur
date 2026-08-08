import Image from 'next/image'
import { cn, getInitials } from '@/lib/utils'

const SIZE_CLASSES = {
  sm: 'size-10 text-xs',
  md: 'size-14 text-sm',
  lg: 'size-20 text-xl',
} as const

const SIZE_PX = { sm: 40, md: 56, lg: 80 }

type Props = {
  name: string
  avatarUrl?: string | null
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

/**
 * Circular avatar for people (guides, transporters) — distinct from the
 * rectangular aspect-[4/3] treatment used for business/place photos.
 * Falls back to initials-on-primary when there's no avatar_url, matching
 * the convention already used in UserMenu/AvatarUploader.
 */
export default function Avatar({ name, avatarUrl, size = 'md', className }: Props) {
  const initials = getInitials(name) || '?'

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full bg-primary flex items-center justify-center font-semibold text-primary-foreground select-none',
        SIZE_CLASSES[size],
        className,
      )}
      aria-hidden="true"
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          fill
          sizes={`${SIZE_PX[size]}px`}
          className="object-cover"
        />
      ) : (
        initials
      )}
    </div>
  )
}
