'use client'

import { useActionState, useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { createPackageReview } from '@/app/(app)/mis-reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'

type FormState = { error: string } | { success: true } | undefined

type PackageItem = { id: string; label: string }

async function createPackageReviewFormAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return await createPackageReview(formData)
}

function StarRow({
  value,
  hoverValue,
  onSelect,
  onHover,
  onHoverEnd,
  ariaLabel,
}: {
  value: number
  hoverValue: number
  onSelect: (v: number) => void
  onHover: (v: number) => void
  onHoverEnd: () => void
  // Distinguishes each row's 5 star buttons from every other row's — this
  // form can render one global row plus one row per package_item, all on
  // the same page, so a bare "4" label would be ambiguous across rows.
  ariaLabel: (v: number) => string
}) {
  return (
    <div className="flex gap-1" onMouseLeave={onHoverEnd}>
      {[1, 2, 3, 4, 5].map((v) => (
        <button key={v} type="button" onClick={() => onSelect(v)} onMouseEnter={() => onHover(v)} aria-label={ariaLabel(v)} className="cursor-pointer">
          <Star className={`size-5 ${v <= (hoverValue || value) ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
    </div>
  )
}

// Global rating (required) + an optional per-item rating row for each
// package_item — a tourist may rate the package overall without rating any
// individual item. Item ratings are collected into a JSON hidden field
// rather than N separate named inputs, since the item count is dynamic per
// package (see createPackageReview in src/app/(app)/mis-reservas/actions.ts).
export default function PackageLeaveReviewForm({ bookingId, items }: { bookingId: string; items: PackageItem[] }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [itemRatings, setItemRatings] = useState<Record<string, number>>({})
  const [hoveredItem, setHoveredItem] = useState<{ id: string; value: number } | null>(null)
  const [state, action, isPending] = useActionState<FormState, FormData>(createPackageReviewFormAction, undefined)
  const copy = bookingsCopy.packageReview

  const isSuccess = state && 'success' in state
  const errorMsg = state && 'error' in state ? state.error : null

  useEffect(() => {
    if (errorMsg) toast.error(errorMsg)
    else if (isSuccess) {
      toast.success(copy.submitted)
      setOpen(false)
      setRating(0)
      setItemRatings({})
    }
  }, [state])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
      >
        {copy.leaveReview}
      </button>
    )
  }

  return (
    <form action={action} className="w-full space-y-3 pt-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />
      <input
        type="hidden"
        name="item_ratings"
        value={JSON.stringify(Object.fromEntries(Object.entries(itemRatings).filter(([, v]) => v > 0)))}
      />

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">{copy.ratingLabel}</p>
        <StarRow
          value={rating}
          hoverValue={hoverRating}
          onSelect={setRating}
          onHover={setHoverRating}
          onHoverEnd={() => setHoverRating(0)}
          ariaLabel={(v) => `Calificación general: ${v}`}
        />
      </div>

      {items.length > 0 && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
          {items.map((item) => (
            <div key={item.id} className="space-y-0.5">
              <p className="text-xs text-muted-foreground truncate">{copy.itemRatingLabel(item.label)}</p>
              <StarRow
                value={itemRatings[item.id] ?? 0}
                hoverValue={hoveredItem?.id === item.id ? hoveredItem.value : 0}
                onSelect={(v) => setItemRatings((prev) => ({ ...prev, [item.id]: v }))}
                onHover={(v) => setHoveredItem({ id: item.id, value: v })}
                onHoverEnd={() => setHoveredItem(null)}
                ariaLabel={(v) => `${item.label}: ${v}`}
              />
            </div>
          ))}
        </div>
      )}

      <textarea
        name="comment"
        rows={2}
        maxLength={500}
        placeholder={copy.commentPlaceholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setRating(0)
            setItemRatings({})
          }}
          className="flex-1 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground text-xs font-medium min-h-8 hover:bg-muted transition-colors"
        >
          {copy.cancel}
        </button>
        <button
          type="submit"
          disabled={isPending || rating === 0}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-8 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? copy.submitting : copy.submit}
        </button>
      </div>
    </form>
  )
}
