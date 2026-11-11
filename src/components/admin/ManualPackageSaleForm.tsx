'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createManualPackageSale, type TouristSearchResult } from '@/app/(app)/admin/reservas/actions'
import { adminCopy } from '@/lib/copy/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import {
  GUEST_DOCUMENT_TYPES,
  MANUAL_PAYMENT_METHODS,
  bogotaToday,
  computeCatalogTotal,
  type PricingUnit,
} from '@/lib/packages/manualSale'
import { QUANTITY_LABELS } from '@/lib/services/attributeConfig'
import { ACQUISITION_SOURCES } from '@/lib/analytics/attribution'
import TouristPicker from '@/components/admin/TouristPicker'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type PackageOption = {
  id: string
  name: string
  base_price: number | string
  pricing_unit: PricingUnit
  capacity: number | null
}

type FormState = { error: string } | { success: true } | undefined

const copy = adminCopy.reservas
const saleCopy = adminCopy.reservas.packageSale

const inputClass =
  'flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

async function saleFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return await createManualPackageSale(formData)
}

function formatCOP(amount: number) {
  return `$${amount.toLocaleString('es-CO')} COP`
}

// Registers a package sale closed over WhatsApp. The catalog total shown
// here is only a preview — the server recomputes it from the DB package and
// is the sole source of truth for amounts.
export default function ManualPackageSaleForm({ packages }: { packages: PackageOption[] }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(saleFormAction, undefined)
  const formRef = useRef<HTMLFormElement>(null)
  // Bumped after a successful save to remount the tourist picker (clears its
  // internal search state) along with the rest of the form.
  const [resetKey, setResetKey] = useState(0)

  const [packageId, setPackageId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [customerMode, setCustomerMode] = useState<'registered' | 'guest'>('guest')
  const [selectedTourist, setSelectedTourist] = useState<TouristSearchResult | null>(null)
  const [priceOverride, setPriceOverride] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid')

  const today = bogotaToday()

  useEffect(() => {
    if (!state) return
    if ('error' in state) {
      toast.error(state.error)
      return
    }
    toast.success(saleCopy.success)
    formRef.current?.reset()
    setPackageId('')
    setQuantity(1)
    setSelectedTourist(null)
    setPriceOverride(false)
    setPaymentStatus('paid')
    setResetKey((k) => k + 1)
  }, [state])

  const selectedPackage = packages.find((p) => p.id === packageId)
  const capacity = selectedPackage?.capacity ?? null
  const catalogTotal = selectedPackage ? computeCatalogTotal(selectedPackage, quantity).catalogTotal : 0
  const quantityLabel = selectedPackage ? QUANTITY_LABELS[selectedPackage.pricing_unit] : bookingsCopy.form.quantity

  function handleQuantityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10)
    if (!Number.isNaN(val) && val >= 1) setQuantity(capacity !== null ? Math.min(val, capacity) : val)
  }

  const canSubmit = !!packageId && (customerMode === 'guest' || !!selectedTourist)

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="customer_mode" value={customerMode} />
      <input type="hidden" name="tourist_id" value={customerMode === 'registered' ? (selectedTourist?.id ?? '') : ''} />

      {/* ── Paquete ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="sale-package" className="text-sm font-medium">
          {saleCopy.packageLabel}
        </Label>
        <select
          id="sale-package"
          name="package_id"
          value={packageId}
          onChange={(e) => {
            setPackageId(e.target.value)
            setQuantity(1)
          }}
          className={inputClass}
        >
          <option value="" disabled>
            {saleCopy.packagePlaceholder}
          </option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Cliente ─────────────────────────────────────────────── */}
      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-sm font-medium">{saleCopy.customerLabel}</legend>
        <SegmentedChoice
          name="customer-mode-choice"
          value={customerMode}
          onChange={(v) => setCustomerMode(v as 'registered' | 'guest')}
          options={[
            { value: 'guest', label: saleCopy.customerGuest },
            { value: 'registered', label: saleCopy.customerRegistered },
          ]}
        />

        {customerMode === 'registered' ? (
          <TouristPicker key={resetKey} selected={selectedTourist} onSelect={setSelectedTourist} showLabel={false} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="guest-name" label={saleCopy.guestNameLabel} className="sm:col-span-2">
              <input id="guest-name" name="guest_full_name" type="text" maxLength={120} autoComplete="off" className={inputClass} />
            </Field>
            <Field id="guest-phone" label={saleCopy.guestPhoneLabel}>
              <input
                id="guest-phone"
                name="guest_phone"
                type="tel"
                inputMode="tel"
                placeholder={saleCopy.guestPhonePlaceholder}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
            <Field id="guest-email" label={saleCopy.guestEmailLabel}>
              <input id="guest-email" name="guest_email" type="email" autoComplete="off" className={inputClass} />
            </Field>
            <Field id="guest-doc-type" label={saleCopy.guestDocumentTypeLabel}>
              <select id="guest-doc-type" name="guest_document_type" defaultValue="" className={inputClass}>
                <option value="">{saleCopy.guestDocumentTypePlaceholder}</option>
                {GUEST_DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {saleCopy.documentTypes[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="guest-doc-number" label={saleCopy.guestDocumentNumberLabel}>
              <input
                id="guest-doc-number"
                name="guest_document_number"
                type="text"
                maxLength={20}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">{saleCopy.guestDocumentHint}</p>
          </div>
        )}
      </fieldset>

      {selectedPackage && (
        <>
          {/* ── Viaje ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <Field id="sale-date" label={saleCopy.dateLabel} hint={saleCopy.dateHint}>
              <input id="sale-date" name="booking_date" type="date" defaultValue={today} className={inputClass} />
            </Field>
            <Field id="sale-quantity" label={quantityLabel}>
              <input
                id="sale-quantity"
                name="quantity"
                type="number"
                min="1"
                max={capacity ?? undefined}
                value={quantity}
                onChange={handleQuantityChange}
                className={inputClass}
              />
            </Field>
          </div>

          {/* ── Origen (marketing attribution) ────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field id="sale-source" label={saleCopy.sourceLabel}>
              <select id="sale-source" name="acquisition_source" defaultValue="" className={inputClass}>
                <option value="">{saleCopy.sourcePlaceholder}</option>
                {ACQUISITION_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {copy.acquisitionSources[source]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="sale-campaign" label={saleCopy.campaignLabel} hint={saleCopy.campaignHint}>
              <input
                id="sale-campaign"
                name="acquisition_campaign"
                type="text"
                maxLength={150}
                autoComplete="off"
                placeholder={saleCopy.campaignPlaceholder}
                className={inputClass}
              />
            </Field>
          </div>

          <Field id="sale-notes" label={bookingsCopy.form.notesLabel}>
            <textarea
              id="sale-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder={bookingsCopy.form.notesPlaceholder}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </Field>

          {/* ── Precio ──────────────────────────────────────────── */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{saleCopy.catalogTotalLabel}</span>
              <span
                className={cn(
                  'text-base font-semibold tabular-nums',
                  priceOverride ? 'text-muted-foreground line-through' : 'text-primary',
                )}
              >
                {formatCOP(catalogTotal)}
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="price_override"
                checked={priceOverride}
                onChange={(e) => setPriceOverride(e.target.checked)}
                className="size-4 cursor-pointer accent-primary"
              />
              {saleCopy.overrideToggle}
            </label>
            {priceOverride && (
              <div className="grid grid-cols-1 gap-3">
                <Field id="sale-agreed-total" label={saleCopy.agreedTotalLabel}>
                  <input
                    id="sale-agreed-total"
                    name="agreed_total"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>
                <Field id="sale-adjustment-reason" label={saleCopy.adjustmentReasonLabel}>
                  <input
                    id="sale-adjustment-reason"
                    name="price_adjustment_reason"
                    type="text"
                    maxLength={300}
                    placeholder={saleCopy.adjustmentReasonPlaceholder}
                    className={inputClass}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* ── Pago ────────────────────────────────────────────── */}
          <fieldset className="space-y-3">
            <legend className="mb-1.5 text-sm font-medium">{saleCopy.paymentStatusLabel}</legend>
            <input type="hidden" name="payment_status" value={paymentStatus} />
            <SegmentedChoice
              name="payment-status-choice"
              value={paymentStatus}
              onChange={(v) => setPaymentStatus(v as 'paid' | 'pending')}
              options={[
                { value: 'paid', label: saleCopy.paymentPaid },
                { value: 'pending', label: saleCopy.paymentPending },
              ]}
            />
            {paymentStatus === 'paid' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field id="sale-payment-method" label={saleCopy.paymentMethodLabel} className="col-span-2">
                  <select id="sale-payment-method" name="payment_method" defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      {saleCopy.paymentMethodPlaceholder}
                    </option>
                    {MANUAL_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {copy.paymentMethods[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="sale-paid-date" label={saleCopy.paymentDateLabel}>
                  <input id="sale-paid-date" name="paid_date" type="date" defaultValue={today} max={today} className={inputClass} />
                </Field>
                <Field id="sale-payment-reference" label={saleCopy.paymentReferenceLabel}>
                  <input
                    id="sale-payment-reference"
                    name="payment_reference"
                    type="text"
                    maxLength={100}
                    placeholder={saleCopy.paymentReferencePlaceholder}
                    className={inputClass}
                  />
                </Field>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{saleCopy.paymentPendingHint}</p>
            )}
          </fieldset>
        </>
      )}

      <Button type="submit" className="w-full rounded-xl min-h-11" disabled={isPending || !canSubmit}>
        {isPending ? copy.submitting : copy.submit}
      </Button>
    </form>
  )
}

function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// Two-option toggle styled like the type selector above it. Real radio
// inputs underneath, so it's keyboard- and screen-reader-native.
function SegmentedChoice({
  name,
  value,
  onChange,
  options,
}: {
  name: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
            value === o.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input text-muted-foreground hover:bg-muted',
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}
