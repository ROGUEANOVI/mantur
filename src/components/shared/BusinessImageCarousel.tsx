'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Store, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Slide = { url: string; type: 'image' | 'video' }

const AUTOPLAY_MS = 5000

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
  const [paused, setPaused] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const slides: Slide[] = [
    ...images.map((url) => ({ url, type: 'image' as const })),
    ...videos.map((url) => ({ url, type: 'video' as const })),
  ]

  function scrollTo(index: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.offsetWidth, behavior: 'smooth' })
  }

  // Auto-advance between image slides. Skipped while paused (user is
  // hovering/touching the carousel), on a video slide (autoplay shouldn't
  // interrupt playback), or when the visitor prefers reduced motion.
  useEffect(() => {
    if (slides.length <= 1 || paused || lightboxIndex !== null) return
    if (slides[current]?.type === 'video') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const id = setTimeout(() => {
      const next = (current + 1) % slides.length
      scrollTo(next)
      setCurrent(next)
    }, AUTOPLAY_MS)

    return () => clearTimeout(id)
  }, [current, paused, lightboxIndex, slides.length])

  // Lightbox: Escape to close, and lock page scroll while it's open.
  useEffect(() => {
    if (lightboxIndex === null) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.classList.add('overflow-hidden')

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.classList.remove('overflow-hidden')
    }
  }, [lightboxIndex])

  if (slides.length === 0) {
    return (
      <div className="relative mx-4 mt-2 rounded-2xl h-56 md:h-80 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <Store className="size-16 text-primary/50" aria-hidden="true" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div
      className="relative mx-4 mt-2 rounded-2xl overflow-hidden h-56 md:h-80"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
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
            <button
              key={slide.url}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`Ver ${i === 0 ? name : `${name} — foto ${i + 1}`} en tamaño completo`}
              className="relative w-full h-full shrink-0 snap-start bg-gradient-to-br from-primary/10 to-accent/10 block p-0 border-0 cursor-zoom-in"
            >
              <Image
                src={slide.url}
                alt={i === 0 ? name : `${name} — foto ${i + 1}`}
                fill
                sizes="(min-width: 768px) 800px, 100vw"
                className="object-contain"
                priority={i === 0}
              />
            </button>
          ) : (
            <video
              key={slide.url}
              className="w-full h-full shrink-0 snap-start object-contain bg-black"
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

      {lightboxIndex !== null && slides[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`${name} — foto ampliada`}
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 flex items-center justify-center size-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          <div
            className="relative w-full h-full max-w-5xl max-h-[85vh] m-6"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={slides[lightboxIndex].url}
              alt={lightboxIndex === 0 ? name : `${name} — foto ${lightboxIndex + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
          </div>

          {images.length > 1 && lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setLightboxIndex(lightboxIndex - 1)
              }}
              aria-label="Ver foto anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center size-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
          )}
          {images.length > 1 && lightboxIndex < images.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setLightboxIndex(lightboxIndex + 1)
              }}
              aria-label="Ver foto siguiente"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center size-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
