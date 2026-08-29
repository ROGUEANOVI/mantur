import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'
import { buildWompiCheckoutUrl } from './checkout'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.WOMPI_PUBLIC_KEY = 'pub_sandbox_test123'
  process.env.WOMPI_INTEGRITY_SECRET = 'test-integrity-secret'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('buildWompiCheckoutUrl', () => {
  it('builds a checkout.wompi.co URL with the required query params', () => {
    const url = new URL(
      buildWompiCheckoutUrl({ bookingId: 'booking-1', amountInCents: 50000, currency: 'COP' }),
    )

    expect(url.origin + url.pathname).toBe('https://checkout.wompi.co/p/')
    expect(url.searchParams.get('public-key')).toBe('pub_sandbox_test123')
    expect(url.searchParams.get('currency')).toBe('COP')
    expect(url.searchParams.get('amount-in-cents')).toBe('50000')
    expect(url.searchParams.get('reference')).toBe('booking-1')
    expect(url.searchParams.get('redirect-url')).toBe('https://mantur.co/reservas/booking-1/confirmacion')
  })

  it('computes the integrity signature as SHA256(reference + amountInCents + currency + secret)', () => {
    const url = new URL(
      buildWompiCheckoutUrl({ bookingId: 'booking-1', amountInCents: 50000, currency: 'COP' }),
    )

    const expected = createHash('sha256').update('booking-1' + '50000' + 'COP' + 'test-integrity-secret').digest('hex')
    expect(url.searchParams.get('signature:integrity')).toBe(expected)
  })

  it('produces a different signature when the amount changes, so a tampered amount fails verification', () => {
    const original = new URL(
      buildWompiCheckoutUrl({ bookingId: 'booking-1', amountInCents: 50000, currency: 'COP' }),
    ).searchParams.get('signature:integrity')
    const tampered = new URL(
      buildWompiCheckoutUrl({ bookingId: 'booking-1', amountInCents: 999999, currency: 'COP' }),
    ).searchParams.get('signature:integrity')

    expect(original).not.toBe(tampered)
  })

  it('throws when WOMPI_PUBLIC_KEY is not configured', () => {
    delete process.env.WOMPI_PUBLIC_KEY
    expect(() => buildWompiCheckoutUrl({ bookingId: 'booking-1', amountInCents: 50000, currency: 'COP' })).toThrow(
      'WOMPI_PUBLIC_KEY is not configured',
    )
  })

  it('throws when WOMPI_INTEGRITY_SECRET is not configured', () => {
    delete process.env.WOMPI_INTEGRITY_SECRET
    expect(() => buildWompiCheckoutUrl({ bookingId: 'booking-1', amountInCents: 50000, currency: 'COP' })).toThrow(
      'WOMPI_INTEGRITY_SECRET is not configured',
    )
  })
})
