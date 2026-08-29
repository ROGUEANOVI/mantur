'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const POLL_INTERVAL_MS = 4000
// ~1 minute of polling — the Wompi webhook normally resolves within a few
// seconds of the browser landing back on this page. If it hasn't resolved
// by then, the static "Tu pago está siendo procesado" copy already covers
// it; the tourist can revisit /mis-reservas later instead of polling forever.
const MAX_POLLS = 15

// Bridges the gap between the browser landing on this page (Wompi's
// redirect-url) and the Wompi webhook actually confirming payment — the
// webhook, not this redirect, is the source of truth and can arrive a few
// seconds later. Polling router.refresh() re-runs this Server Component
// page against the DB until the booking leaves pending_payment, at which
// point the parent stops rendering this component.
export function PendingPaymentPoller() {
  const router = useRouter()
  const attempts = useRef(0)

  useEffect(() => {
    const interval = setInterval(() => {
      attempts.current += 1
      if (attempts.current > MAX_POLLS) {
        clearInterval(interval)
        return
      }
      router.refresh()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [router])

  return null
}
