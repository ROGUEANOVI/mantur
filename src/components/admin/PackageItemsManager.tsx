'use client'

import { useActionState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { adminCopy } from '@/lib/copy/admin'
import { addPackageItem, removePackageItem } from '@/app/(app)/admin/paquetes/actions'

type Item = {
  id: string
  label: string
  internal_cost_cents: number
  quantity_included: number
}

type Option = { id: string; label: string }

type Props = {
  packageId: string
  items: Item[]
  services: Option[]
  guideTours: Option[]
}

type FormState = { error: string } | undefined

function formatCOP(cents: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export default function PackageItemsManager({ packageId, items, services, guideTours }: Props) {
  const copy = adminCopy.paquetes.items

  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await addPackageItem(formData)
    return result ?? undefined
  }, undefined)

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCOP(item.internal_cost_cents)} · {copy.quantityLabel}: {item.quantity_included}
                </p>
              </div>
              <form action={removePackageItem}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="packageId" value={packageId} />
                <button
                  type="submit"
                  aria-label={`${copy.remove}: ${item.label}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-border p-3">
        <input type="hidden" name="packageId" value={packageId} />

        <div className="space-y-1.5">
          <label htmlFor="component" className="block text-xs font-medium text-foreground">
            {copy.providerLabel}
          </label>
          <select
            id="component"
            name="component"
            required
            defaultValue=""
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
          >
            <option value="" disabled>
              {copy.selectPlaceholder}
            </option>
            {services.length > 0 && (
              <optgroup label={copy.servicesGroup}>
                {services.map((s) => (
                  <option key={s.id} value={`service:${s.id}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            )}
            {guideTours.length > 0 && (
              <optgroup label={copy.guideToursGroup}>
                {guideTours.map((t) => (
                  <option key={t.id} value={`guide_tour:${t.id}`}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="internal_cost_pesos" className="block text-xs font-medium text-foreground">
              {copy.costLabel}
            </label>
            <input
              id="internal_cost_pesos"
              name="internal_cost_pesos"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="quantity_included" className="block text-xs font-medium text-foreground">
              {copy.quantityLabel}
            </label>
            <input
              id="quantity_included"
              name="quantity_included"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              defaultValue={1}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? copy.adding : copy.add}
        </button>
      </form>
    </div>
  )
}
