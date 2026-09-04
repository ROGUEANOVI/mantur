'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { deletePackage } from '@/app/(app)/admin/paquetes/actions'

type FormState = { error: string | null }
const initial: FormState = { error: null }

// deletePackage() can genuinely fail (bookings.package_id ON DELETE
// RESTRICT — a package with reservations can't be hard-deleted). A plain
// <form action={deletePackage}> submitted via ConfirmDeleteButton's `form`
// attribute would silently discard that error, so this wraps it in
// useActionState + a toast, same pattern as CreateCategoryForm.
export default function DeletePackageForm({ formId, packageId }: { formId: string; packageId: string }) {
  const [state, action] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await deletePackage(formData)
    if (result && 'error' in result) return { error: result.error }
    return { error: null }
  }, initial)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  return (
    <form id={formId} action={action}>
      <input type="hidden" name="packageId" value={packageId} />
    </form>
  )
}
