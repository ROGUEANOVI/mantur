'use client'

import { useActionState, useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { createServiceReview } from '@/app/(app)/mis-reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'

type FormState = { error: string } | { success: true } | undefined

async function createServiceReviewFormAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return await createServiceReview(formData)
}

// Calco de src/components/guias/LeaveReviewForm.tsx.
export default function LeaveServiceReviewForm({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [state, action, isPending] = useActionState<FormState, FormData>(createServiceReviewFormAction, undefined)
  const copy = bookingsCopy.serviceReview

  const isSuccess = state && 'success' in state
  const errorMsg = state && 'error' in state ? state.error : null

  useEffect(() => {
    if (errorMsg) toast.error(errorMsg)
    else if (isSuccess) {
      toast.success(copy.submitted)
      setOpen(false)
      setRating(0)
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
    <form action={action} className="w-full space-y-2 pt-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />

      <p className="text-xs font-medium text-foreground">{copy.ratingLabel}</p>
      <div className="flex gap-1" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            onMouseEnter={() => setHoverRating(value)}
            aria-label={`${value}`}
            className="cursor-pointer"
          >
            <Star
              className={`size-6 ${value <= (hoverRating || rating) ? 'fill-accent text-accent' : 'text-muted-foreground/30'}`}
            />
          </button>
        ))}
      </div>

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
