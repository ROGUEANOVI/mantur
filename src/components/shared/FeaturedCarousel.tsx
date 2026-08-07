'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function FeaturedCarousel({ children }: { children: React.ReactNode }) {
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
  }, [])

  function scroll(direction: 1 | -1) {
    const el = scrollRef.current
    if (!el) return
    const item = el.querySelector<HTMLElement>('[data-carousel-item]')
    const amount = item ? item.offsetWidth + 16 : el.clientWidth * 0.8
    el.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-4 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scrollbar-none"
      >
        {children}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Anterior"
          className={cn(
            'absolute left-1 top-1/2 -translate-y-1/2',
            'hidden md:flex items-center justify-center',
            'size-9 rounded-full bg-card border border-border text-foreground shadow-sm',
            'hover:bg-muted transition-colors',
          )}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="Siguiente"
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2',
            'hidden md:flex items-center justify-center',
            'size-9 rounded-full bg-card border border-border text-foreground shadow-sm',
            'hover:bg-muted transition-colors',
          )}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
