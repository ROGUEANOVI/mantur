'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { createPackagePrereserva } from '@/app/(app)/reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'
import { QUANTITY_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  packageId: string
  price: number
  capacity: number | null
  pricingUnit: PricingUnit
  // Same three-state access gate used by the pre-pivot TourBookingForm:
  // 'tourist' renders the real form, 'guest' points to /login, 'other_role'
  // hides the whole thing (a business owner/admin account has no reason to
  // request a package).
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
  return (await createPackagePrereserva(formData)) ?? undefined
}

export default function PackagePrereservaForm({ packageId, price, capacity, pricingUnit, access }: Props) {
  if (access === 'other_role') return null

  if (access === 'guest') {
    return (
      <Link
        href="/login"
        className="inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors"
      >
        {bookingsCopy.form.loginToRequest}
      </Link>
    )
  }

  return <PrereservaFormFields packageId={packageId} price={price} capacity={capacity} pricingUnit={pricingUnit} />
}

function PrereservaFormFields({
  packageId,
  price,
  capacity,
  pricingUnit,
}: Omit<Props, 'access'>) {
  const today = new Date().toISOString().split('T')[0]
  const [quantity, setQuantity] = useState(1)

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    prereservaFormAction,
    undefined,
  )

  const total = pricingUnit === 'fixed' ? price : price * quantity

  function handleQuantityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 1) {
      const capped = capacity !== null ? Math.min(val, capacity) : val
      setQuantity(capped)
    }
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="package_id" value={packageId} />

      <div className="space-y-1.5">
        <Label htmlFor="prereserva-date" className="text-sm font-medium">
          {bookingsCopy.form.date}
        </Label>
        <Input id="prereserva-date" type="date" name="booking_date" min={today} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prereserva-quantity" className="text-sm font-medium">
          {QUANTITY_LABELS[pricingUnit]}
        </Label>
        <Input
          id="prereserva-quantity"
          type="number"
          name="quantity"
          min="1"
          max={capacity ?? undefined}
          value={quantity}
          onChange={handleQuantityChange}
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

      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full rounded-xl min-h-11" disabled={isPending}>
        {isPending ? bookingsCopy.form.packageSubmitting : bookingsCopy.form.packageSubmit}
      </Button>
    </form>
  )
}
