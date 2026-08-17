'use client'

import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import type { LeafletEvent, Marker as LeafletMarker } from 'leaflet'
import { createPinIcon } from '@/lib/leafletPinIcon'
import { MANAURE_CENTER } from '@/lib/geo'

const pinIcon = createPinIcon()

type Coords = { lat: number; lng: number }

function ClickHandler({ onChange }: { onChange: (coords: Coords) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export default function LeafletLocationPicker({
  value,
  onChange,
}: {
  value: Coords | null
  onChange: (coords: Coords) => void
}) {
  const center: [number, number] = value ? [value.lat, value.lng] : MANAURE_CENTER

  return (
    <div className="h-56 rounded-2xl overflow-hidden border border-border">
      <MapContainer center={center} zoom={value ? 16 : 13} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onChange={onChange} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e: LeafletEvent) => {
                const marker = e.target as L.Marker
                const { lat, lng } = marker.getLatLng()
                onChange({ lat, lng })
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}
