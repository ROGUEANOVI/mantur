'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, LayoutGrid, Play, Store, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type Slide = { url: string; type: 'image' | 'video' }

const MAX_TILES = 5

/**
 * Grid placement for a mosaic tile, shared by every breakpoint — only the
 * col/row spans change at `lg:`, so mobile and desktop are one DOM tree.
 * Exported for direct unit testing of the degradation table (1/2/3/4/5 tiles).
 */
export function getTileClasses(count: number, index: number): string {
  if (count === 1) return 'col-span-4 row-span-2 aspect-[16/10] lg:aspect-auto'
  if (count === 2) return 'col-span-2 row-span-2 aspect-square lg:aspect-auto'
  if (index === 0) {
    return 'col-span-4 aspect-[16/10] lg:col-span-2 lg:row-span-2 lg:aspect-auto'
  }
  // 3 thumbs would leave a gap at full width on mobile with a 1-col span each
  // (2 tiles of 1/4 width), so they widen to fill the row; 4+ thumbs already
  // fill it at 1 column each. Desktop always auto-places thumbs into the
  // remaining 2x2 area regardless of how many there are.
  const mobileSpan = count === 3 ? 'col-span-2' : 'col-span-1'
  return `${mobileSpan} aspect-square lg:col-span-1 lg:row-span-1 lg:aspect-auto`
}

export default function MediaGallery({
  images,
  videos = [],
  name,
}: {
  images: string[]
  videos?: string[]
  name: string
}) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const slides: Slide[] = [
    ...images.map((url) => ({ url, type: 'image' as const })),
    ...videos.map((url) => ({ url, type: 'video' as const })),
  ]

  if (slides.length === 0) {
    return (
      <div className="relative rounded-2xl h-56 md:h-80 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <Store className="size-16 text-primary/50" aria-hidden="true" strokeWidth={1.5} />
      </div>
    )
  }

  const visible = slides.slice(0, MAX_TILES)
  const extraCount = slides.length - MAX_TILES

  return (
    <Dialog
      open={galleryOpen}
      onOpenChange={(next, eventDetails) => {
        // While the single-photo lightbox is open on top of the grid, Escape
        // should back out one layer at a time — without this, Base UI's own
        // Escape handling closes the grid dialog under it in the same
        // keypress, leaving the lightbox orphaned with no grid to return to.
        if (eventDetails.reason === 'escape-key' && lightboxIndex !== null) {
          eventDetails.cancel()
          setLightboxIndex(null)
          return
        }
        setGalleryOpen(next)
      }}
    >
      <div className="relative">
        <div className="grid grid-cols-4 gap-1 rounded-2xl overflow-hidden lg:grid-rows-2 lg:h-[420px]">
          {visible.map((slide, i) => (
            <GalleryTile
              key={slide.url}
              slide={slide}
              index={i}
              count={visible.length}
              name={name}
              overlayCount={i === visible.length - 1 && extraCount > 0 ? extraCount : undefined}
              onOpen={() => setGalleryOpen(true)}
            />
          ))}
        </div>

        {slides.length > 1 && (
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 text-foreground text-xs font-semibold px-3 py-1.5 shadow hover:bg-white active:scale-95 transition-all"
          >
            <LayoutGrid className="size-3.5" aria-hidden="true" />
            Ver todas las fotos
          </button>
        )}
      </div>

      <DialogContent className="fixed inset-0 top-0 left-0 z-50 flex flex-col w-screen h-screen max-w-none sm:max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none p-0 bg-background text-foreground ring-0">
        <DialogTitle className="sr-only">{`${name} — todas las fotos y videos`}</DialogTitle>
        <DialogDescription className="sr-only">
          Galería completa de fotos y videos de {name}.
        </DialogDescription>

        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground truncate pr-10">{name}</p>
        </div>

        {/*
          A masonry photo wall (CSS multi-column), not a uniform grid: every
          tile keeps its source aspect ratio instead of being cropped into an
          identical box, which is what makes Airbnb's "show all photos" view
          read as a real photo wall rather than a grid of thumbnails. That
          needs the image's own intrinsic size to drive layout, which
          next/image's `fill` mode can't do — a plain `<img>` is used here on
          purpose (same precedent as the avatar image in UserMenu.tsx).
        */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-2">
            {slides.map((slide, i) => {
              const label = i === 0 ? name : `${name} — ${slide.type === 'image' ? 'foto' : 'video'} ${i + 1}`
              return (
                <button
                  key={slide.url}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`Ver ${label} en tamaño completo`}
                  className="relative block w-full mb-2 break-inside-avoid rounded-xl overflow-hidden bg-muted p-0 border-0 cursor-zoom-in"
                >
                  {slide.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slide.url} alt={label} loading="lazy" className="block w-full h-auto" />
                  ) : (
                    <>
                      <video
                        src={slide.url}
                        className="block w-full h-auto"
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden="true"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Play className="size-8 text-white fill-white" aria-hidden="true" />
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Rendered inside DialogContent (not as a page-level sibling) so it
            stays part of the dialog's own subtree — Base UI marks everything
            outside the open dialog's portal inert/aria-hidden, which would
            make a sibling lightbox unreachable to a11y tools and, in
            practice, to keyboard/screen-reader users too. */}
        {lightboxIndex !== null && slides[lightboxIndex] && (
          <div
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={`${name} — foto ampliada`}
            onClick={() => setLightboxIndex(null)}
          >
            <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm font-medium text-white/80">
              {lightboxIndex + 1} de {slides.length}
            </p>

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
              {slides[lightboxIndex].type === 'image' ? (
                <Image
                  src={slides[lightboxIndex].url}
                  alt={lightboxIndex === 0 ? name : `${name} — foto ${lightboxIndex + 1}`}
                  fill
                  sizes="100vw"
                  className="object-contain"
                />
              ) : (
                <video
                  src={slides[lightboxIndex].url}
                  className="w-full h-full object-contain"
                  controls
                  autoPlay
                  playsInline
                  aria-label={`${name} — video ${lightboxIndex + 1}`}
                />
              )}
            </div>

            {lightboxIndex > 0 && (
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
            {lightboxIndex < slides.length - 1 && (
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
      </DialogContent>
    </Dialog>
  )
}

function GalleryTile({
  slide,
  index,
  count,
  name,
  overlayCount,
  onOpen,
}: {
  slide: Slide
  index: number
  count: number
  name: string
  overlayCount?: number
  onOpen: () => void
}) {
  const label =
    index === 0 ? name : `${name} — ${slide.type === 'image' ? 'foto' : 'video'} ${index + 1}`

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={overlayCount ? `Ver todas las fotos y videos de ${name}` : `Ver ${label} en tamaño completo`}
      className={cn(
        'relative block w-full h-full p-0 border-0 cursor-pointer overflow-hidden bg-muted',
        getTileClasses(count, index),
      )}
    >
      {slide.type === 'image' ? (
        <Image
          src={slide.url}
          alt={label}
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
          priority={index === 0}
        />
      ) : (
        <>
          <video
            src={slide.url}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          {!overlayCount && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Play className="size-8 text-white fill-white" aria-hidden="true" />
            </span>
          )}
        </>
      )}
      {overlayCount != null && overlayCount > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white text-lg font-semibold">
          +{overlayCount}
        </span>
      )}
    </button>
  )
}
