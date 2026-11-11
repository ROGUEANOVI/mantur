'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { linkifyText } from '@/lib/text/linkify'

// Static class names so Tailwind can see them.
const CLAMP_CLASSES = { 4: 'line-clamp-4', 8: 'line-clamp-8' } as const

// Business/place/service descriptions have no length limit anywhere (DB,
// form, or server action), and this text sits in a `position: sticky`
// column — an overlong description would push whatever follows it below the
// viewport with no way to scroll it back into view until the whole sticky
// column releases. Clamping keeps that column's height predictable; "Leer
// más" only appears when the clamp actually cut something.
//
// Descriptions are typed in a plain textarea, so their line breaks are the
// author's structure (lists, "¿Qué incluye?" sections): they're kept with
// `whitespace-pre-line`, and typed URLs / WhatsApp numbers become links.
export default function ExpandableText({
  text,
  className,
  clampLines = 4,
}: {
  text: string
  className?: string
  clampLines?: keyof typeof CLAMP_CLASSES
}) {
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
        className={cn(
          'whitespace-pre-line text-sm text-foreground/80 leading-relaxed',
          !expanded && CLAMP_CLASSES[clampLines],
        )}
      >
        {linkifyText(text.replace(/\r\n?/g, '\n'))}
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
