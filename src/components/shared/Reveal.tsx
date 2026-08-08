'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Fades + slides children in the first time they scroll into view.
 * Reveals once (observer disconnects after triggering) — re-triggering on
 * every scroll up/down reads as flickery, not polished.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={cn(
        // h-full is a no-op unless the parent has a definite height (e.g. a
        // CSS Grid row stretched to its tallest cell) — harmless everywhere
        // else, but it's what lets a grid of cards with optional fields
        // (description, address...) still render as equal-height cards
        // instead of the box itself shrinking to whatever content is there.
        'h-full transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className
      )}
    >
      {children}
    </div>
  )
}
