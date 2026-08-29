import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { voidWompiTransaction } from './refunds'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.WOMPI_API_BASE_URL = 'https://sandbox.wompi.co/v1'
  process.env.WOMPI_PRIVATE_KEY = 'priv_sandbox_test123'
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe('voidWompiTransaction', () => {
  it('returns a clear failure (never throws) when WOMPI_API_BASE_URL is not configured', async () => {
    delete process.env.WOMPI_API_BASE_URL
    const result = await voidWompiTransaction('wompi-tx-1')
    expect(result).toEqual({ ok: false, error: 'WOMPI_API_BASE_URL is not configured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a clear failure when WOMPI_PRIVATE_KEY is not configured', async () => {
    delete process.env.WOMPI_PRIVATE_KEY
    const result = await voidWompiTransaction('wompi-tx-1')
    expect(result).toEqual({ ok: false, error: 'WOMPI_PRIVATE_KEY is not configured' })
  })

  it('calls POST {baseUrl}/transactions/{id}/void with the private key as a Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { status: 'VOIDED' } }), { status: 200 }))

    await voidWompiTransaction('wompi-tx-42')

    expect(fetch).toHaveBeenCalledWith('https://sandbox.wompi.co/v1/transactions/wompi-tx-42/void', {
      method: 'POST',
      headers: { Authorization: 'Bearer priv_sandbox_test123' },
    })
  })

  it('returns ok:true when the response reports status VOIDED', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { status: 'VOIDED' } }), { status: 200 }))
    const result = await voidWompiTransaction('wompi-tx-1')
    expect(result).toEqual({ ok: true })
  })

  it('returns ok:false (never throws) on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { messages: ['too late to void'] } }), { status: 422 }))
    const result = await voidWompiTransaction('wompi-tx-1')
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('422')
  })

  it('returns ok:false when the response is 200 but the status is not VOIDED', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: { status: 'APPROVED' } }), { status: 200 }))
    const result = await voidWompiTransaction('wompi-tx-1')
    expect(result.ok).toBe(false)
  })

  it('returns ok:false (never throws) when fetch itself rejects, e.g. a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unreachable'))
    const result = await voidWompiTransaction('wompi-tx-1')
    expect(result).toEqual({ ok: false, error: 'network unreachable' })
  })
})
