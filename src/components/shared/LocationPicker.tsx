'use client'

import { useId, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { locationPickerCopy } from '@/lib/copy/location'

const LeafletLocationPicker = dynamic(() => import('./LeafletLocationPicker'), {
  ssr: false,
  loading: () => <div className="h-56 rounded-2xl bg-muted animate-pulse" />,
})

const copy = locationPickerCopy

export default function LocationPicker({
  defaultLat,
  defaultLng,
  label,
  hint,
}: {
  defaultLat: number | null
  defaultLng: number | null
  label?: string
  hint?: string
}) {
  const latId = useId()
  const lngId = useId()

  // The two number inputs below are the single source of truth — they're
  // also the fields the form actually submits (name="lat"/"lng"). The map
  // just writes into them when clicked/dragged, so typing coordinates by
  // hand and clicking the map stay in sync automatically either way.
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : '')
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : '')

  const coords = useMemo(() => {
    const la = parseFloat(lat)
    const lo = parseFloat(lng)
    return Number.isFinite(la) && Number.isFinite(lo) ? { lat: la, lng: lo } : null
  }, [lat, lng])

  function handleMapChange(next: { lat: number; lng: number }) {
    setLat(next.lat.toFixed(6))
    setLng(next.lng.toFixed(6))
  }

  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      <LeafletLocationPicker value={coords} onChange={handleMapChange} />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{copy.manualHint}</p>
        {coords && (
          <button
            type="button"
            onClick={() => {
              setLat('')
              setLng('')
            }}
            className="text-xs font-medium text-destructive hover:underline shrink-0"
          >
            {copy.clear}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={latId} className="block text-xs font-medium text-foreground">
            {copy.lat}
          </label>
          <input
            id={latId}
            name="lat"
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder={copy.latPlaceholder}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={lngId} className="block text-xs font-medium text-foreground">
            {copy.lng}
          </label>
          <input
            id={lngId}
            name="lng"
            type="number"
            step="any"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder={copy.lngPlaceholder}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-11"
          />
        </div>
      </div>
    </div>
  )
}
