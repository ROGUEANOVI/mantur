import { dateBlock, dateRangeLabel, eventTiming, type EventTiming } from '@/lib/events/dates'
import type { EventCtaType } from '@/lib/events/parse'

// Row shape the home page reads (tourism_events + the joined place/package).
export type EventRow = {
  id: string
  title: string
  summary: string | null
  starts_on: string
  ends_on: string | null
  time_label: string | null
  location_label: string | null
  image_url: string | null
  cta_type: EventCtaType
  external_url: string | null
  places: { name: string; slug: string } | null
  packages: { slug: string; name: string; is_active: boolean } | null
}

export type BannerCta =
  | { kind: 'whatsapp' }
  | { kind: 'package'; href: string; packageName: string }
  | { kind: 'external'; href: string }
  | { kind: 'none' }

// Everything the banner renders, already resolved on the server so the
// client component only handles rotation.
export type BannerEvent = {
  id: string
  title: string
  summary: string | null
  imageUrl: string | null
  days: string
  months: string
  dateLabel: string
  timeLabel: string | null
  location: string | null
  placeHref: string | null
  timing: EventTiming
  cta: BannerCta
}

function resolveCta(row: EventRow): BannerCta {
  switch (row.cta_type) {
    case 'package':
      // The package may have been deactivated or deleted (package_id is ON
      // DELETE SET NULL) after the event was set up: fall back to WhatsApp
      // rather than linking to a 404 or dropping the call to action.
      if (row.packages?.is_active) {
        return { kind: 'package', href: `/paquetes/${row.packages.slug}`, packageName: row.packages.name }
      }
      return { kind: 'whatsapp' }
    case 'external':
      return row.external_url ? { kind: 'external', href: row.external_url } : { kind: 'none' }
    case 'none':
      return { kind: 'none' }
    default:
      return { kind: 'whatsapp' }
  }
}

export function toBannerEvent(row: EventRow, today: string): BannerEvent {
  const { days, months } = dateBlock(row)
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    imageUrl: row.image_url,
    days,
    months,
    dateLabel: dateRangeLabel(row),
    timeLabel: row.time_label,
    location: row.location_label ?? row.places?.name ?? null,
    placeHref: row.places ? `/lugares/${row.places.slug}` : null,
    timing: eventTiming(row, today),
    cta: resolveCta(row),
  }
}
