'use client'

import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import Image from 'next/image'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { createPinIcon } from '@/lib/leafletPinIcon'
import { MANAURE_CENTER } from '@/lib/geo'

const pinIcon = createPinIcon()

export type EntityMapMarker = {
  id: string
  slug: string
  name: string
  lat: number
  lng: number
  images: string[] | null
  subtitle?: string
}

export default function EntityMap({
  items,
  basePath,
}: {
  items: EntityMapMarker[]
  basePath: string
}) {
  const center: [number, number] =
    items.length > 0
      ? [
          items.reduce((sum, i) => sum + i.lat, 0) / items.length,
          items.reduce((sum, i) => sum + i.lng, 0) / items.length,
        ]
      : MANAURE_CENTER

  return (
    <div className="h-[60vh] rounded-2xl overflow-hidden border border-border">
      <MapContainer center={center} zoom={14} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {items.map((item) => (
          <Marker key={item.id} position={[item.lat, item.lng]} icon={pinIcon}>
            <Popup>
              <Link href={`${basePath}/${item.slug}`} className="flex items-center gap-2 min-w-40">
                {item.images?.[0] && (
                  <div className="relative size-12 rounded-lg overflow-hidden shrink-0">
                    <Image src={item.images[0]} alt={item.name} fill sizes="48px" className="object-cover" />
                  </div>
                )}
                <div className="min-w-0">
                  {item.subtitle && (
                    <p className="text-xs font-medium text-primary">{item.subtitle}</p>
                  )}
                  <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                </div>
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
