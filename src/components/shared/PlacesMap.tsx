'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import Link from 'next/link'
import Image from 'next/image'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapPin } from 'lucide-react'
import { businessesCopy } from '@/lib/copy/businesses'

// Fallback center: Manaure Balcón del Cesar (same coordinates used in the
// site-wide JSON-LD geo block), for when there are no places to plot.
const DEFAULT_CENTER: [number, number] = [10.4, -73.1667]

const pinIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="bg-primary size-6 rounded-full border-2 border-white shadow-md flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
      <MapPin className="size-3.5 text-white" fill="currentColor" aria-hidden="true" />
    </div>,
  ),
  className: '',
  iconSize: [0, 0],
})

export type MapPlace = {
  id: string
  slug: string
  name: string
  type: string
  lat: number
  lng: number
  images: string[] | null
}

export default function PlacesMap({ places }: { places: MapPlace[] }) {
  const copy = businessesCopy.places

  const center: [number, number] =
    places.length > 0
      ? [
          places.reduce((sum, p) => sum + p.lat, 0) / places.length,
          places.reduce((sum, p) => sum + p.lng, 0) / places.length,
        ]
      : DEFAULT_CENTER

  return (
    <div className="h-[60vh] rounded-2xl overflow-hidden border border-border">
      <MapContainer center={center} zoom={14} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {places.map((place) => (
          <Marker key={place.id} position={[place.lat, place.lng]} icon={pinIcon}>
            <Popup>
              <Link href={`/lugares/${place.slug}`} className="flex items-center gap-2 min-w-40">
                {place.images?.[0] && (
                  <div className="relative size-12 rounded-lg overflow-hidden shrink-0">
                    <Image src={place.images[0]} alt={place.name} fill sizes="48px" className="object-cover" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-primary">
                    {copy.types[place.type] ?? copy.types.other}
                  </p>
                  <p className="text-sm font-semibold text-foreground truncate">{place.name}</p>
                </div>
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
