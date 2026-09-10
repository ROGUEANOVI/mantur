'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { markCommissionCollected } from '@/app/(app)/admin/comisiones/actions'
import { adminCopy } from '@/lib/copy/admin'
import { Button } from '@/components/ui/button'

type FormState = { error: string } | { success: true } | undefined

async function formAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return (await markCommissionCollected(formData)) ?? undefined
}

const copy = adminCopy.comisiones.pending

export default function MarkCommissionCollectedForm({ commissionId }: { commissionId: string }) {
  const [state, action, isPending] = useActionState<FormState, FormData>(formAction, undefined)
  const [showNotes, setShowNotes] = useState(false)

  const isSuccess = state && 'success' in state
  const errorMsg = state && 'error' in state ? state.error : null

  useEffect(() => {
    if (errorMsg) toast.error(errorMsg)
    else if (isSuccess) toast.success(copy.success)
  }, [state])

  if (isSuccess) return null

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="commissionId" value={commissionId} />
      {showNotes && (
        <textarea
          name="notes"
          rows={2}
          placeholder={copy.notesPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? copy.marking : copy.markCollected}
        </Button>
        {!showNotes && (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
          >
            {copy.notesLabel}
          </button>
        )}
      </div>
    </form>
  )
}
