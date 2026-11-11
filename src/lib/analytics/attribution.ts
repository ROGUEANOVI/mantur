// First-touch campaign attribution. Ads link to mantur.co with UTM tags
// (docs/specs/SPEC-paquetes-tracking.md: utm_campaign=mt_{objetivo}_{paquete}_{aaaamm})
// and Google/Meta append gclid/fbclid. We keep the first values seen in
// this browser session so that, when the visitor finally writes on
// WhatsApp or sends a request, ManTur can tell which campaign brought them.
//
// Only campaign parameters are stored — nothing personal — in
// sessionStorage, and nothing leaves the browser unless the visitor
// contacts ManTur themselves.

export const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'gclid',
  'fbclid',
] as const

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number]
export type Attribution = Partial<Record<AttributionKey, string>>

const STORAGE_KEY = 'mantur-attribution-v1'
const MAX_VALUE_LENGTH = 150

// Only letters, digits and the separators campaigns actually use; anything
// else is dropped so a crafted URL can't smuggle text into a WhatsApp
// message or an admin screen.
function clean(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim().slice(0, MAX_VALUE_LENGTH)
  return /^[\w.\-~+:]+$/.test(trimmed) ? trimmed : null
}

export function parseAttribution(search: string): Attribution {
  const params = new URLSearchParams(search)
  const result: Attribution = {}
  for (const key of ATTRIBUTION_KEYS) {
    const value = clean(params.get(key))
    if (value) result[key] = value
  }
  return result
}

// Re-validated on read: sessionStorage is same-origin but editable from
// devtools, and its values end up in WhatsApp messages and form inputs.
export function readAttribution(): Attribution {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const stored = JSON.parse(raw) as Record<string, unknown>
    const result: Attribution = {}
    for (const key of ATTRIBUTION_KEYS) {
      const value = clean(typeof stored[key] === 'string' ? (stored[key] as string) : null)
      if (value) result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

// First touch wins: a later internal navigation without UTMs (or a second
// ad click in the same session) never overwrites what brought them first.
export function captureAttribution(search: string): Attribution {
  const existing = readAttribution()
  if (Object.keys(existing).length > 0) return existing
  const incoming = parseAttribution(search)
  if (Object.keys(incoming).length === 0) return existing
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(incoming))
  } catch {
    // Storage blocked: attribution just won't carry over to the next page.
  }
  return incoming
}

// bookings.acquisition_source values (see the migration's CHECK list).
export const ACQUISITION_SOURCES = [
  'meta_ads',
  'google_ads',
  'instagram',
  'facebook',
  'tiktok',
  'google_organic',
  'referral',
  'returning',
  'other',
] as const
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number]

const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paid_social', 'paidsocial', 'ads'])

// Best-effort channel for a web request, from first-touch UTMs/click ids.
// null when the visit carried no campaign info (direct / unknown).
export function sourceFromAttribution(a: Attribution): AcquisitionSource | null {
  const source = a.utm_source?.toLowerCase() ?? ''
  const medium = a.utm_medium?.toLowerCase() ?? ''
  const paid = PAID_MEDIUMS.has(medium)

  if (a.gclid || (source === 'google' && paid)) return 'google_ads'
  if (a.fbclid && paid) return 'meta_ads'
  if (['meta', 'facebook', 'fb', 'instagram', 'ig'].includes(source) && paid) return 'meta_ads'
  if (source === 'instagram' || source === 'ig') return 'instagram'
  if (source === 'facebook' || source === 'fb' || a.fbclid) return 'facebook'
  if (source === 'tiktok') return 'tiktok'
  if (source === 'google') return 'google_organic'
  if (source) return 'other'
  return null
}

// Server-side: the acquisition fields a form sent, validated against the
// same allowlist/charset as the DB. Bad values become null instead of
// failing the booking — this is marketing metadata, never a blocker.
export function parseAcquisition(formData: FormData): {
  acquisition_source: AcquisitionSource | null
  acquisition_campaign: string | null
} {
  const rawSource = ((formData.get('acquisition_source') as string | null) ?? '').trim()
  const source = ACQUISITION_SOURCES.includes(rawSource as AcquisitionSource) ? (rawSource as AcquisitionSource) : null
  return {
    acquisition_source: source,
    acquisition_campaign: clean((formData.get('acquisition_campaign') as string | null) ?? null),
  }
}

// Same charset as the DB CHECK on bookings.acquisition_campaign.
export function cleanCampaign(value: string | null | undefined): string | null {
  return clean(value ?? null)
}

// Short tag appended to WhatsApp messages: the campaign name when there is
// one, otherwise the source ("google", "meta"…). Empty for direct visits.
export function campaignTag(attribution: Attribution): string {
  return attribution.utm_campaign ?? attribution.utm_source ?? ''
}
