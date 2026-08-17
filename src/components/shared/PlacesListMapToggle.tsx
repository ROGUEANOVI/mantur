'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
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
      <div className="flex justify-center gap-2 mb-4">
        {(['list', 'map'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-medium transition-all active:scale-95',
              view === v
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            {v === 'list' ? copy.listLabel : copy.mapLabel}
          </button>
        ))}
      </div>

      {view === 'list' ? children : <PlacesMap places={mapPlaces} />}
    </div>
  )
}
