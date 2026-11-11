import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Stand-in for the real GTM loader: renders a marker so tests can see
// whether GTM would be injected.
vi.mock('@next/third-parties/google', () => ({
  GoogleTagManager: ({ gtmId }: { gtmId: string }) => <div data-testid="gtm">{gtmId}</div>,
}))

import Analytics from './Analytics'
import { reopenConsentBanner } from '@/lib/analytics/consent'

type DL = Window & { dataLayer?: unknown[] }

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  delete (window as DL).dataLayer
})

describe('Analytics — consent gate', () => {
  it('shows the banner on a first visit and does not load GTM before a choice', () => {
    render(<Analytics gtmId="GTM-TEST" />)
    expect(screen.getByRole('dialog', { name: 'Cookies en ManTur' })).toBeInTheDocument()
    expect(screen.queryByTestId('gtm')).not.toBeInTheDocument()
  })

  it('offers reject and accept with equal prominence', () => {
    render(<Analytics gtmId="GTM-TEST" />)
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument()
  })

  it('loads GTM after accepting, with a granted Consent Mode signal first', async () => {
    const user = userEvent.setup()
    render(<Analytics gtmId="GTM-TEST" />)

    await user.click(screen.getByRole('button', { name: 'Aceptar' }))

    expect(screen.getByTestId('gtm')).toHaveTextContent('GTM-TEST')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const consentCall = ((window as DL).dataLayer ?? []).find((entry) => Array.from(entry as ArrayLike<unknown>)[0] === 'consent')
    expect(Array.from(consentCall as ArrayLike<unknown>)).toEqual([
      'consent',
      'default',
      { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' },
    ])
    expect(window.localStorage.getItem('mantur-consent-v1')).toBe('granted')
  })

  it('never loads GTM after rejecting, and remembers the choice', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Analytics gtmId="GTM-TEST" />)
    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    expect(screen.queryByTestId('gtm')).not.toBeInTheDocument()
    unmount()

    render(<Analytics gtmId="GTM-TEST" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('gtm')).not.toBeInTheDocument()
  })

  it('loads GTM straight away for a returning visitor who accepted', () => {
    window.localStorage.setItem('mantur-consent-v1', 'granted')
    render(<Analytics gtmId="GTM-TEST" />)
    expect(screen.getByTestId('gtm')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('can be reopened from "Preferencias de cookies" to change the choice', () => {
    window.localStorage.setItem('mantur-consent-v1', 'granted')
    render(<Analytics gtmId="GTM-TEST" />)
    act(() => reopenConsentBanner())
    expect(screen.getByText('Ahora mismo tienes las cookies aceptadas.')).toBeInTheDocument()
  })

  it('without a GTM id (local/preview) never injects GTM, even after accepting', async () => {
    const user = userEvent.setup()
    render(<Analytics />)
    await user.click(screen.getByRole('button', { name: 'Aceptar' }))
    expect(screen.queryByTestId('gtm')).not.toBeInTheDocument()
  })

  it('captures first-touch campaign params from the landing URL', () => {
    window.history.replaceState(null, '', '/?utm_source=meta&utm_campaign=mt_ventas_fullday_202611')
    render(<Analytics />)
    expect(JSON.parse(window.sessionStorage.getItem('mantur-attribution-v1')!)).toEqual({
      utm_source: 'meta',
      utm_campaign: 'mt_ventas_fullday_202611',
    })
    window.history.replaceState(null, '', '/')
  })
})

describe('Analytics — withdrawing consent', () => {
  it('after accepting, rejecting sends a denied update, clears tracking cookies and reloads', async () => {
    const reload = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } })
    document.cookie = '_ga=GA1.1.123; path=/'
    document.cookie = '_fbp=fb.1.456; path=/'
    document.cookie = 'keep_me=1; path=/'

    window.localStorage.setItem('mantur-consent-v1', 'granted')
    const user = userEvent.setup()
    render(<Analytics gtmId="GTM-TEST" />)
    act(() => reopenConsentBanner())
    await user.click(screen.getByRole('button', { name: 'Rechazar' }))

    const commands = ((window as DL).dataLayer ?? []).map((e) => Array.from(e as ArrayLike<unknown>))
    expect(commands).toContainEqual([
      'consent',
      'update',
      { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' },
    ])
    expect(document.cookie).not.toContain('_ga=')
    expect(document.cookie).not.toContain('_fbp=')
    expect(document.cookie).toContain('keep_me=1')
    expect(window.localStorage.getItem('mantur-consent-v1')).toBe('denied')
    expect(reload).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })
})
