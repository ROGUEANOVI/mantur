'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { createGuideTourBooking } from '@/app/(app)/reservas/actions'
import { guidesCopy } from '@/lib/copy/guides'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type FormState = { error: string | null }

type BookingAccess = 'tourist' | 'guest' | 'other_role'

type Props = {
  guideTourId: string
  price: number
  access: BookingAccess
}

const copy = guidesCopy.bookingForm

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

export default function TourBookingForm({ guideTourId, price, access }: Props) {
  const router = useRouter()

  async function action(_prev: FormState, formData: FormData): Promise<FormState> {
    const result = await createGuideTourBooking(formData)
    if (result && 'error' in result) return { error: result.error }
    return { error: null }
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(action, { error: null })

  if (access === 'other_role') return null

  if (access === 'guest') {
    return (
      <button
        type="button"
        onClick={() => router.push('/login?next=' + encodeURIComponent(window.location.pathname))}
        className="inline-flex items-center justify-center w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors"
      >
        {copy.submit}
      </button>
    )
  }

  return (
    <form action={formAction} className="space-y-4 border-t border-border pt-4">
      <input type="hidden" name="guide_tour_id" value={guideTourId} />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`people-${guideTourId}`} className="text-sm font-medium">
            {copy.peopleCount}
          </Label>
          <Input
            id={`people-${guideTourId}`}
            type="number"
            name="people_count"
            defaultValue={1}
            min={1}
            required
            inputMode="numeric"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`date-${guideTourId}`} className="text-sm font-medium">
            {copy.bookingDate}
          </Label>
          <Input
            id={`date-${guideTourId}`}
            type="date"
            name="booking_date"
            defaultValue={today()}
            min={today()}
            required
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{copy.pricePerPerson}</span>
        <span className="font-semibold text-accent">
          ${price.toLocaleString('es-CO')} COP
        </span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`notes-${guideTourId}`} className="text-sm font-medium text-foreground flex items-center gap-1.5">
          {copy.notesLabel}
          <span className="text-xs text-muted-foreground font-normal">{copy.notesOptional}</span>
        </label>
        <textarea
          id={`notes-${guideTourId}`}
          name="notes"
          rows={2}
          placeholder={copy.notesPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      )}

      <Button
        type="submit"
        className="w-full rounded-xl min-h-11"
        disabled={pending}
      >
        {pending ? copy.submitting : copy.submit}
      </Button>
    </form>
  )
}
