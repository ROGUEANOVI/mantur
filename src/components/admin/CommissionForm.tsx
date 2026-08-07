'use client'

import { useActionState } from 'react'
import { updateCommissionRate } from '@/app/(app)/admin/actions'
import { adminCopy } from '@/lib/copy/admin'

type FormState = { error: string } | { success: true } | undefined

async function commissionFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await updateCommissionRate(formData)) ?? undefined
}

type Props = {
  configId: string
  serviceType: string
  currentRate: number
}

export default function CommissionForm({ configId, serviceType, currentRate }: Props) {
  const [state, action, isPending] = useActionState<FormState, FormData>(
    commissionFormAction,
    undefined,
  )

  const label =
    adminCopy.comisiones.serviceType[serviceType] ?? serviceType

  const isSuccess = state && 'success' in state
  const errorMsg = state && 'error' in state ? state.error : null

  return (
    <div className="space-y-2">
    <form action={action} className="flex items-end gap-3">
      <input type="hidden" name="configId" value={configId} />

      <div className="flex-1 space-y-1.5">
        <label
          htmlFor={`rate-${configId}`}
          className="block text-sm font-medium text-foreground"
        >
          {label}
        </label>
        <div className="relative">
          <input
            id={`rate-${configId}`}
            type="number"
            name="rate"
            defaultValue={currentRate}
            min="0"
            max="100"
            step="0.01"
            required
            className="w-full rounded-xl border border-input bg-background px-3 py-2 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 px-4 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isPending
          ? adminCopy.comisiones.saving
          : adminCopy.comisiones.save}
      </button>
    </form>

    {isSuccess && (
      <p className="text-xs font-medium text-green-600 dark:text-green-400" role="status">
        {adminCopy.comisiones.success}
      </p>
    )}
    {errorMsg && (
      <p className="text-xs font-medium text-destructive" role="alert">
        {errorMsg}
      </p>
    )}
    </div>
  )
}
