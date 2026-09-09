'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Copy = {
  weekdays: readonly string[]
  months: readonly string[]
  prevMonth: string
  nextMonth: string
  legendAvailable: string
  legendUnavailable: string
}

type Props = {
  name: string
  blockedDates: string[]
  copy: Copy
  onSelect?: (date: string) => void
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Read-only sibling of AvailabilityCalendar: a native <input type=date> can't
// disable individual dates (only min/max), so blocking specific unavailable
// dates up front — the whole point of this component — needs a real
// month-grid. No per-day server action here, just local selection state
// mirrored into a hidden input the surrounding form already reads.
export default function BlockedDatesPicker({ name, blockedDates, copy, onSelect }: Props) {
  const blockedSet = new Set(blockedDates)
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
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

  function handleSelect(date: string) {
    setSelected(date)
    onSelect?.(date)
  }

  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-4">
      <input type="hidden" name={name} value={selected ?? ''} />

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
          const isPast = date < todayKey
          const isBlocked = blockedSet.has(date)
          const isSelected = date === selected

          if (isPast || isBlocked) {
            return (
              <span
                key={date}
                aria-label={`${day}: ${copy.legendUnavailable}`}
                className="flex items-center justify-center rounded-lg size-9 text-sm mx-auto text-muted-foreground/40 bg-red-50 dark:bg-red-950/20"
              >
                {day}
              </span>
            )
          }

          return (
            <button
              key={date}
              type="button"
              onClick={() => handleSelect(date)}
              aria-pressed={isSelected}
              aria-label={`${day}: ${copy.legendAvailable}`}
              className={cn(
                'flex items-center justify-center rounded-lg size-9 mx-auto text-sm font-medium transition-colors',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 border-t border-border">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-green-500" aria-hidden="true" />
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
