'use client'

import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { adminCopy } from '@/lib/copy/admin'
import type { createPackage, updatePackage } from '@/app/(app)/admin/paquetes/actions'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'
import TextareaWithCounter from '@/components/shared/TextareaWithCounter'

type ActionFn = typeof createPackage | typeof updatePackage
type FormState = { error: string } | { success: true } | undefined

async function wrap(action: ActionFn, _prevState: FormState, formData: FormData): Promise<FormState> {
  return (await action(formData)) ?? undefined
}

type Package = {
  id: string
  name: string
  description: string | null
  base_price: number | string
  pricing_unit: string
  capacity: number | null
  is_featured: boolean
  sort_order: number
}

type Props = {
  action: ActionFn
  package?: Package
}

const PRICING_UNITS = ['per_person', 'per_night', 'fixed'] as const

export default function PackageForm({ action, package: pkg }: Props) {
  const boundAction = wrap.bind(null, action)
  const [state, formAction, isPending] = useActionState<FormState, FormData>(boundAction, undefined)

  const copy = adminCopy.paquetes.form
  const errorMsg = state && 'error' in state ? state.error : null

  useEffect(() => {
    if (errorMsg) toast.error(errorMsg)
  }, [state])

  return (
    <form action={formAction} className="space-y-5">
      {pkg && <input type="hidden" name="packageId" value={pkg.id} />}

      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          {copy.name} <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={pkg?.name ?? ''}
          placeholder={copy.namePlaceholder}
          required
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium text-foreground">
          {copy.description}
        </label>
        <TextareaWithCounter
          id="description"
          name="description"
          defaultValue={pkg?.description ?? ''}
          placeholder={copy.descriptionPlaceholder}
          rows={4}
          maxLength={DESCRIPTION_MAX_LENGTH}
          textareaClassName="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="base_price" className="block text-sm font-medium text-foreground">
            {copy.basePrice} <span className="text-destructive">*</span>
          </label>
          <input
            id="base_price"
            name="base_price"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={pkg?.base_price ?? ''}
            required
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pricing_unit" className="block text-sm font-medium text-foreground">
            {copy.pricingUnit} <span className="text-destructive">*</span>
          </label>
          <select
            id="pricing_unit"
            name="pricing_unit"
            defaultValue={pkg?.pricing_unit ?? ''}
            required
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
          >
            <option value="" disabled>
              {copy.pricingUnitPlaceholder}
            </option>
            {PRICING_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {copy.pricingUnitOptions[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="capacity" className="block text-sm font-medium text-foreground">
          {copy.capacity}
        </label>
        <input
          id="capacity"
          name="capacity"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          defaultValue={pkg?.capacity ?? ''}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
        />
      </div>

      <fieldset className="space-y-4 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">{copy.showcaseTitle}</legend>

        <label htmlFor="is_featured" className="flex cursor-pointer items-start gap-3">
          <input
            id="is_featured"
            name="is_featured"
            type="checkbox"
            defaultChecked={pkg?.is_featured ?? false}
            className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-foreground">{copy.isFeatured}</span>
            <span className="block text-xs text-muted-foreground">{copy.isFeaturedHint}</span>
          </span>
        </label>

        <div className="space-y-1.5">
          <label htmlFor="sort_order" className="block text-sm font-medium text-foreground">
            {copy.sortOrder}
          </label>
          <input
            id="sort_order"
            name="sort_order"
            type="number"
            min="0"
            max="9999"
            step="1"
            inputMode="numeric"
            defaultValue={pkg?.sort_order ?? 0}
            aria-describedby="sort_order_hint"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
          />
          <p id="sort_order_hint" className="text-xs text-muted-foreground">
            {copy.sortOrderHint}
          </p>
        </div>
      </fieldset>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? copy.submitting : copy.submit}
        </button>
        <Link
          href="/admin/paquetes"
          className="inline-flex items-center justify-center rounded-xl border border-border text-sm text-foreground font-semibold min-h-11 px-4 hover:bg-muted transition-colors"
        >
          {copy.cancel}
        </Link>
      </div>
    </form>
  )
}
