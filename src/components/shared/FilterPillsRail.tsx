'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FilterPillItem = {
  key: string
  label: string
  href: string
}

/**
 * Horizontal-scroll pill rail with real prev/next controls, matching
 * FeaturedCarousel's pattern — a mouse-wheel scroll doesn't map to
 * horizontal by default, so without a click target the trailing pills
 * are only reachable by touch swipe or shift+scroll. Unlike
 * FeaturedCarousel, the arrows sit as flex siblings beside the scroll
 * area (not absolutely positioned over it) — pills are dense enough that
 * a floating button would otherwise sit on top of one.
 */
export default function FilterPillsRail({
  items,
  activeKey,
}: {
  items: FilterPillItem[]
  activeKey: string | null
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function updateScrollState() {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    updateScrollState()
  }, [items])

  function scroll(direction: 1 | -1) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const arrowClass = (enabled: boolean) =>
    cn(
      'hidden md:flex shrink-0 items-center justify-center size-8 rounded-full',
      'bg-muted text-foreground transition-opacity',
      enabled ? 'opacity-100 hover:bg-border' : 'opacity-0 pointer-events-none',
    )

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => scroll(-1)}
        disabled={!canScrollLeft}
        aria-label="Anterior"
        className={arrowClass(canScrollLeft)}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex-1 min-w-0 flex gap-2 overflow-x-auto scrollbar-none py-0.5"
      >
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-all active:scale-95',
              activeKey === item.key
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-transparent text-foreground/70 hover:bg-muted',
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scroll(1)}
        disabled={!canScrollRight}
        aria-label="Siguiente"
        className={arrowClass(canScrollRight)}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
