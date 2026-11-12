'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus } from 'lucide-react'
import { packagesCopy } from '@/lib/copy/packages'
import WhatsappButton from '@/components/shared/WhatsappButton'
import { quotePackage } from '@/lib/packages/quote'
import type { PriceHeadline } from '@/lib/packages/price'
import PackagePrice from '@/components/paquetes/PackagePrice'
import type { PriceTier } from '@/lib/packages/content'

type Props = {
  packageName: string
  slug: string
  // Price headline (src/lib/packages/price.ts) shown in the sticky bar.
  price: PriceHeadline
  capacity: number | null
  // For the whatsapp_click lead value (estimate: catalog floor × group).
  basePrice: number
  pricingUnit: string
  // Group fares, so the lead value matches what that group would pay.
  tiers?: PriceTier[]
  // The stepper never goes below the package's minimum group.
  minPeople?: number | null
}

const DEFAULT_PEOPLE = 2
// Upper bound for packages without a capacity — a sanity limit for the
// stepper, not a business rule (bigger groups just ask in the chat).
const FALLBACK_MAX_PEOPLE = 30

// Primary package CTA (manual-sales mode): opens ManTur's WhatsApp with the
// package, group size and a "(ref: slug)" tag prefilled — no account
// needed. Below `lg`, the inline block sits after the gallery and the
// description, so a sticky bottom bar carries the same CTA whenever the
// inline one is out of view.
export default function PackageWhatsappCta({
  packageName,
  slug,
  price,
  capacity,
  basePrice,
  pricingUnit,
  tiers = [],
  minPeople = null,
}: Props) {
  const copy = packagesCopy.detail
  const max = capacity ?? FALLBACK_MAX_PEOPLE
  const min = Math.min(Math.max(1, minPeople ?? 1), max)
  const [people, setPeople] = useState(Math.min(Math.max(DEFAULT_PEOPLE, min), max))
  const inlineRef = useRef<HTMLDivElement>(null)
  // Starts hidden so server HTML and first paint never flash the bar.
  const [inlineVisible, setInlineVisible] = useState(true)
  // The bar is portaled to <body>: this component renders inside <Reveal>,
  // whose transform would otherwise turn `position: fixed` into
  // "fixed to the Reveal box" instead of to the viewport.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setPortalTarget(document.body)
  }, [])

  useEffect(() => {
    const el = inlineRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setInlineVisible(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const message = packagesCopy.whatsapp.reserveMessage(packageName, slug, people)
  const trackingBase = {
    paquete_id: slug,
    paquete_nombre: packageName,
    // Estimate for analytics only; groups without a published fare report 0.
    value: (() => {
      const quote = quotePackage({ base_price: basePrice, pricing_unit: pricingUnit }, tiers, people)
      return quote.ok ? quote.total : 0
    })(),
    currency: 'COP' as const,
  }

  return (
    <>
      <div ref={inlineRef} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span id="package-people-label" className="text-sm font-medium text-foreground">
            {copy.peopleLabel}
          </span>
          <div role="group" aria-labelledby="package-people-label" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPeople((n) => Math.max(min, n - 1))}
              disabled={people <= min}
              aria-label={copy.peopleDecrease}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-input text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <output
              aria-live="polite"
              className="w-10 text-center text-base font-semibold tabular-nums text-foreground"
            >
              {people}
            </output>
            <button
              type="button"
              onClick={() => setPeople((n) => Math.min(max, n + 1))}
              disabled={people >= max}
              aria-label={copy.peopleIncrease}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-input text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <WhatsappButton
          message={message}
          label={packagesCopy.whatsapp.ctaReserve}
          tracking={{ ...trackingBase, ubicacion: 'package_detail' }}
        />

        <p className="text-xs text-muted-foreground">
          {copy.groupPricingHint} {copy.whatsappHint}
        </p>
      </div>

      {/* Mobile sticky bar — same CTA, shown only while the inline block is
          off-screen. pb uses the safe-area inset for phones with a home bar. */}
      {portalTarget &&
        createPortal(
          <div
            inert={inlineVisible}
            aria-hidden={inlineVisible}
            className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur transition-transform duration-300 ease-out lg:hidden ${
              inlineVisible ? 'pointer-events-none translate-y-full' : 'translate-y-0'
            }`}
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <PackagePrice headline={price} variant="compact" />
              </div>
              <WhatsappButton
                message={message}
                label={packagesCopy.whatsapp.ctaReserve}
                tracking={{ ...trackingBase, ubicacion: 'package_detail_sticky' }}
                className="w-auto shrink-0 whitespace-nowrap px-4 shadow-md"
              />
            </div>
          </div>,
          portalTarget,
        )}
    </>
  )
}
