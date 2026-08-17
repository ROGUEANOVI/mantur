'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { List, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { businessesCopy } from '@/lib/copy/businesses'
import type { MapPlace } from '@/components/shared/PlacesMap'

const PlacesMap = dynamic(() => import('@/components/shared/PlacesMap'), {
  ssr: false,
  loading: () => <div className="h-[60vh] rounded-2xl bg-muted animate-pulse" />,
})

export default function PlacesListMapToggle({
  mapPlaces,
  children,
}: {
  mapPlaces: MapPlace[]
  children: React.ReactNode
}) {
  const [view, setView] = useState<'list' | 'map'>('list')
  const copy = businessesCopy.places

  return (
    <div>
      <div className="flex justify-center mb-4">
        <div
          role="tablist"
          aria-label="Cambiar vista"
          className="inline-flex p-1 rounded-full border border-border bg-muted"
        >
          {(
            [
              { key: 'list', label: copy.listLabel, Icon: List },
              { key: 'map', label: copy.mapLabel, Icon: MapIcon },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all active:scale-95',
                view === key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? children : <PlacesMap places={mapPlaces} />}
    </div>
  )
}
