'use client'

import { useActionState, useState } from 'react'
import { requestRefund } from '@/app/(app)/mis-reservas/actions'
import { bookingsCopy } from '@/lib/copy/bookings'

type FormState = { error: string } | undefined

async function requestRefundFormAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await requestRefund(formData)) ?? undefined
}

export default function RequestRefundForm({
  bookingId,
  likelyAutoVoid,
}: {
  bookingId: string
  likelyAutoVoid: boolean
}) {
  const [open, setOpen] = useState(false)
  const [state, action, isPending] = useActionState<FormState, FormData>(
    requestRefundFormAction,
    undefined,
  )
  const copy = bookingsCopy.refund

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-destructive hover:text-destructive/80 font-medium transition-colors"
      >
        {copy.requestButton}
      </button>
    )
  }

  return (
    <form action={action} className="w-full space-y-2 pt-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <p className="text-xs text-muted-foreground">{copy.disclaimer}</p>
      <p className="text-xs text-muted-foreground">{copy.disclaimerFee}</p>
      <textarea
        name="reason"
        rows={2}
        placeholder={copy.reasonPlaceholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
      />
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          {copy.payoutInstructionsLabel}
        </label>
        <p className="text-xs text-muted-foreground">
          {likelyAutoVoid ? copy.payoutInstructionsHintOptional : copy.payoutInstructionsHintRequired}
        </p>
        <textarea
          name="payout_instructions"
          rows={2}
          required={!likelyAutoVoid}
          maxLength={500}
          placeholder={copy.payoutInstructionsPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
        />
      </div>
      {state?.error && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground text-xs font-medium min-h-8 hover:bg-muted transition-colors"
        >
          {copy.cancel}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold min-h-8 hover:bg-destructive/90 transition-colors disabled:opacity-60"
        >
          {isPending ? copy.confirming : copy.confirm}
        </button>
      </div>
    </form>
  )
}
