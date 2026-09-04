'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { updateWompiBankId } from '@/app/(app)/admin/actions'
import { adminCopy } from '@/lib/copy/admin'

type FormState = { error: string } | { success: true } | undefined

async function wompiBankIdFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await updateWompiBankId(formData)) ?? undefined
}

type Props = {
  recipientType: 'business' | 'guide'
  recipientId: string
  currentWompiBankId: string | null
}

export default function WompiBankIdForm({ recipientType, recipientId, currentWompiBankId }: Props) {
  const [state, action, isPending] = useActionState<FormState, FormData>(
    wompiBankIdFormAction,
    undefined,
  )

  const isSuccess = state && 'success' in state
  const errorMsg = state && 'error' in state ? state.error : null

  useEffect(() => {
    if (errorMsg) toast.error(errorMsg)
    else if (isSuccess) toast.success(adminCopy.payoutAccounts.success)
  }, [errorMsg, isSuccess])

  return (
    <div className="space-y-2">
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="recipientType" value={recipientType} />
        <input type="hidden" name="recipientId" value={recipientId} />

        <div className="flex-1 space-y-1">
          <label htmlFor={`wompi-bank-id-${recipientId}`} className="block text-xs font-medium text-foreground">
            {adminCopy.payoutAccounts.label}
          </label>
          <input
            id={`wompi-bank-id-${recipientId}`}
            type="text"
            name="wompiBankId"
            defaultValue={currentWompiBankId ?? ''}
            className="w-full h-8.5 rounded-lg border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-semibold min-h-8.5 px-3 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? adminCopy.payoutAccounts.saving : adminCopy.payoutAccounts.save}
        </button>
      </form>

      <p className="text-xs text-muted-foreground">{adminCopy.payoutAccounts.hint}</p>
    </div>
  )
}
