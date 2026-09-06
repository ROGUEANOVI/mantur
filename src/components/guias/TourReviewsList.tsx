import { Star } from 'lucide-react'

export type TourReview = { rating: number; comment: string | null; created_at: string }

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Deliberately anonymous — no page in this app exposes a tourist's name
// publicly, same reasoning that kept `phone` out of any public join.
// Renders nothing when empty — TourRatingSummary next to the tour title
// already communicates "no reviews yet" once, no need to repeat it here.
export default function TourReviewsList({ reviews }: { reviews: TourReview[] }) {
  if (reviews.length === 0) return null

  return (
    <ul className="space-y-2 border-t border-border pt-3">
      {reviews.map((review, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, starIndex) => (
              <Star
                key={starIndex}
                className={`size-3.5 ${starIndex < review.rating ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`}
                aria-hidden="true"
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">{formatReviewDate(review.created_at)}</span>
          </div>
          {review.comment && <p className="text-sm text-muted-foreground mt-0.5">{review.comment}</p>}
        </li>
      ))}
    </ul>
  )
}
