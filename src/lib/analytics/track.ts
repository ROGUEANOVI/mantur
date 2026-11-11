// Typed dataLayer events (docs/specs/SPEC-paquetes-tracking.md §4.2). GTM
// maps them to GA4 and Meta Pixel; pushes made before the visitor consents
// just sit in the dataLayer and are never sent anywhere, because GTM isn't
// loaded until consent is granted.

export type TrackEventMap = {
  view_item_list: { item_list_name: string; items: { item_id: string; item_name: string }[] }
  view_item: { paquete_id: string; paquete_nombre: string; value: number; currency: 'COP' }
  whatsapp_click: {
    paquete_id?: string
    paquete_nombre?: string
    value?: number
    currency?: 'COP'
    // Where the button was: package_detail, package_card, business, …
    ubicacion: string
  }
  request_submit: { paquete_id: string; value: number; currency: 'COP' }
}

export type TrackEventName = keyof TrackEventMap

type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] }

// View events fire from useEffect, which React may run twice (Strict Mode,
// re-renders). One push per event + key per page load is enough.
const sentOnce = new Set<string>()

export function track<E extends TrackEventName>(event: E, params: TrackEventMap[E], dedupeKey?: string): void {
  if (typeof window === 'undefined') return
  if (dedupeKey) {
    const key = `${event}:${dedupeKey}:${window.location.pathname}`
    if (sentOnce.has(key)) return
    sentOnce.add(key)
  }
  const w = window as DataLayerWindow
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({ event, ...params })
}

// Test helper: forget which view events were already sent.
export function resetTrackDedupe(): void {
  sentOnce.clear()
}
