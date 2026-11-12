'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { deleteEvent } from '@/app/(app)/admin/eventos/actions'

type FormState = { error: string | null }
const initial: FormState = { error: null }

// Same pattern as DeletePackageForm: submitted through ConfirmDeleteButton's
// `form` attribute, with deleteEvent()'s error surfaced as a toast instead
// of being silently discarded by a plain <form action>.
export default function DeleteEventForm({ formId, eventId }: { formId: string; eventId: string }) {
  const [state, action] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await deleteEvent(formData)
    if (result && 'error' in result) return { error: result.error }
    return { error: null }
  }, initial)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  return (
    <form id={formId} action={action}>
      <input type="hidden" name="eventId" value={eventId} />
    </form>
  )
}
