'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { cancelServiceBooking } from '@/app/(app)/mi-negocio/actions'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'

type ActionResult = { error: string } | void
type FormState = { error: string | null }
const initial: FormState = { error: null }

const copy = miNegocioCopy.bookings

// cancelServiceBooking() can genuinely fail (booking already cancelled by a
// second tab, rate limit) — useActionState + toast surfaces that instead of
// discarding it, same pattern as DeletePackageForm. Wrapped with
// ConfirmDeleteButton since this is a one-way, tourist-visible action.
export default function CancelServiceBookingForm({ bookingId }: { bookingId: string }) {
  const [state, action] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result: ActionResult = await cancelServiceBooking(formData)
    return result && 'error' in result ? { error: result.error } : { error: null }
  }, initial)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  const formId = `cancel-service-booking-${bookingId}`

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
