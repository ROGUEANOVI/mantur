'use client'

import { useEffect } from 'react'
import { track, type TrackEventMap } from '@/lib/analytics/track'

type ViewEvent = 'view_item' | 'view_item_list'

// Drop-in for server pages: fires one view event per page load. Renders
// nothing.
export default function TrackView<E extends ViewEvent>({
  event,
  params,
  dedupeKey,
}: {
  event: E
  params: TrackEventMap[E]
  dedupeKey: string
}) {
  useEffect(() => {
    track(event, params, dedupeKey)
    // params is a fresh object each render; dedupeKey identifies the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, dedupeKey])

  return null
}
