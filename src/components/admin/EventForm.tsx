'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { eventsCopy } from '@/lib/copy/events'
import type { createEvent, updateEvent } from '@/app/(app)/admin/eventos/actions'
import {
  EVENT_CTA_TYPES,
  EVENT_LOCATION_MAX,
  EVENT_SUMMARY_MAX,
  EVENT_TIME_LABEL_MAX,
  EVENT_TITLE_MAX,
  type EventCtaType,
} from '@/lib/events/parse'
import TextareaWithCounter from '@/components/shared/TextareaWithCounter'
import { cn } from '@/lib/utils'

type ActionFn = typeof createEvent | typeof updateEvent
type FormState = { error: string } | { success: true } | undefined

async function wrap(action: ActionFn, _prevState: FormState, formData: FormData): Promise<FormState> {
  return (await action(formData)) ?? undefined
}

export type EditableEvent = {
  id: string
  title: string
  summary: string | null
  starts_on: string
  ends_on: string | null
  time_label: string | null
  location_label: string | null
  place_id: string | null
  cta_type: EventCtaType
  package_id: string | null
  external_url: string | null
  is_active: boolean
  sort_order: number
}

type Option = { id: string; name: string }

type Props = {
  action: ActionFn
  event?: EditableEvent
  places: Option[]
  packages: Option[]
}

const INPUT =
  'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11'

export default function EventForm({ action, event, places, packages }: Props) {
  const boundAction = wrap.bind(null, action)
  const [state, formAction, isPending] = useActionState<FormState, FormData>(boundAction, undefined)
  const [ctaType, setCtaType] = useState<EventCtaType>(event?.cta_type ?? 'whatsapp')

  const copy = eventsCopy.admin.form

  useEffect(() => {
    if (state && 'error' in state) toast.error(state.error)
    if (state && 'success' in state) toast.success(copy.saved)
  }, [state, copy.saved])

  return (
    <form action={formAction} className="space-y-5">
      {event && <input type="hidden" name="eventId" value={event.id} />}

      <div className="space-y-1.5">
        <label htmlFor="title" className="block text-sm font-medium text-foreground">
          {copy.title} <span className="text-destructive">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={event?.title ?? ''}
          placeholder={copy.titlePlaceholder}
          maxLength={EVENT_TITLE_MAX}
          required
          className={INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="summary" className="block text-sm font-medium text-foreground">
          {copy.summary}
        </label>
        <TextareaWithCounter
          id="summary"
          name="summary"
          defaultValue={event?.summary ?? ''}
          placeholder={copy.summaryPlaceholder}
          rows={3}
          maxLength={EVENT_SUMMARY_MAX}
          textareaClassName="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="starts_on" className="block text-sm font-medium text-foreground">
            {copy.startsOn} <span className="text-destructive">*</span>
          </label>
          <input
            id="starts_on"
            name="starts_on"
            type="date"
            defaultValue={event?.starts_on ?? ''}
            required
            className={INPUT}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ends_on" className="block text-sm font-medium text-foreground">
            {copy.endsOn}
          </label>
          <input
            id="ends_on"
            name="ends_on"
            type="date"
            defaultValue={event?.ends_on ?? ''}
            aria-describedby="ends_on_hint"
            className={INPUT}
          />
        </div>
        <p id="ends_on_hint" className="-mt-2 text-xs text-muted-foreground sm:col-span-2">
          {copy.endsOnHint}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="time_label" className="block text-sm font-medium text-foreground">
          {copy.timeLabel}
        </label>
        <input
          id="time_label"
          name="time_label"
          type="text"
          defaultValue={event?.time_label ?? ''}
          placeholder={copy.timeLabelPlaceholder}
          maxLength={EVENT_TIME_LABEL_MAX}
          className={INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="location_label" className="block text-sm font-medium text-foreground">
          {copy.locationLabel}
        </label>
        <input
          id="location_label"
          name="location_label"
          type="text"
          defaultValue={event?.location_label ?? ''}
          placeholder={copy.locationLabelPlaceholder}
          maxLength={EVENT_LOCATION_MAX}
          className={INPUT}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="place_id" className="block text-sm font-medium text-foreground">
          {copy.place}
        </label>
        <select
          id="place_id"
          name="place_id"
          defaultValue={event?.place_id ?? ''}
          aria-describedby="place_id_hint"
          className={INPUT}
        >
          <option value="">{copy.placeNone}</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p id="place_id_hint" className="text-xs text-muted-foreground">
          {copy.placeHint}
        </p>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">{copy.ctaTitle}</legend>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EVENT_CTA_TYPES.map((type) => {
            const option = copy.ctaOptions[type]
            return (
              <label
                key={type}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  ctaType === type ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  name="cta_type"
                  value={type}
                  checked={ctaType === type}
                  onChange={() => setCtaType(type)}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            )
          })}
        </div>

        {ctaType === 'package' && (
          <div className="space-y-1.5">
            <label htmlFor="package_id" className="block text-sm font-medium text-foreground">
              {copy.package} <span className="text-destructive">*</span>
            </label>
            <select
              id="package_id"
              name="package_id"
              defaultValue={event?.package_id ?? ''}
              required
              className={INPUT}
            >
              <option value="" disabled>
                {copy.packagePlaceholder}
              </option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {ctaType === 'external' && (
          <div className="space-y-1.5">
            <label htmlFor="external_url" className="block text-sm font-medium text-foreground">
              {copy.externalUrl} <span className="text-destructive">*</span>
            </label>
            <input
              id="external_url"
              name="external_url"
              type="url"
              inputMode="url"
              defaultValue={event?.external_url ?? ''}
              placeholder={copy.externalUrlPlaceholder}
              pattern="https://.*"
              required
              className={INPUT}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">{copy.showcaseTitle}</legend>

        <label htmlFor="is_active" className="flex cursor-pointer items-start gap-3">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={event?.is_active ?? true}
            className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-foreground">{copy.isActive}</span>
            <span className="block text-xs text-muted-foreground">{copy.isActiveHint}</span>
          </span>
        </label>

        <div className="space-y-1.5">
          <label htmlFor="sort_order" className="block text-sm font-medium text-foreground">
            {copy.sortOrder}
          </label>
          <input
            id="sort_order"
            name="sort_order"
            type="number"
            min="0"
            max="9999"
            step="1"
            inputMode="numeric"
            defaultValue={event?.sort_order ?? 0}
            aria-describedby="sort_order_hint"
            className={INPUT}
          />
          <p id="sort_order_hint" className="text-xs text-muted-foreground">
            {copy.sortOrderHint}
          </p>
        </div>
      </fieldset>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? copy.submitting : copy.submit}
        </button>
        <Link
          href="/admin/eventos"
          className="inline-flex items-center justify-center rounded-xl border border-border text-sm text-foreground font-semibold min-h-11 px-4 hover:bg-muted transition-colors"
        >
          {copy.cancel}
        </Link>
      </div>
    </form>
  )
}
