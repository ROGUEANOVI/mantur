'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { adminCopy } from '@/lib/copy/admin'
import { updatePackageContent } from '@/app/(app)/admin/paquetes/actions'
import { DIFFICULTIES, joinLines, type PackageContentFields } from '@/lib/packages/content'

type FormState = { error: string } | { success: true } | undefined

const copy = adminCopy.paquetes.content

const inputClass =
  'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11'
const textareaClass =
  'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y'

async function contentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return await updatePackageContent(formData)
}

type Props = {
  packageId: string
  content: PackageContentFields
}

// What the tourist sees on /paquetes/[slug]. Lists are edited one item per
// line; the server strips typed bullets and validates every limit.
export default function PackageContentForm({ packageId, content }: Props) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(contentAction, undefined)

  useEffect(() => {
    if (!state) return
    if ('error' in state) toast.error(state.error)
    else toast.success(copy.success)
  }, [state])

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="packageId" value={packageId} />

      <div>
        <h2 className="text-base font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
      </div>

      <Field id="content-summary" label={copy.summary}>
        <textarea
          id="content-summary"
          name="summary"
          rows={2}
          maxLength={280}
          defaultValue={content.summary ?? ''}
          placeholder={copy.summaryPlaceholder}
          className={textareaClass}
        />
      </Field>

      <Field id="content-itinerary" label={copy.itinerary}>
        <textarea
          id="content-itinerary"
          name="itinerary"
          rows={5}
          defaultValue={joinLines(content.itinerary)}
          placeholder={copy.itineraryPlaceholder}
          className={textareaClass}
        />
      </Field>

      <Field id="content-includes" label={copy.includes}>
        <textarea
          id="content-includes"
          name="includes"
          rows={5}
          defaultValue={joinLines(content.includes)}
          placeholder={copy.includesPlaceholder}
          className={textareaClass}
        />
      </Field>

      <Field id="content-what-to-bring" label={copy.whatToBring}>
        <textarea
          id="content-what-to-bring"
          name="what_to_bring"
          rows={3}
          defaultValue={joinLines(content.what_to_bring)}
          placeholder={copy.whatToBringPlaceholder}
          className={textareaClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="content-duration" label={copy.durationLabel}>
          <input
            id="content-duration"
            name="duration_label"
            type="text"
            maxLength={80}
            defaultValue={content.duration_label ?? ''}
            placeholder={copy.durationPlaceholder}
            className={inputClass}
          />
        </Field>
        <Field id="content-meeting-point" label={copy.meetingPoint}>
          <input
            id="content-meeting-point"
            name="meeting_point"
            type="text"
            maxLength={200}
            defaultValue={content.meeting_point ?? ''}
            placeholder={copy.meetingPointPlaceholder}
            className={inputClass}
          />
        </Field>
        <Field id="content-difficulty" label={copy.difficulty}>
          <select
            id="content-difficulty"
            name="difficulty"
            defaultValue={content.difficulty ?? ''}
            className={inputClass}
          >
            <option value="">{copy.difficultyPlaceholder}</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {copy.difficultyOptions[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="content-min-people" label={copy.minPeople}>
          <input
            id="content-min-people"
            name="min_people"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            defaultValue={content.min_people ?? ''}
            className={inputClass}
          />
        </Field>
      </div>

      <Field id="content-payment" label={copy.paymentInfo}>
        <textarea
          id="content-payment"
          name="payment_info"
          rows={2}
          maxLength={500}
          defaultValue={content.payment_info ?? ''}
          placeholder={copy.paymentInfoPlaceholder}
          className={textareaClass}
        />
      </Field>

      <Field id="content-cancellation" label={copy.cancellationPolicy}>
        <textarea
          id="content-cancellation"
          name="cancellation_policy"
          rows={3}
          maxLength={800}
          defaultValue={content.cancellation_policy ?? ''}
          className={textareaClass}
        />
      </Field>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isPending ? copy.submitting : copy.submit}
      </button>
    </form>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
