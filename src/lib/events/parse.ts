import { eventsCopy } from '@/lib/copy/events'
import { isIsoDate } from '@/lib/events/dates'

export const EVENT_CTA_TYPES = ['whatsapp', 'package', 'external', 'none'] as const
export type EventCtaType = (typeof EVENT_CTA_TYPES)[number]

export const EVENT_TITLE_MAX = 90
export const EVENT_SUMMARY_MAX = 220
export const EVENT_TIME_LABEL_MAX = 60
export const EVENT_LOCATION_MAX = 90
const MAX_SORT_ORDER = 9999

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ParsedEventFields = {
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

function text(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname)
  } catch {
    return false
  }
}

// Shape and format only. Whether place_id/package_id point at real rows is
// checked by the Server Action against the database.
export function parseEventFields(formData: FormData): { error: string } | { fields: ParsedEventFields } {
  const copy = eventsCopy.admin.errors

  const title = text(formData, 'title')
  if (!title) return { error: copy.titleRequired }
  if (title.length > EVENT_TITLE_MAX) return { error: copy.titleTooLong }

  const summary = text(formData, 'summary') || null
  if (summary && summary.length > EVENT_SUMMARY_MAX) return { error: copy.summaryTooLong }

  const startsOn = text(formData, 'starts_on')
  if (!isIsoDate(startsOn)) return { error: copy.invalidStartsOn }

  const rawEndsOn = text(formData, 'ends_on')
  let endsOn: string | null = null
  if (rawEndsOn) {
    if (!isIsoDate(rawEndsOn)) return { error: copy.invalidEndsOn }
    if (rawEndsOn < startsOn) return { error: copy.endsBeforeStart }
    // A one-day range is stored as a single-day event.
    endsOn = rawEndsOn === startsOn ? null : rawEndsOn
  }

  const timeLabel = text(formData, 'time_label') || null
  if (timeLabel && timeLabel.length > EVENT_TIME_LABEL_MAX) return { error: copy.timeLabelTooLong }

  const locationLabel = text(formData, 'location_label') || null
  if (locationLabel && locationLabel.length > EVENT_LOCATION_MAX) return { error: copy.locationTooLong }

  const rawPlaceId = text(formData, 'place_id')
  if (rawPlaceId && !UUID_RE.test(rawPlaceId)) return { error: copy.invalidPlace }

  const ctaType = text(formData, 'cta_type') as EventCtaType
  if (!EVENT_CTA_TYPES.includes(ctaType)) return { error: copy.invalidCtaType }

  // Only the field the chosen CTA uses is kept, so switching an event from
  // "package" to "WhatsApp" doesn't leave a stale package link behind.
  let packageId: string | null = null
  let externalUrl: string | null = null
  if (ctaType === 'package') {
    const rawPackageId = text(formData, 'package_id')
    if (!rawPackageId) return { error: copy.packageRequired }
    if (!UUID_RE.test(rawPackageId)) return { error: copy.invalidPackage }
    packageId = rawPackageId
  }
  if (ctaType === 'external') {
    const rawUrl = text(formData, 'external_url')
    if (!isHttpsUrl(rawUrl)) return { error: copy.invalidExternalUrl }
    externalUrl = rawUrl
  }

  // Unchecked checkboxes are absent from FormData — absence means false.
  const isActive = formData.get('is_active') === 'on'

  const rawSortOrder = text(formData, 'sort_order')
  const sortOrder = rawSortOrder ? Number(rawSortOrder) : 0
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > MAX_SORT_ORDER) {
    return { error: copy.invalidSortOrder }
  }

  return {
    fields: {
      title,
      summary,
      starts_on: startsOn,
      ends_on: endsOn,
      time_label: timeLabel,
      location_label: locationLabel,
      place_id: rawPlaceId || null,
      cta_type: ctaType,
      package_id: packageId,
      external_url: externalUrl,
      is_active: isActive,
      sort_order: sortOrder,
    },
  }
}
