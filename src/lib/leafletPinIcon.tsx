import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapPin } from 'lucide-react'

// Client-only: touches `L`/`window` at call time. Only call this from a
// module that is itself loaded via `dynamic(..., { ssr: false })`.
export function createPinIcon() {
  return L.divIcon({
    html: renderToStaticMarkup(
      <div className="bg-primary size-6 rounded-full border-2 border-white shadow-md flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
        <MapPin className="size-3.5 text-white" fill="currentColor" aria-hidden="true" />
      </div>,
    ),
    className: '',
    iconSize: [0, 0],
  })
}
