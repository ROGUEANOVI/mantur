// Calendar logic for tourism events. Event dates are plain `YYYY-MM-DD`
// strings (Postgres `date`) meaning a day in Colombia, so every comparison
// is done on those strings against "today in Bogotá" — never on Date
// objects in the server's timezone, which on Vercel is UTC and would flip
// the day five hours early.

export const EVENTS_TIMEZONE = 'America/Bogota'

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// `en-CA` formats as YYYY-MM-DD, which is exactly the shape we compare.
export function todayInBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENTS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m - 1, day: d }
}

export type EventDates = { starts_on: string; ends_on: string | null }

export function lastDay(event: EventDates): string {
  return event.ends_on ?? event.starts_on
}

export type EventPhase = 'upcoming' | 'ongoing' | 'finished'

export function eventPhase(event: EventDates, today: string): EventPhase {
  if (lastDay(event) < today) return 'finished'
  if (event.starts_on <= today) return 'ongoing'
  return 'upcoming'
}

// What the banner says about *when*, relative to today. `null` when the
// event is far enough away that the date itself says it best.
export type EventTiming = 'today' | 'ongoing' | 'tomorrow' | 'thisWeek' | null

export function eventTiming(event: EventDates, today: string): EventTiming {
  const phase = eventPhase(event, today)
  if (phase === 'finished') return null
  if (phase === 'ongoing') return event.ends_on && event.ends_on !== event.starts_on ? 'ongoing' : 'today'
  if (event.starts_on === addDays(today, 1)) return 'tomorrow'
  if (event.starts_on <= addDays(today, 6)) return 'thisWeek'
  return null
}

// The banner's date block: big day numbers, short month underneath.
//   14 → "14" / "dic"      14–16 dic → "14–16" / "dic"
//   30 dic–2 ene → "30–2" / "dic–ene"
export function dateBlock(event: EventDates): { days: string; months: string } {
  const start = parts(event.starts_on)
  if (!event.ends_on || event.ends_on === event.starts_on) {
    return { days: String(start.day), months: MONTHS_SHORT[start.month] }
  }
  const end = parts(event.ends_on)
  const months =
    start.month === end.month && start.year === end.year
      ? MONTHS_SHORT[start.month]
      : `${MONTHS_SHORT[start.month]}–${MONTHS_SHORT[end.month]}`
  return { days: `${start.day}–${end.day}`, months }
}

// Accessible, spoken form of the same range: "14 al 16 de diciembre".
export function dateRangeLabel(event: EventDates): string {
  const start = parts(event.starts_on)
  if (!event.ends_on || event.ends_on === event.starts_on) {
    return `${start.day} de ${MONTHS_LONG[start.month]}`
  }
  const end = parts(event.ends_on)
  if (start.month === end.month && start.year === end.year) {
    return `${start.day} al ${end.day} de ${MONTHS_LONG[end.month]}`
  }
  return `${start.day} de ${MONTHS_LONG[start.month]} al ${end.day} de ${MONTHS_LONG[end.month]}`
}
