import { Star } from 'lucide-react'

type Props = {
  avgRating: number | null
  count: number
  noReviewsText: string
  reviewCountText: (count: number) => string
}

// Generic rating pill — the caller supplies its own copy strings so this
// works for both guide tours and packages (and any future reviewable
// entity) without duplicating this ~15-line component per surface.
export default function RatingSummary({ avgRating, count, noReviewsText, reviewCountText }: Props) {
  if (count === 0 || avgRating === null) {
    return <p className="text-xs text-muted-foreground">{noReviewsText}</p>
  }

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="size-3.5 fill-accent text-accent" aria-hidden="true" />
      <span className="font-medium text-foreground">{avgRating.toFixed(1)}</span>
      <span>({reviewCountText(count)})</span>
    </span>
  )
}
