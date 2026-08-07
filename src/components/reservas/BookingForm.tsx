'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { createBooking } from '@/app/(app)/reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  experienceId: string
  price: number
  capacity: number | null
  experienceName: string
}

type FormState = { error: string } | undefined

async function bookingFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await createBooking(formData)) ?? undefined
}

export default function BookingForm({
  experienceId,
  price,
  capacity,
}: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [peopleCount, setPeopleCount] = useState(1)

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    bookingFormAction,
    undefined,
  )

  const total = price * peopleCount

  function handlePeopleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 1) {
      const capped = capacity !== null ? Math.min(val, capacity) : val
      setPeopleCount(capped)
    }
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Hidden experience ID — never taken from the URL on the server */}
      <input type="hidden" name="experience_id" value={experienceId} />

      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor="booking-date" className="text-sm font-medium">
          {bookingsCopy.form.date}
        </Label>
        <Input
          id="booking-date"
          type="date"
          name="booking_date"
          min={today}
          required
        />
      </div>

      {/* People count */}
      <div className="space-y-1.5">
        <Label htmlFor="people-count" className="text-sm font-medium">
          {bookingsCopy.form.people}
        </Label>
        <Input
          id="people-count"
          type="number"
          name="people_count"
          min="1"
          max={capacity ?? undefined}
          value={peopleCount}
          onChange={handlePeopleChange}
        />
      </div>

      {/* Live total preview */}
      <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {bookingsCopy.form.totalLabel}
          </span>
          <span className="text-base font-semibold text-primary">
            ${total.toLocaleString('es-CO')} COP
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          ${price.toLocaleString('es-CO')} × {peopleCount}{' '}
          {bookingsCopy.form.perPerson}
        </p>
      </div>

      {/* Inline error */}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full rounded-xl min-h-11"
        disabled={isPending}
      >
        {isPending ? bookingsCopy.form.submitting : bookingsCopy.form.submit}
      </Button>

      {/* Cancel */}
      <Link
        href="/negocios"
        className="inline-flex w-full items-center justify-center min-h-11 text-sm text-primary underline-offset-4 hover:underline"
      >
        {bookingsCopy.form.cancel}
      </Link>
    </form>
  )
}
