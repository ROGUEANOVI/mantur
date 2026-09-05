'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { checkInvoiceDianStatus } from '@/app/(app)/admin/facturas/actions'
import { adminCopy } from '@/lib/copy/admin'

type FormState = { error: string } | { success: true; message: string } | undefined

async function checkDianStatusFormAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  return await checkInvoiceDianStatus(formData)
}

export default function CheckDianStatusButton({ transactionId }: { transactionId: string }) {
  const [state, action, isPending] = useActionState<FormState, FormData>(checkDianStatusFormAction, undefined)

  const errorMsg = state && 'error' in state ? state.error : null
  const successMsg = state && 'success' in state ? state.message : null

  useEffect(() => {
    if (errorMsg) toast.error(errorMsg)
    else if (successMsg) toast.success(successMsg)
  }, [state])

  return (
    <form action={action}>
      <input type="hidden" name="transactionId" value={transactionId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-8.5 px-3 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isPending ? adminCopy.facturas.checking : adminCopy.facturas.check}
      </button>
    </form>
  )
}
