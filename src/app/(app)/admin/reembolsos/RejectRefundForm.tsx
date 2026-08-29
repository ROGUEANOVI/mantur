'use client'

import { useState } from 'react'
import { rejectRefundRequest } from '@/app/(app)/admin/reembolsos/actions'
import { adminCopy } from '@/lib/copy/admin'

export default function RejectRefundForm({ refundRequestId }: { refundRequestId: string }) {
  const [open, setOpen] = useState(false)
  const copy = adminCopy.reembolsos

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center rounded-xl border border-border bg-background text-foreground text-xs font-semibold min-h-8.5 hover:bg-muted transition-colors"
      >
        {copy.reject}
      </button>
    )
  }

  return (
    <form action={rejectRefundRequest} className="w-full space-y-2">
      <input type="hidden" name="refundRequestId" value={refundRequestId} />
      <textarea
        name="rejection_reason"
        required
        rows={2}
        placeholder={copy.rejectionReasonPlaceholder}
        autoFocus
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground text-xs font-medium min-h-8 hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold min-h-8 hover:bg-destructive/90 transition-colors"
        >
          Confirmar rechazo
        </button>
      </div>
    </form>
  )
}
