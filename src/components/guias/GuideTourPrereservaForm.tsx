'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

import { createGuideTourPrereserva } from '@/app/(app)/reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'
import { CALENDAR_WEEKDAYS, CALENDAR_MONTHS, calendarActionLabels } from '@/lib/copy/calendar'
import BlockedDatesPicker from '@/components/shared/BlockedDatesPicker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Props = {
  tourId: string
  price: number
  capacity: number
  blockedDates: string[]
  // Same three-state access gate used by PackagePrereservaForm/
  // ServicePrereservaForm: 'tourist' renders the real form, 'guest' points
  // to /login, 'other_role' hides the whole thing.
  access: 'tourist' | 'guest' | 'other_role'
}

type FormState = { error: string } | undefined

async function prereservaFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await createGuideTourPrereserva(formData)) ?? undefined
}

export default function GuideTourPrereservaForm({ tourId, price, capacity, blockedDates, access }: Props) {
  if (access === 'other_role') return null

  if (access === 'guest') {
    return (
      <Link
        href="/login"
        className="inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors"
      >
        {bookingsCopy.form.loginToRequestGuideTour}
      </Link>
    )
  }

  return <PrereservaFormFields tourId={tourId} price={price} capacity={capacity} blockedDates={blockedDates} />
}

function PrereservaFormFields({
  tourId,
  price,
  capacity,
  blockedDates,
}: Omit<Props, 'access'>) {
  const [peopleCount, setPeopleCount] = useState(1)

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    prereservaFormAction,
    undefined,
  )

  const total = price * peopleCount

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  function handlePeopleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 1) {
      setPeopleCount(Math.min(val, capacity))
    }
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="guide_tour_id" value={tourId} />

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{bookingsCopy.form.date}</Label>
        <p className="text-xs text-muted-foreground">{bookingsCopy.form.selectDatePrompt}</p>
        <BlockedDatesPicker
          name="booking_date"
          blockedDates={blockedDates}
          copy={{ ...calendarActionLabels, weekdays: CALENDAR_WEEKDAYS, months: CALENDAR_MONTHS }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prereserva-people" className="text-sm font-medium">
          {bookingsCopy.form.quantity}
        </Label>
        <input
          id="prereserva-people"
          type="number"
          name="people_count"
          min="1"
          max={capacity}
          value={peopleCount}
          onChange={handlePeopleChange}
          className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prereserva-notes" className="text-sm font-medium">
          {bookingsCopy.form.notesLabel}
        </Label>
        <textarea
          id="prereserva-notes"
          name="notes"
          rows={3}
          placeholder={bookingsCopy.form.notesPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{bookingsCopy.form.totalLabel}</span>
          <span className="text-base font-semibold text-primary">${total.toLocaleString('es-CO')} COP</span>
        </div>
        <p className="text-xs text-muted-foreground">
          ${price.toLocaleString('es-CO')} × {peopleCount} persona{peopleCount === 1 ? '' : 's'}
        </p>
      </div>

      <Button type="submit" className="w-full rounded-xl min-h-11" disabled={isPending}>
        {isPending ? bookingsCopy.form.guideTourSubmitting : bookingsCopy.form.guideTourSubmit}
      </Button>
    </form>
  )
}
