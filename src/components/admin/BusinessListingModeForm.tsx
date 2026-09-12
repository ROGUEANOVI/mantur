'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { setBusinessListingModeOverride } from '@/app/(app)/admin/actions'
import { adminCopy } from '@/lib/copy/admin'
import type { BusinessListingMode } from '@/lib/businesses/listingMode'

type FormState = { error: string } | { success: true } | undefined

async function listingModeFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await setBusinessListingModeOverride(formData)) ?? undefined
}

type Props = {
  businessId: string
  currentOverride: BusinessListingMode | null
}

export default function BusinessListingModeForm({ businessId, currentOverride }: Props) {
  const copy = adminCopy.negocios.listingMode
  const [state, action, isPending] = useActionState<FormState, FormData>(
    listingModeFormAction,
    undefined,
  )

  const isSuccess = state && 'success' in state
  const errorMsg = state && 'error' in state ? state.error : null

  useEffect(() => {
    if (errorMsg) toast.error(errorMsg)
    else if (isSuccess) toast.success(copy.saved)
  }, [state])

  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="businessId" value={businessId} />

      <div className="flex-1 space-y-1">
        <label htmlFor={`listing-mode-${businessId}`} className="sr-only">
          {copy.label}
        </label>
        <select
          id={`listing-mode-${businessId}`}
          name="listingModeOverride"
          defaultValue={currentOverride ?? ''}
          className="w-full h-8.5 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          {Object.entries(copy.overrideOptions).map(([value, label]) => (
            <option key={value || 'inherit'} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-semibold min-h-8.5 px-3 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isPending ? copy.saving : copy.save}
      </button>
    </form>
  )
}
