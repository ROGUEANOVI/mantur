'use client'

import { reopenConsentBanner } from '@/lib/analytics/consent'

// Footer link to change the cookie choice later — consent must be revocable
// as easily as it was given (Ley 1581).
export default function CookiePreferencesButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={reopenConsentBanner} className={className}>
      {label}
    </button>
  )
}
