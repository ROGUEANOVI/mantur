'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  searchTourists,
  getItemBlockedDates,
  createManualServiceBooking,
  createManualGuideTourBooking,
  type TouristSearchResult,
} from '@/app/(app)/admin/reservas/actions'
import { adminCopy } from '@/lib/copy/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import { CALENDAR_WEEKDAYS, CALENDAR_MONTHS, calendarActionLabels } from '@/lib/copy/calendar'
import { QUANTITY_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import BlockedDatesPicker from '@/components/shared/BlockedDatesPicker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export type ServiceOption = {
  id: string
  name: string
  base_price: number
  capacity: number | null
  service_types: { pricing_unit: PricingUnit } | null
  businesses: { id: string; name: string; status: string; verified: boolean }
}

export type GuideTourOption = {
  id: string
  name: string
  price: number
  capacity: number | null
  guide_id: string
  tourist_guides: { is_available: boolean; profiles: { full_name: string | null } | null } | null
}

type Props = {
  services: ServiceOption[]
  guideTours: GuideTourOption[]
}

type FormState = { error: string } | { success: true } | undefined

const copy = adminCopy.reservas

async function serviceFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return await createManualServiceBooking(formData)
}

async function guideTourFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return await createManualGuideTourBooking(formData)
}

export default function AdminManualBookingForm({ services, guideTours }: Props) {
  const [type, setType] = useState<'service' | 'guide_tour'>('service')

  const [touristQuery, setTouristQuery] = useState('')
  const [touristResults, setTouristResults] = useState<TouristSearchResult[]>([])
  const [selectedTourist, setSelectedTourist] = useState<TouristSearchResult | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedItemId, setSelectedItemId] = useState('')
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [quantity, setQuantity] = useState(1)

  const formRef = useRef<HTMLFormElement>(null)

  const [serviceState, serviceFormActionFn, serviceIsPending] = useActionState<FormState, FormData>(
    serviceFormAction,
    undefined,
  )
  const [tourState, tourFormActionFn, tourIsPending] = useActionState<FormState, FormData>(
    guideTourFormAction,
    undefined,
  )

  const state = type === 'service' ? serviceState : tourState
  const formAction = type === 'service' ? serviceFormActionFn : tourFormActionFn
  const isPending = type === 'service' ? serviceIsPending : tourIsPending

  useEffect(() => {
    if (!state) return
    if ('error' in state) {
      toast.error(state.error)
      return
    }
    toast.success(copy.success)
    formRef.current?.reset()
    setSelectedTourist(null)
    setTouristQuery('')
    setTouristResults([])
    setSelectedItemId('')
    setBlockedDates([])
    setQuantity(1)
  }, [state])

  function handleTouristQueryChange(value: string) {
    setTouristQuery(value)
    setSelectedTourist(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.trim().length < 2) {
      setTouristResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      const results = await searchTourists(value)
      setTouristResults(results)
    }, 300)
  }

  async function handleItemChange(itemId: string) {
    setSelectedItemId(itemId)
    setBlockedDates([])
    if (!itemId) return
    const dates = await getItemBlockedDates(type, itemId)
    setBlockedDates(dates)
  }

  function handleTypeChange(next: 'service' | 'guide_tour') {
    setType(next)
    setSelectedItemId('')
    setBlockedDates([])
    setQuantity(1)
  }

  const selectedService = type === 'service' ? services.find((s) => s.id === selectedItemId) : undefined
  const selectedTour = type === 'guide_tour' ? guideTours.find((t) => t.id === selectedItemId) : undefined
  const capacity = selectedService?.capacity ?? selectedTour?.capacity ?? null
  const price = selectedService?.base_price ?? selectedTour?.price ?? 0
  const pricingUnit: PricingUnit = selectedService?.service_types?.pricing_unit ?? 'per_person'
  const total = type === 'service' && pricingUnit === 'fixed' ? price : price * quantity
  const quantityLabel = type === 'service' ? QUANTITY_LABELS[pricingUnit] : bookingsCopy.form.quantity
  const quantityFieldName = type === 'service' ? 'quantity' : 'people_count'

  function handleQuantityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 1) {
      setQuantity(capacity !== null ? Math.min(val, capacity) : val)
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="tourist_id" value={selectedTourist?.id ?? ''} />
      {type === 'service' ? (
        <input type="hidden" name="service_id" value={selectedItemId} />
      ) : (
        <input type="hidden" name="guide_tour_id" value={selectedItemId} />
      )}

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{copy.typeLabel}</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleTypeChange('service')}
            className={`rounded-xl border px-3 py-2 text-sm font-medium min-h-11 transition-colors ${
              type === 'service'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-muted-foreground hover:bg-muted'
            }`}
          >
            {copy.typeService}
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('guide_tour')}
            className={`rounded-xl border px-3 py-2 text-sm font-medium min-h-11 transition-colors ${
              type === 'guide_tour'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-muted-foreground hover:bg-muted'
            }`}
          >
            {copy.typeGuideTour}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{copy.touristLabel}</Label>
        {selectedTourist ? (
          <div className="flex items-center justify-between rounded-xl border border-input bg-muted/50 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">{selectedTourist.full_name ?? '—'}</p>
              {selectedTourist.phone && (
                <p className="text-xs text-muted-foreground">{selectedTourist.phone}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedTourist(null)}
              className="text-sm text-primary hover:underline cursor-pointer"
            >
              {copy.touristChange}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <input
              type="text"
              value={touristQuery}
              onChange={(e) => handleTouristQueryChange(e.target.value)}
              placeholder={copy.touristSearchPlaceholder}
              className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            {touristQuery.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">{copy.touristSearchHint}</p>
            ) : touristResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">{copy.touristNoResults}</p>
            ) : (
              <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                {touristResults.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTourist(t)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
                    >
                      <span className="font-medium text-foreground">{t.full_name ?? '—'}</span>
                      {t.phone && <span className="text-muted-foreground"> · {t.phone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {type === 'service' ? (
        <div className="space-y-1.5">
          <Label htmlFor="admin-service-select" className="text-sm font-medium">
            {copy.serviceLabel}
          </Label>
          <select
            id="admin-service-select"
            value={selectedItemId}
            onChange={(e) => handleItemChange(e.target.value)}
            className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="" disabled>
              {copy.servicePlaceholder}
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.businesses.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="admin-tour-select" className="text-sm font-medium">
            {copy.guideTourLabel}
          </Label>
          <select
            id="admin-tour-select"
            value={selectedItemId}
            onChange={(e) => handleItemChange(e.target.value)}
            className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="" disabled>
              {copy.guideTourPlaceholder}
            </option>
            {guideTours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.tourist_guides?.profiles?.full_name ?? '—'}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedItemId && (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{bookingsCopy.form.date}</Label>
            <p className="text-xs text-muted-foreground">{bookingsCopy.form.selectDatePrompt}</p>
            <BlockedDatesPicker
              key={selectedItemId}
              name="booking_date"
              blockedDates={blockedDates}
              copy={{ ...calendarActionLabels, weekdays: CALENDAR_WEEKDAYS, months: CALENDAR_MONTHS }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-quantity" className="text-sm font-medium">
              {quantityLabel}
            </Label>
            <input
              id="admin-quantity"
              type="number"
              name={quantityFieldName}
              min="1"
              max={capacity ?? undefined}
              value={quantity}
              onChange={handleQuantityChange}
              className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-notes" className="text-sm font-medium">
              {bookingsCopy.form.notesLabel}
            </Label>
            <textarea
              id="admin-notes"
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
          </div>
        </>
      )}

      <Button
        type="submit"
        className="w-full rounded-xl min-h-11"
        disabled={isPending || !selectedTourist || !selectedItemId}
      >
        {isPending ? copy.submitting : copy.submit}
      </Button>
    </form>
  )
}
