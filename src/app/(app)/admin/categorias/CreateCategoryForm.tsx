'use client'

import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Plus, Tag } from 'lucide-react'
import { adminCopy } from '@/lib/copy/admin'
import { createCategory } from './actions'

const initial = { success: false }

export default function CreateCategoryForm() {
  const copy = adminCopy.categorias
  const [state, action, pending] = useActionState(
    async (_prev: typeof initial, formData: FormData) => {
      const result = await createCategory(formData)
      if (result.error) {
        toast.error(result.error)
        return { success: false }
      }
      toast.success(copy.success)
      return { success: true }
    },
    initial,
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Tag className="size-4 text-primary" aria-hidden="true" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-semibold text-foreground">{copy.new}</p>
      </div>

      <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="category-name" className="block text-sm font-medium text-foreground">
            {copy.nameLabel}
          </label>
          <input
            id="category-name"
            type="text"
            name="name"
            placeholder={copy.namePlaceholder}
            required
            className="w-full min-h-11 rounded-xl border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 min-h-11 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden="true" />
          {pending ? copy.adding : copy.add}
        </button>
      </form>
    </div>
  )
}
