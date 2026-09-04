'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type ActionResult = { error: string } | void
type AvailabilityAction = (formData: FormData) => Promise<ActionResult>

type Copy = {
  weekdays: readonly string[]
  months: readonly string[]
  markUnavailable: string
  markAvailable: string
  legendAvailable: string
  legendUnavailable: string
  prevMonth: string
  nextMonth: string
}

type Props = {
  providerType: 'business' | 'guide'
  providerId: string
  action: AvailabilityAction
  unavailableDates: string[]
  copy: Copy
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// A month-grid calendar built without any date library — the codebase has
// none installed (react-day-picker, date-fns, etc.), and a "block these
// future dates" picker doesn't need one. Data for the whole future range
// is preloaded by the Server Component page (few rows, all 'unavailable'),
// so navigating months here is pure client state — no extra fetch.
export default function AvailabilityCalendar({ providerType, providerId, action, unavailableDates, copy }: Props) {
  const unavailableSet = new Set(unavailableDates)
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  // Week starts Monday: JS getDay() is Sunday-first (0-6), shift so Monday = 0.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label={copy.prevMonth}
          className="inline-flex items-center justify-center rounded-lg size-9 hover:bg-muted transition-colors"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-foreground">
          {copy.months[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label={copy.nextMonth}
          className="inline-flex items-center justify-center rounded-lg size-9 hover:bg-muted transition-colors"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {copy.weekdays.map((wd) => (
          <span key={wd} className="text-[11px] font-medium text-muted-foreground py-1">
            {wd}
          </span>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <span key={`blank-${idx}`} />
          const date = toDateKey(viewYear, viewMonth, day)
          return (
            <DayCell
              key={date}
              date={date}
              isPast={date < todayKey}
              isUnavailable={unavailableSet.has(date)}
              providerType={providerType}
              providerId={providerId}
              action={action}
              label={String(day)}
              markAvailableLabel={copy.markAvailable}
              markUnavailableLabel={copy.markUnavailable}
            />
          )
        })}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 border-t border-border">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          {copy.legendAvailable}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" aria-hidden="true" />
          {copy.legendUnavailable}
        </span>
      </div>
    </div>
  )
}

type FormState = { error: string | null }
const initialState: FormState = { error: null }

function DayCell({
  date,
  isPast,
  isUnavailable,
  providerType,
  providerId,
  action,
  label,
  markAvailableLabel,
  markUnavailableLabel,
}: {
  date: string
  isPast: boolean
  isUnavailable: boolean
  providerType: string
  providerId: string
  action: AvailabilityAction
  label: string
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
  }, [state.error])

  if (isPast) {
    return (
      <span className="flex items-center justify-center rounded-lg size-9 text-sm text-muted-foreground/40 mx-auto">
        {label}
      </span>
    )
  }

  const nextStatus = isUnavailable ? 'available' : 'unavailable'
  const actionLabel = isUnavailable ? markAvailableLabel : markUnavailableLabel

  return (
    <form action={dispatch} className="flex justify-center">
      {/* businessId and providerId both carry the same value — the business
          action reads businessId, the guide action ignores any id field
          entirely and resolves its own guideId server-side. */}
      <input type="hidden" name="businessId" value={providerId} />
      <input type="hidden" name="providerId" value={providerId} />
      <input type="hidden" name="providerType" value={providerType} />
      <input type="hidden" name="date" value={date} />
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
        'flex items-center justify-center rounded-lg size-9 text-sm font-medium transition-colors',
        isUnavailable
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200'
          : 'text-foreground hover:bg-muted',
        pending && 'opacity-50',
      )}
    >
      {label}
    </button>
  )
}
