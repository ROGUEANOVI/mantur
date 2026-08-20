'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { adminCopy } from '@/lib/copy/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import type { createPlace, updatePlace } from '@/app/(app)/admin/actions'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'
import LocationPicker from '@/components/shared/LocationPicker'
import TextareaWithCounter from '@/components/shared/TextareaWithCounter'

type ActionFn = typeof createPlace | typeof updatePlace
type FormState = { error: string } | { success: true } | undefined

async function wrap(
  action: ActionFn,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  return (await action(formData)) ?? undefined
}

type Place = {
  id: string
  name: string
  description: string | null
  type: string
  lat: number | null
  lng: number | null
}

type Props = {
  action: ActionFn
  place?: Place
}

const PLACE_TYPES = Object.keys(businessesCopy.places.types)

export default function LugarForm({ action, place }: Props) {
  const boundAction = wrap.bind(null, action)
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    boundAction,
    undefined,
  )

  const copy = adminCopy.lugares.form
  const errorMsg = state && 'error' in state ? state.error : null

  return (
    <form action={formAction} className="space-y-5">
      {place && (
        <input type="hidden" name="placeId" value={place.id} />
      )}

      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          {copy.name} <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={place?.name ?? ''}
          placeholder={copy.namePlaceholder}
          required
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
        />
      </div>

      {/* Type */}
      <div className="space-y-1.5">
        <label htmlFor="type" className="block text-sm font-medium text-foreground">
          {copy.type} <span className="text-destructive">*</span>
        </label>
        <select
          id="type"
          name="type"
          defaultValue={place?.type ?? ''}
          required
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
        >
          <option value="" disabled>
            — Selecciona un tipo —
          </option>
          {PLACE_TYPES.map((t) => (
            <option key={t} value={t}>
              {businessesCopy.places.types[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium text-foreground">
          {copy.description}
        </label>
        <TextareaWithCounter
          id="description"
          name="description"
          defaultValue={place?.description ?? ''}
          placeholder={copy.descriptionPlaceholder}
          rows={3}
          maxLength={DESCRIPTION_MAX_LENGTH}
          textareaClassName="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      {/* Coordinates */}
      <LocationPicker
        defaultLat={place?.lat ?? null}
        defaultLng={place?.lng ?? null}
        label={copy.location}
        hint={copy.locationHint}
      />

      {/* Error */}
      {errorMsg && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? copy.submitting : copy.submit}
        </button>
        <Link
          href="/admin/lugares"
          className="inline-flex items-center justify-center rounded-xl border border-border text-sm text-foreground font-semibold min-h-11 px-4 hover:bg-muted transition-colors"
        >
          {copy.cancel}
        </Link>
      </div>
    </form>
  )
}
