'use client'

import { useState } from 'react'
import { resolveProviderPayoutManually } from '@/app/(app)/admin/pagos-proveedores/actions'
import { adminCopy } from '@/lib/copy/admin'

export default function ResolvePayoutManuallyForm({ payoutId }: { payoutId: string }) {
  const [open, setOpen] = useState(false)
  const copy = adminCopy.pagosProveedores

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center rounded-xl border border-border bg-background text-foreground text-xs font-semibold min-h-8.5 hover:bg-muted transition-colors"
      >
        {copy.resolveManually}
      </button>
    )
  }

  return (
    <form action={resolveProviderPayoutManually} className="w-full space-y-2">
      <input type="hidden" name="payoutId" value={payoutId} />
      <textarea
        name="notes"
        required
        rows={2}
        placeholder={copy.resolveManuallyNotesPlaceholder}
        autoFocus
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
      />
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
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-8 hover:bg-primary/90 transition-colors"
        >
          {copy.confirmResolveManually}
        </button>
      </div>
    </form>
  )
}
