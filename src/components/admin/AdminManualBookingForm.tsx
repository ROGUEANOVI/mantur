'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
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
import TouristPicker from '@/components/admin/TouristPicker'
import ManualPackageSaleForm, { type PackageOption } from '@/components/admin/ManualPackageSaleForm'
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
  packages: PackageOption[]
}

type BookingType = 'service' | 'guide_tour' | 'package'

type FormState = { error: string } | { success: true } | undefined

const copy = adminCopy.reservas

async function serviceFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return await createManualServiceBooking(formData)
}

async function guideTourFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return await createManualGuideTourBooking(formData)
}

// Packages are what sells today (manual-sales mode), so they're the first
// and default choice; their form lives in ManualPackageSaleForm.
export default function AdminManualBookingForm({ services, guideTours, packages }: Props) {
  const [type, setType] = useState<BookingType>('package')

  if (type === 'package') {
    return (
      <div className="space-y-5">
        <TypeSelector value={type} onChange={setType} />
        <ManualPackageSaleForm packages={packages} />
      </div>
    )
  }

  return <ProviderBookingForm key={type} type={type} onTypeChange={setType} services={services} guideTours={guideTours} />
}

function TypeSelector({ value, onChange }: { value: BookingType; onChange: (next: BookingType) => void }) {
  const options: { value: BookingType; label: string }[] = [
    { value: 'package', label: copy.typePackage },
    { value: 'service', label: copy.typeService },
    { value: 'guide_tour', label: copy.typeGuideTour },
  ]
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{copy.typeLabel}</Label>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`rounded-xl border px-2 py-2 text-sm font-medium min-h-11 transition-colors ${
              value === o.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-muted-foreground hover:bg-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Service / guide-tour pre-reserva registered on a tourist's behalf.
function ProviderBookingForm({
  type,
  onTypeChange,
  services,
  guideTours,
}: {
  type: 'service' | 'guide_tour'
  onTypeChange: (next: BookingType) => void
  services: ServiceOption[]
  guideTours: GuideTourOption[]
}) {
  const [selectedTourist, setSelectedTourist] = useState<TouristSearchResult | null>(null)
  const [pickerKey, setPickerKey] = useState(0)

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
    setPickerKey((k) => k + 1)
    setSelectedItemId('')
    setBlockedDates([])
    setQuantity(1)
  }, [state])

  async function handleItemChange(itemId: string) {
    setSelectedItemId(itemId)
    setBlockedDates([])
    if (!itemId) return
    const dates = await getItemBlockedDates(type, itemId)
    setBlockedDates(dates)
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

      <TypeSelector value={type} onChange={onTypeChange} />

      <TouristPicker key={pickerKey} selected={selectedTourist} onSelect={setSelectedTourist} />

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
