import { Star } from 'lucide-react'
import { guidesCopy } from '@/lib/copy/guides'

export default function TourRatingSummary({ avgRating, count }: { avgRating: number | null; count: number }) {
  const copy = guidesCopy.profilePage

  if (count === 0 || avgRating === null) {
    return <p className="text-xs text-muted-foreground">{copy.noReviewsYet}</p>
  }

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="size-3.5 fill-accent text-accent" aria-hidden="true" />
      <span className="font-medium text-foreground">{avgRating.toFixed(1)}</span>
      <span>({copy.reviewCount(count)})</span>
    </span>
  )
}
