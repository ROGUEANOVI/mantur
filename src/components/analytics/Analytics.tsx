'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { GoogleTagManager } from '@next/third-parties/google'
import { legalCopy } from '@/lib/copy/legal'
import {
  CONSENT_EVENT,
  CONSENT_REOPEN_EVENT,
  pushConsentMode,
  readConsent,
  revokeTracking,
  writeConsent,
  type ConsentChoice,
} from '@/lib/analytics/consent'
import { captureAttribution } from '@/lib/analytics/attribution'

// Mounted once in the root layout. Captures campaign attribution on the
// landing page, shows the consent banner until the visitor decides, and
// loads Google Tag Manager only after consent is granted. With no GTM id
// configured (local dev, previews) it still captures attribution and shows
// nothing else.
export default function Analytics({ gtmId }: { gtmId?: string }) {
  // undefined = not read yet (SSR / first paint) — renders nothing, so the
  // banner never flashes for visitors who already decided.
  const [consent, setConsent] = useState<ConsentChoice | null | undefined>(undefined)
  const [bannerOpen, setBannerOpen] = useState(false)
  // Latest choice, readable from the window event listener below.
  const consentRef = useRef<ConsentChoice | null>(null)

  useEffect(() => {
    captureAttribution(window.location.search)

    const stored = readConsent()
    consentRef.current = stored
    setConsent(stored)
    setBannerOpen(stored === null)

    function onChange(e: Event) {
      const next = (e as CustomEvent<ConsentChoice>).detail
      // Withdrawn after GTM was allowed: stop it now, not on next visit.
      if (consentRef.current === 'granted' && next === 'denied') {
        revokeTracking()
        return
      }
      consentRef.current = next
      setConsent(next)
      setBannerOpen(false)
    }
    function onReopen() {
      setBannerOpen(true)
    }
    window.addEventListener(CONSENT_EVENT, onChange)
    window.addEventListener(CONSENT_REOPEN_EVENT, onReopen)
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChange)
      window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen)
    }
  }, [])

  // Consent Mode signal must reach the dataLayer before GTM boots.
  const [modePushed, setModePushed] = useState(false)
  useEffect(() => {
    if (consent === 'granted' && !modePushed) {
      pushConsentMode('granted')
      setModePushed(true)
    }
  }, [consent, modePushed])

  return (
    <>
      {gtmId && consent === 'granted' && modePushed && <GoogleTagManager gtmId={gtmId} />}
      {bannerOpen && <ConsentBanner current={consent ?? null} />}
    </>
  )
}

function ConsentBanner({ current }: { current: ConsentChoice | null }) {
  const copy = legalCopy.consent

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md sm:px-0 sm:pb-0"
    >
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xl">
        <p id="consent-title" className="text-sm font-semibold text-foreground">
          {copy.title}
        </p>
        <p id="consent-body" className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {copy.body}{' '}
          <Link href="/politica-de-privacidad" className="font-medium text-primary underline underline-offset-2">
            {copy.policyLink}
          </Link>
        </p>
        {current && <p className="mt-2 text-xs text-muted-foreground">{copy.current[current]}</p>}
        {/* Equal weight on purpose: rejecting must be as easy as accepting. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => writeConsent('denied')}
            className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {copy.reject}
          </button>
          <button
            type="button"
            onClick={() => writeConsent('granted')}
            className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {copy.accept}
          </button>
        </div>
      </div>
    </div>
  )
}
