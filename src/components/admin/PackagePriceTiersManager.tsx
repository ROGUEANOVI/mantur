'use client'

import { useActionState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { adminCopy } from '@/lib/copy/admin'
import { addPackagePriceTier, removePackagePriceTier } from '@/app/(app)/admin/paquetes/actions'
import { TIER_BASES, describeTier, type PriceTier } from '@/lib/packages/content'

type Tier = PriceTier & { id: string }

type FormState = { error: string } | { ok: true } | undefined

const copy = adminCopy.paquetes.tiers

const inputClass =
  'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11'

// Published group prices (package_price_tiers). Rows are shown sorted by
// min_people, exactly as the public price table renders them.
export default function PackagePriceTiersManager({ packageId, tiers }: { packageId: string; tiers: Tier[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await addPackagePriceTier(formData)
    return result ?? { ok: true }
  }, undefined)

  useEffect(() => {
    if (!state) return
    if ('error' in state) toast.error(state.error)
    else formRef.current?.reset()
  }, [state])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
      </div>

      {tiers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {tiers.map((tier) => {
            const row = describeTier(tier)
            return (
              <li key={tier.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-foreground">{row.people}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-foreground">{row.price}</span>
                  <form action={removePackagePriceTier}>
                    <input type="hidden" name="tierId" value={tier.id} />
                    <input type="hidden" name="packageId" value={packageId} />
                    <button
                      type="submit"
                      aria-label={`${copy.remove}: ${row.people}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </form>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3">
        <input type="hidden" name="packageId" value={packageId} />
        <TierField id="tier-min" label={copy.minPeople}>
          <input id="tier-min" name="min_people" type="number" min="1" step="1" inputMode="numeric" required className={inputClass} />
        </TierField>
        <TierField id="tier-max" label={copy.maxPeople}>
          <input id="tier-max" name="max_people" type="number" min="1" step="1" inputMode="numeric" className={inputClass} />
        </TierField>
        <TierField id="tier-amount" label={copy.amount}>
          <input id="tier-amount" name="amount" type="number" min="1" step="1" inputMode="numeric" required className={inputClass} />
        </TierField>
        <TierField id="tier-basis" label={copy.basis}>
          <select id="tier-basis" name="amount_basis" defaultValue="per_person" className={inputClass}>
            {TIER_BASES.map((b) => (
              <option key={b} value={b}>
                {copy.basisOptions[b]}
              </option>
            ))}
          </select>
        </TierField>
        <button
          type="submit"
          disabled={isPending}
          className="col-span-2 inline-flex items-center justify-center rounded-xl border border-primary/30 text-primary text-sm font-semibold min-h-11 hover:bg-primary/10 transition-colors disabled:opacity-60"
        >
          {isPending ? copy.adding : copy.add}
        </button>
      </form>
    </div>
  )
}

function TierField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
