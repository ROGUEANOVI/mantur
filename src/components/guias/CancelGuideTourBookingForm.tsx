'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { cancelGuideTourBooking } from '@/app/(app)/mi-perfil-guia/actions'
import { guidesCopy } from '@/lib/copy/guides'
import { cn } from '@/lib/utils'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'

type ActionResult = { error: string } | void
type FormState = { error: string | null }
const initial: FormState = { error: null }

const copy = guidesCopy.guidePanel

// Mirrors CancelServiceBookingForm exactly for a guide's tour instead of a
// business service — see that component's comment for the full rationale.
export default function CancelGuideTourBookingForm({ bookingId }: { bookingId: string }) {
  const [state, action] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result: ActionResult = await cancelGuideTourBooking(formData)
    return result && 'error' in result ? { error: result.error } : { error: null }
  }, initial)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  const formId = `cancel-guide-tour-booking-${bookingId}`

  return (
    <>
      <form id={formId} action={action}>
        <input type="hidden" name="bookingId" value={bookingId} />
      </form>
      <ConfirmDeleteButton
        formId={formId}
        title={copy.cancelConfirmTitle}
        description={copy.cancelConfirmDescription}
        confirmLabel={copy.cancelButton}
        trigger={copy.cancelButton}
        triggerClassName={cn(
          'text-xs font-medium text-destructive hover:underline underline-offset-4 min-h-11',
        )}
      />
    </>
  )
}
