'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Business/place/service descriptions have no length limit anywhere (DB,
// form, or server action), and this text sits in a `position: sticky`
// column — an overlong description would push whatever follows it below the
// viewport with no way to scroll it back into view until the whole sticky
// column releases. Clamping keeps that column's height predictable; "Leer
// más" only appears when the clamp actually cut something.
export default function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) setTruncated(el.scrollHeight > el.clientHeight + 1)
  }, [text])

  return (
    <div className={className}>
      <p
        ref={ref}
        className={cn('text-sm text-foreground/80 leading-relaxed', !expanded && 'line-clamp-4')}
      >
        {text}
      </p>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm font-semibold text-primary hover:underline"
        >
          {expanded ? 'Leer menos' : 'Leer más'}
        </button>
      )}
    </div>
  )
}
