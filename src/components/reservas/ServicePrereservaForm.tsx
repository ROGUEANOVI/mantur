'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

import { createServicePrereserva } from '@/app/(app)/reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'
import { CALENDAR_WEEKDAYS, CALENDAR_MONTHS, calendarActionLabels } from '@/lib/copy/calendar'
import { QUANTITY_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import BlockedDatesPicker from '@/components/shared/BlockedDatesPicker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Props = {
  serviceId: string
  price: number
  capacity: number | null
  pricingUnit: PricingUnit
  blockedDates: string[]
  // Same three-state access gate used by PackagePrereservaForm/the
  // pre-pivot TourBookingForm: 'tourist' renders the real form, 'guest'
  // points to /login, 'other_role' hides the whole thing.
  access: 'tourist' | 'guest' | 'other_role'
}

type FormState = { error: string } | undefined

const UNIT_SUFFIX: Record<PricingUnit, string> = {
  per_person: 'por persona',
  per_night: 'por noche',
  fixed: 'precio fijo',
}

async function prereservaFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await createServicePrereserva(formData)) ?? undefined
}

export default function ServicePrereservaForm({ serviceId, price, capacity, pricingUnit, blockedDates, access }: Props) {
  if (access === 'other_role') return null

  if (access === 'guest') {
    return (
      <Link
        href="/login"
        className="inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors"
      >
        {bookingsCopy.form.loginToRequestService}
      </Link>
    )
  }

  return (
    <PrereservaFormFields
      serviceId={serviceId}
      price={price}
      capacity={capacity}
      pricingUnit={pricingUnit}
      blockedDates={blockedDates}
    />
  )
}

function PrereservaFormFields({
  serviceId,
  price,
  capacity,
  pricingUnit,
  blockedDates,
}: Omit<Props, 'access'>) {
  const [quantity, setQuantity] = useState(1)

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    prereservaFormAction,
    undefined,
  )

  const total = pricingUnit === 'fixed' ? price : price * quantity

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  function handleQuantityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 1) {
      const capped = capacity !== null ? Math.min(val, capacity) : val
      setQuantity(capped)
    }
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="service_id" value={serviceId} />

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
        <Label htmlFor="prereserva-quantity" className="text-sm font-medium">
          {QUANTITY_LABELS[pricingUnit]}
        </Label>
        <input
          id="prereserva-quantity"
          type="number"
          name="quantity"
          min="1"
          max={capacity ?? undefined}
          value={quantity}
          onChange={handleQuantityChange}
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
          {pricingUnit === 'fixed'
            ? UNIT_SUFFIX.fixed
            : `$${price.toLocaleString('es-CO')} × ${quantity} ${UNIT_SUFFIX[pricingUnit]}`}
        </p>
      </div>

      <Button type="submit" className="w-full rounded-xl min-h-11" disabled={isPending}>
        {isPending ? bookingsCopy.form.serviceSubmitting : bookingsCopy.form.serviceSubmit}
      </Button>
    </form>
  )
}
