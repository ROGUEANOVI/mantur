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
// itself (not an array) for GTM to read it as a consent command. 'default'
// before GTM boots; 'update' when the visitor changes their mind later.
export function pushConsentMode(choice: ConsentChoice, command: 'default' | 'update' = 'default'): void {
  const w = window as DataLayerWindow
  w.dataLayer = w.dataLayer || []
  const state = choice === 'granted' ? 'granted' : 'denied'
  function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments)
  }
  gtag('consent', command, {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  })
}

// Cookies set by GA4 (_ga, _ga_<id>, _gid), Google Ads (_gcl_*) and the
// Meta Pixel (_fbp, _fbc). Cleared when consent is withdrawn.
const TRACKING_COOKIE_RE = /^(_ga|_gid|_gcl_|_fbp|_fbc)/

export function clearTrackingCookies(): void {
  const names = document.cookie
    .split(';')
    .map((c) => c.split('=')[0].trim())
    .filter((name) => TRACKING_COOKIE_RE.test(name))
  // Analytics cookies are usually set on the registrable domain
  // (".mantur.co"), so expire them on every parent domain of the host too.
  const parts = window.location.hostname.split('.')
  const domains = [''].concat(parts.map((_, i) => parts.slice(i).join('.')).filter((d) => d.includes('.')))
  for (const name of names) {
    for (const domain of domains) {
      const domainAttr = domain ? `; domain=.${domain}` : ''
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainAttr}`
    }
  }
}

// Withdrawing consent after GTM already ran in this page: tell GTM, drop
// its cookies, and reload so no tag keeps running. Next load won't inject
// GTM at all because the stored choice is now 'denied'.
export function revokeTracking(): void {
  pushConsentMode('denied', 'update')
  clearTrackingCookies()
  window.location.reload()
}
