// Cookie / analytics consent (Ley 1581 de 2012). Google Tag Manager — and
// with it GA4 and the Meta Pixel, configured inside the container — only
// loads after the visitor accepts. Rejecting is as easy as accepting and is
// remembered the same way.
//
// Stored per browser in localStorage: it's a per-viewer preference, not
// account data, and must survive across visits without a login.

export type ConsentChoice = 'granted' | 'denied'

const STORAGE_KEY = 'mantur-consent-v1'
// Fired on window whenever the choice changes (or the banner is reopened),
// so the banner and the GTM loader stay in sync without a context provider.
export const CONSENT_EVENT = 'mantur:consent-change'
export const CONSENT_REOPEN_EVENT = 'mantur:consent-reopen'

export function readConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    // Private mode / blocked storage: behave as "not decided yet".
    return null
  }
}

export function writeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Storage unavailable — the choice still applies for this page view.
  }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_EVENT, { detail: choice }))
}

export function reopenConsentBanner(): void {
  window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT))
}

type DataLayerWindow = Window & { dataLayer?: unknown[] }

// Google Consent Mode v2 signal. gtag() must push the `arguments` object
// itself (not an array) for GTM to read it as a consent command.
export function pushConsentMode(choice: ConsentChoice): void {
  const w = window as DataLayerWindow
  w.dataLayer = w.dataLayer || []
  const state = choice === 'granted' ? 'granted' : 'denied'
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments)
  }
  gtag('consent', 'default', {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  })
}
