'use client'

import { useRef, useState } from 'react'
import { Store, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Slide = { url: string; type: 'image' | 'video' }

export default function BusinessImageCarousel({
  images,
  videos = [],
  name,
}: {
  images: string[]
  videos?: string[]
  name: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)

  const slides: Slide[] = [
    ...images.map((url) => ({ url, type: 'image' as const })),
    ...videos.map((url) => ({ url, type: 'video' as const })),
  ]

  function scrollTo(index: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.offsetWidth, behavior: 'smooth' })
  }

  if (slides.length === 0) {
    return (
      <div className="relative mx-4 mt-2 rounded-2xl h-56 md:h-80 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <Store className="size-16 text-primary/50" aria-hidden="true" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div className="relative mx-4 mt-2 rounded-2xl overflow-hidden h-56 md:h-80">
      <div
        ref={scrollRef}
        className="flex h-full overflow-x-auto snap-x snap-mandatory scrollbar-none"
        onScroll={() => {
          const el = scrollRef.current
          if (el) setCurrent(Math.round(el.scrollLeft / el.offsetWidth))
        }}
      >
        {slides.map((slide, i) =>
          slide.type === 'image' ? (
            <div
              key={slide.url}
              className="w-full h-full shrink-0 snap-start bg-cover bg-center"
              style={{ backgroundImage: `url(${slide.url})` }}
              role="img"
              aria-label={i === 0 ? name : `${name} — foto ${i + 1}`}
            />
          ) : (
            <video
              key={slide.url}
              className="w-full h-full shrink-0 snap-start object-cover bg-black"
              src={slide.url}
              controls
              playsInline
              muted
              preload="metadata"
              aria-label={`${name} — video ${i + 1}`}
            />
          ),
        )}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      {/* Desktop arrow buttons */}
      {slides.length > 1 && current > 0 && (
        <button
          onClick={() => scrollTo(current - 1)}
          aria-label="Imagen anterior"
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2',
            'hidden md:flex items-center justify-center',
            'size-9 rounded-full bg-black/40 text-white',
            'hover:bg-black/65 transition-colors',
          )}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      )}
      {slides.length > 1 && current < slides.length - 1 && (
        <button
          onClick={() => scrollTo(current + 1)}
          aria-label="Siguiente imagen"
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2',
            'hidden md:flex items-center justify-center',
            'size-9 rounded-full bg-black/40 text-white',
            'hover:bg-black/65 transition-colors',
          )}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      )}

      {slides.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
          {slides.map((slide, i) => (
            <span
              key={slide.url}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === current ? 'w-4 bg-white' : 'w-1.5 bg-white/50',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
