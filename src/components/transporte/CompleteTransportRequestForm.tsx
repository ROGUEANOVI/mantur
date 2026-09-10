'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { markCompleted } from '@/app/(app)/mi-perfil-transporte/actions'
import { transportCopy } from '@/lib/copy/transport'

type FormState = { error: string } | undefined

async function formAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return (await markCompleted(formData)) ?? undefined
}

// Extracted from the plain <form action={markCompleted}> that used to live
// inline in mi-perfil-transporte/page.tsx — completing now atomically
// records the commission ManTur is owed (complete_transport_request RPC),
// which can fail (e.g. a concurrent update already moved the request out of
// 'accepted'), so this needs a real error channel instead of a
// fire-and-forget void action.
export default function CompleteTransportRequestForm({ requestId }: { requestId: string }) {
  const [state, formActionFn, isPending] = useActionState<FormState, FormData>(formAction, undefined)
  const copy = transportCopy.transporterPanel.activeRequests

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  return (
    <form action={formActionFn} className="mt-3">
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={isPending}
        className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
      >
        {isPending ? copy.completing : copy.complete}
      </button>
    </form>
  )
}
