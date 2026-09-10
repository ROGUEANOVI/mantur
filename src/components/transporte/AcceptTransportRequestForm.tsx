'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { acceptTransportRequest } from '@/app/(app)/mi-perfil-transporte/actions'
import { transportCopy } from '@/lib/copy/transport'

type FormState = { error: string } | undefined

async function formAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return (await acceptTransportRequest(formData)) ?? undefined
}

// Extracted from the plain <form action={acceptTransportRequest}> that used
// to live inline in mi-perfil-transporte/page.tsx — now that quoting a
// price is mandatory (accept_transport_request RPC rejects a missing one),
// there's a real error to surface, so this needs useActionState + a toast
// per .claude/rules/components.md instead of a fire-and-forget void action.
export default function AcceptTransportRequestForm({ requestId }: { requestId: string }) {
  const [state, formActionFn, isPending] = useActionState<FormState, FormData>(formAction, undefined)
  const copy = transportCopy.transporterPanel.pendingRequests

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  return (
    <form action={formActionFn} className="mt-3 space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="space-y-1">
        <label
          htmlFor={`price-${requestId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          {transportCopy.acceptForm.priceLabel}
        </label>
        <input
          id={`price-${requestId}`}
          type="number"
          name="price_pesos"
          min="0"
          step="1"
          required
          inputMode="numeric"
          placeholder={transportCopy.acceptForm.pricePlaceholder}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-10 px-4 hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isPending ? copy.accepting : copy.accept}
      </button>
    </form>
  )
}
