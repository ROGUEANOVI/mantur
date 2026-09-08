'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { transportCopy } from '@/lib/copy/transport'

type ActionResult = { error: string } | { success: true } | void

type Props = {
  action: (formData: FormData) => Promise<ActionResult>
  initialValues?: {
    origin: string
    destination: string
    allows_one_way: boolean
    allows_round_trip: boolean
    price_one_way_cents: number | null
    price_round_trip_cents: number | null
    estimated_duration_minutes: number | null
    notes: string | null
  }
}

type FormState = { error: string } | { success: true } | undefined

export default function RouteForm({ action, initialValues }: Props) {
  const router = useRouter()
  const copy = transportCopy.routes.form
  const [allowsOneWay, setAllowsOneWay] = useState(initialValues?.allows_one_way ?? true)
  const [allowsRoundTrip, setAllowsRoundTrip] = useState(initialValues?.allows_round_trip ?? false)

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await action(formData)
    if (result && 'error' in result) return { error: result.error }
    if (result && 'success' in result) return { success: true }
    return undefined
  }, undefined)

  useEffect(() => {
    if (state && 'error' in state) toast.error(state.error)
    if (state && 'success' in state) {
      toast.success(transportCopy.routes.saved)
      router.push('/mi-perfil-transporte/rutas')
    }
  }, [state, router])

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="origin" className="block text-sm font-medium text-foreground mb-1.5">
          {copy.origin} <span aria-hidden="true" className="text-destructive">*</span>
        </label>
        <input
          id="origin"
          name="origin"
          type="text"
          required
          defaultValue={initialValues?.origin}
          placeholder={copy.originPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label htmlFor="destination" className="block text-sm font-medium text-foreground mb-1.5">
          {copy.destination} <span aria-hidden="true" className="text-destructive">*</span>
        </label>
        <input
          id="destination"
          name="destination"
          type="text"
          required
          defaultValue={initialValues?.destination}
          placeholder={copy.destinationPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="space-y-2">
        <p className="block text-sm font-medium text-foreground">{copy.modalitiesLabel}</p>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="allows_one_way"
            checked={allowsOneWay}
            onChange={(e) => setAllowsOneWay(e.target.checked)}
            className="size-4 rounded border-input"
          />
          {copy.allowOneWay}
        </label>
        {allowsOneWay && (
          <div className="pl-6">
            <label htmlFor="price_one_way" className="block text-xs font-medium text-muted-foreground mb-1">
              {copy.priceOneWay}
            </label>
            <input
              id="price_one_way"
              name="price_one_way"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              defaultValue={initialValues?.price_one_way_cents ? initialValues.price_one_way_cents / 100 : ''}
              placeholder={copy.priceOneWayPlaceholder}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="allows_round_trip"
            checked={allowsRoundTrip}
            onChange={(e) => setAllowsRoundTrip(e.target.checked)}
            className="size-4 rounded border-input"
          />
          {copy.allowRoundTrip}
        </label>
        {allowsRoundTrip && (
          <div className="pl-6">
            <label htmlFor="price_round_trip" className="block text-xs font-medium text-muted-foreground mb-1">
              {copy.priceRoundTrip}
            </label>
            <input
              id="price_round_trip"
              name="price_round_trip"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              defaultValue={initialValues?.price_round_trip_cents ? initialValues.price_round_trip_cents / 100 : ''}
              placeholder={copy.priceRoundTripPlaceholder}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">{copy.pricingHint}</p>
      </div>

      <div>
        <label htmlFor="estimated_duration_minutes" className="block text-sm font-medium text-foreground mb-1.5">
          {copy.duration}
        </label>
        <input
          id="estimated_duration_minutes"
          name="estimated_duration_minutes"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          defaultValue={initialValues?.estimated_duration_minutes ?? ''}
          placeholder={copy.durationPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">
          {copy.notes}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initialValues?.notes ?? ''}
          placeholder={copy.notesPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold text-sm min-h-11 px-6 hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? copy.submitting : copy.submit}
      </button>
    </form>
  )
}
