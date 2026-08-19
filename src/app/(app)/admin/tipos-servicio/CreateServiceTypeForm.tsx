'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { adminCopy } from '@/lib/copy/admin'
import { createServiceType } from './actions'

const initial = { error: undefined as string | undefined, success: false }

export default function CreateServiceTypeForm() {
  const copy = adminCopy.tiposServicio
  const [state, action, pending] = useActionState(
    async (_prev: typeof initial, formData: FormData) => {
      const result = await createServiceType(formData)
      return { error: result.error, success: !!result.success }
    },
    initial,
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) formRef.current?.reset()
  }, [state.success])

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-2xl border border-dashed border-border bg-card shadow-sm p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-foreground">{copy.new}</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          name="name"
          placeholder={copy.namePlaceholder}
          required
          className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
        />
        <select
          name="pricing_unit"
          required
          defaultValue=""
          aria-label={copy.pricingUnitLabel}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
        >
          <option value="" disabled>
            {copy.pricingUnitLabel}
          </option>
          <option value="per_person">{copy.pricingUnit.per_person}</option>
          <option value="per_night">{copy.pricingUnit.per_night}</option>
          <option value="fixed">{copy.pricingUnit.fixed}</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 h-9 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Plus className="size-4" aria-hidden="true" />
          {pending ? copy.adding : copy.add}
        </button>
      </div>

      {state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="text-xs text-primary">Tipo de servicio creado correctamente.</p>
      )}
    </form>
  )
}
