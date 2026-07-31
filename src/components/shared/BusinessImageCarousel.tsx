'use client'

import { useRef, useState } from 'react'
import { Store } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function BusinessImageCarousel({
  images,
  name,
}: {
  images: string[]
  name: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)

  if (images.length === 0) {
    return (
      <div className="relative mx-4 mt-2 rounded-2xl h-56 md:h-72 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
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
        {images.map((url, i) => (
          <div
            key={url}
            className="w-full h-full shrink-0 snap-start bg-cover bg-center"
            style={{ backgroundImage: `url(${url})` }}
            role="img"
            aria-label={i === 0 ? name : `${name} — foto ${i + 1}`}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
          {images.map((_, i) => (
            <span
              key={i}
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
