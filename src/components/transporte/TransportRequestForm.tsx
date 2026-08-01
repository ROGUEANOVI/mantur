'use client'

import { useActionState } from 'react'
import { createTransportRequest } from '@/app/(app)/transporte/actions'
import { transportCopy } from '@/lib/copy/transport'

type State = { error: string } | void

export default function TransportRequestForm() {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    createTransportRequest,
    undefined,
  )

  const copy = transportCopy.requestForm

  // Minimum datetime: now (rounded to next minute) in local time for the picker.
  const minDatetime = new Date(Date.now() + 60_000)
    .toISOString()
    .slice(0, 16)

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="origin"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          {copy.origin} <span aria-hidden="true" className="text-destructive">*</span>
        </label>
        <input
          id="origin"
          name="origin"
          type="text"
          required
          placeholder={copy.originPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label
          htmlFor="destination"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          {copy.destination} <span aria-hidden="true" className="text-destructive">*</span>
        </label>
        <input
          id="destination"
          name="destination"
          type="text"
          required
          placeholder={copy.destinationPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label
          htmlFor="requested_datetime"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          {copy.requestedDatetime} <span aria-hidden="true" className="text-destructive">*</span>
        </label>
        <input
          id="requested_datetime"
          name="requested_datetime"
          type="datetime-local"
          required
          min={minDatetime}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label
          htmlFor="people_count"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          {copy.peopleCount}
        </label>
        <input
          id="people_count"
          name="people_count"
          type="number"
          min="1"
          max="20"
          defaultValue="1"
          required
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-foreground mb-1.5"
        >
          {copy.notes}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder={copy.notesPlaceholder}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold text-sm min-h-[44px] px-6 hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? copy.submitting : copy.submit}
      </button>
    </form>
  )
}
