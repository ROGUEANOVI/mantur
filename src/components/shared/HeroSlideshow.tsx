'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

const INTERVAL_MS = 7000

// Ambient background rotator — decorative, so it has no manual controls
// (arrows/dots). Only the first image preloads with `priority`; the rest
// load lazily since they're not needed until their turn comes up.
export default function HeroSlideshow({ images }: { images: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (images.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % images.length)
    }, INTERVAL_MS)
    return () => clearInterval(timer)
  }, [images.length])

  return (
    <>
      {images.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          priority={i === 0}
          sizes="100vw"
          className="object-cover transition-opacity duration-1000 ease-in-out"
          style={{ opacity: i === activeIndex ? 1 : 0 }}
        />
      ))}
    </>
  )
}
