'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ActionResult = { error: string } | void
type WeeklyAvailabilityAction = (formData: FormData) => Promise<ActionResult>

type Copy = {
  weekdays: readonly string[]
  markUnavailable: string
  markAvailable: string
  weeklyPatternTitle: string
  weeklyPatternSubtitle: string
}

type Props = {
  providerType: 'business' | 'guide' | 'transporter'
  providerId: string
  action: WeeklyAvailabilityAction
  unavailableWeekdays: number[]
  copy: Copy
}

// A fixed 7-cell row (0=Sunday..6=Saturday, same convention as
// provider_weekly_availability.weekday) — no month navigation needed, unlike
// AvailabilityCalendar's per-date grid. Sits above AvailabilityCalendar on
// each general provider calendar page: this sets the recurring baseline,
// the per-date grid below it handles one-off exceptions in either direction.
export default function WeeklyAvailabilityPattern({
  providerType,
  providerId,
  action,
  unavailableWeekdays,
  copy,
}: Props) {
  const unavailableSet = new Set(unavailableWeekdays)
  // copy.weekdays is Lun..Dom (ISO order); weekday values are 0=Sun..6=Sat —
  // map each display column to its real weekday number.
  const columns = copy.weekdays.map((label, i) => ({ label, weekday: (i + 1) % 7 }))

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{copy.weeklyPatternTitle}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{copy.weeklyPatternSubtitle}</p>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {columns.map(({ label, weekday }) => (
          <WeekdayCell
            key={weekday}
            label={label}
            weekday={weekday}
            isUnavailable={unavailableSet.has(weekday)}
            providerType={providerType}
            providerId={providerId}
            action={action}
            markAvailableLabel={copy.markAvailable}
            markUnavailableLabel={copy.markUnavailable}
          />
        ))}
      </div>
    </div>
  )
}

type FormState = { error: string | null }
const initialState: FormState = { error: null }

function WeekdayCell({
  label,
  weekday,
  isUnavailable,
  providerType,
  providerId,
  action,
  markAvailableLabel,
  markUnavailableLabel,
}: {
  label: string
  weekday: number
  isUnavailable: boolean
  providerType: string
  providerId: string
  action: WeeklyAvailabilityAction
  markAvailableLabel: string
  markUnavailableLabel: string
}) {
  const [state, dispatch] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await action(formData)
    if (result && 'error' in result) return { error: result.error }
    return { error: null }
  }, initialState)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state])

  const nextStatus = isUnavailable ? 'available' : 'unavailable'
  const actionLabel = isUnavailable ? markAvailableLabel : markUnavailableLabel

  return (
    <form action={dispatch} className="flex justify-center">
      {/* businessId and providerId both carry the same value — the business
          action reads businessId (a business owner can own several
          businesses, so the id must come from the form), the
          guide/transporter actions ignore any id field entirely and resolve
          their own guideId/transporterId server-side. Same pattern as
          AvailabilityCalendar's DayCell. */}
      <input type="hidden" name="businessId" value={providerId} />
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="providerType" value={providerType} />
      <input type="hidden" name="weekday" value={weekday} />
      <input type="hidden" name="status" value={nextStatus} />
      <SubmitCell isUnavailable={isUnavailable} label={label} actionLabel={actionLabel} />
    </form>
  )
}

function SubmitCell({
  isUnavailable,
  label,
  actionLabel,
}: {
  isUnavailable: boolean
  label: string
  actionLabel: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`${label}: ${actionLabel}`}
      className={cn(
        'flex items-center justify-center rounded-lg h-9 w-full text-xs font-medium transition-colors',
        isUnavailable
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200'
          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200',
        pending && 'opacity-50',
      )}
    >
      {label}
    </button>
  )
}
