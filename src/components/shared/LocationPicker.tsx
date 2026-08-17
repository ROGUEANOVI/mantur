'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const LeafletLocationPicker = dynamic(() => import('./LeafletLocationPicker'), {
  ssr: false,
  loading: () => <div className="h-56 rounded-2xl bg-muted animate-pulse" />,
})

type Coords = { lat: number; lng: number }

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
  const [coords, setCoords] = useState<Coords | null>(
    defaultLat != null && defaultLng != null ? { lat: defaultLat, lng: defaultLng } : null,
  )

  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      <LeafletLocationPicker value={coords} onChange={setCoords} />

      {coords && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-mono">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
          <button
            type="button"
            onClick={() => setCoords(null)}
            className="text-xs font-medium text-destructive hover:underline"
          >
            Quitar ubicación
          </button>
        </div>
      )}

      <input type="hidden" name="lat" value={coords?.lat ?? ''} />
      <input type="hidden" name="lng" value={coords?.lng ?? ''} />
    </div>
  )
}
