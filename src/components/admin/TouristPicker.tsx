'use client'

import { useRef, useState } from 'react'
import { searchTourists, type TouristSearchResult } from '@/app/(app)/admin/reservas/actions'
import { adminCopy } from '@/lib/copy/admin'
import { Label } from '@/components/ui/label'

const copy = adminCopy.reservas

type Props = {
  selected: TouristSearchResult | null
  onSelect: (tourist: TouristSearchResult | null) => void
  // Hide the "Turista" label when the caller already labels the block.
  showLabel?: boolean
}

// Debounced search over registered tourists (by name or phone), shared by
// the service/tour and package sections of /admin/reservas/nueva.
export default function TouristPicker({ selected, onSelect, showLabel = true }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TouristSearchResult[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(value: string) {
    setQuery(value)
    onSelect(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      setResults(await searchTourists(value))
    }, 300)
  }

  return (
    <div className="space-y-1.5">
      {showLabel && <Label className="text-sm font-medium">{copy.touristLabel}</Label>}
      {selected ? (
        <div className="flex items-center justify-between rounded-xl border border-input bg-muted/50 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-foreground">{selected.full_name ?? '—'}</p>
            {selected.phone && <p className="text-xs text-muted-foreground">{selected.phone}</p>}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-sm text-primary hover:underline cursor-pointer"
          >
            {copy.touristChange}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={copy.touristSearchPlaceholder}
            aria-label={copy.touristSearchPlaceholder}
            className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {query.trim().length < 2 ? (
            <p className="text-xs text-muted-foreground">{copy.touristSearchHint}</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground">{copy.touristNoResults}</p>
          ) : (
            <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {results.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
                  >
                    <span className="font-medium text-foreground">{t.full_name ?? '—'}</span>
                    {t.phone && <span className="text-muted-foreground"> · {t.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
