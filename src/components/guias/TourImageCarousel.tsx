'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { guidesCopy } from '@/lib/copy/guides'

// Cycles one image at a time inside a fixed-size box — the compact tour
// cards on /guias/[slug] have no room for a mosaic (MediaGallery) or a
// horizontal multi-item scroller (FeaturedCarousel), both built for a full
// detail-page hero instead of one small card. A single image plus
// prev/next + dots is the right amount of UI for this footprint.
export default function TourImageCarousel({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0)
  const copy = guidesCopy.profilePage

  if (images.length === 0) return null

  function go(direction: 1 | -1) {
    setIndex((current) => (current + direction + images.length) % images.length)
  }

  return (
    <div className="relative w-full h-36 group">
      <Image
        src={images[index]}
        alt={index === 0 ? name : `${name} — foto ${index + 1}`}
        fill
        sizes="(min-width: 640px) 512px, 100vw"
        className="object-cover"
        priority={index === 0}
      />

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              go(-1)
            }}
            aria-label={copy.previousImage}
            className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center justify-center size-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              go(1)
            }}
            aria-label={copy.nextImage}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center size-7 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
