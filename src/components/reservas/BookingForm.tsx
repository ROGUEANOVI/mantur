'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

import { createBooking } from '@/app/(app)/reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'
import { QUANTITY_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  serviceId: string
  price: number
  capacity: number | null
  serviceName: string
  pricingUnit: PricingUnit
}

type FormState = { error: string } | undefined

const UNIT_SUFFIX: Record<PricingUnit, string> = {
  per_person: 'por persona',
  per_night: 'por noche',
  fixed: 'precio fijo',
}

async function bookingFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await createBooking(formData)) ?? undefined
}

export default function BookingForm({
  serviceId,
  price,
  capacity,
  pricingUnit,
}: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [quantity, setQuantity] = useState(1)

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    bookingFormAction,
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
      {/* Hidden service ID — never taken from the URL on the server */}
      <input type="hidden" name="service_id" value={serviceId} />

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

      {/* Quantity */}
      <div className="space-y-1.5">
        <Label htmlFor="quantity" className="text-sm font-medium">
          {QUANTITY_LABELS[pricingUnit]}
        </Label>
        <Input
          id="quantity"
          type="number"
          name="quantity"
          min="1"
          max={capacity ?? undefined}
          value={quantity}
          onChange={handleQuantityChange}
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
          {pricingUnit === 'fixed'
            ? `${UNIT_SUFFIX.fixed}`
            : `$${price.toLocaleString('es-CO')} × ${quantity} ${UNIT_SUFFIX[pricingUnit]}`}
        </p>
      </div>

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
