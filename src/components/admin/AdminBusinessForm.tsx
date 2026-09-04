'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { adminCopy } from '@/lib/copy/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { normalizeColombianPhone } from '@/lib/phone'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'
import LocationPicker from '@/components/shared/LocationPicker'
import TextareaWithCounter from '@/components/shared/TextareaWithCounter'

type ActionResult = { error: string } | { success: true }
type FormState = ActionResult | undefined

type Owner = { id: string; full_name: string | null }

type Props = {
  action: (formData: FormData) => Promise<ActionResult>
  owners: Owner[]
}

export default function AdminBusinessForm({ action, owners }: Props) {
  const copy = adminCopy.negocios.form
  const [phoneError, setPhoneError] = useState<string | null>(null)

  function handlePhoneBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim()
    setPhoneError(raw && !normalizeColombianPhone(raw) ? copy.errors.invalidPhone : null)
  }

  async function submitAction(_prevState: FormState, formData: FormData): Promise<FormState> {
    const rawPhone = (formData.get('phone') as string | null)?.trim() || ''
    if (rawPhone && !normalizeColombianPhone(rawPhone)) {
      setPhoneError(copy.errors.invalidPhone)
      return undefined
    }
    return (await action(formData)) ?? undefined
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    submitAction,
    undefined,
  )

  const isError = state && 'error' in state
  const isSuccess = state && 'success' in state

  useEffect(() => {
    if (isError) toast.error(state.error)
    else if (isSuccess) toast.success('Negocio creado correctamente.')
  }, [isError, isSuccess, state])

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="name">
          {copy.name}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder={copy.namePlaceholder}
          required
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="type">
          {copy.type}
        </label>
        <select
          id="type"
          name="type"
          required
          defaultValue=""
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="" disabled>
            — Selecciona un tipo —
          </option>
          {Object.entries(businessesCopy.businesses.types).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="owner">
          {copy.owner}
        </label>
        {owners.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.ownerEmpty}</p>
        ) : (
          <select
            id="owner"
            name="ownerId"
            required
            defaultValue=""
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="" disabled>
              {copy.ownerPlaceholder}
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name ?? o.id}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="description">
          {copy.description}
        </label>
        <TextareaWithCounter
          id="description"
          name="description"
          placeholder={copy.descriptionPlaceholder}
          rows={3}
          maxLength={DESCRIPTION_MAX_LENGTH}
          textareaClassName="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="address">
          {copy.address}
        </label>
        <input
          id="address"
          name="address"
          type="text"
          placeholder={copy.addressPlaceholder}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-foreground" htmlFor="phone">
          {copy.phone}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          onBlur={handlePhoneBlur}
          onChange={() => phoneError && setPhoneError(null)}
          aria-invalid={phoneError ? true : undefined}
          placeholder={copy.phonePlaceholder}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 aria-invalid:border-destructive"
        />
        {phoneError && (
          <p role="alert" className="text-sm text-destructive">{phoneError}</p>
        )}
      </div>

      <LocationPicker
        defaultLat={null}
        defaultLng={null}
        label={copy.location}
        hint={copy.locationHint}
      />

      <div className="flex gap-3 pt-2">
        <Link
          href="/admin/negocios"
          className="flex-1 rounded-xl border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted/50 transition-colors min-h-11 flex items-center justify-center"
        >
          {copy.cancel}
        </Link>
        <button
          type="submit"
          disabled={pending || owners.length === 0}
          className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-11"
        >
          {pending ? copy.submitting : copy.submit}
        </button>
      </div>
    </form>
  )
}
