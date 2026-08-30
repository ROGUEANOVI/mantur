import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { alegraRequest } from './client'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.ALEGRA_USER = 'mantur@example.com'
  process.env.ALEGRA_TOKEN = 'test-token'
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.unstubAllGlobals()
})

describe('alegraRequest', () => {
  it('returns a clear failure (never throws) when ALEGRA_USER is not configured', async () => {
    delete process.env.ALEGRA_USER
    const result = await alegraRequest('/contacts')
    expect(result).toEqual({ ok: false, error: 'ALEGRA_USER is not configured' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns a clear failure when ALEGRA_TOKEN is not configured', async () => {
    delete process.env.ALEGRA_TOKEN
    const result = await alegraRequest('/contacts')
    expect(result).toEqual({ ok: false, error: 'ALEGRA_TOKEN is not configured' })
  })

  it('sends a Basic Auth header built from base64(email:token) and defaults to GET', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    await alegraRequest('/contacts')

    const expectedAuth = `Basic ${Buffer.from('mantur@example.com:test-token').toString('base64')}`
    expect(fetch).toHaveBeenCalledWith(
      'https://api.alegra.com/api/v1/contacts',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: expectedAuth, 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('sends the given method and JSON-serialized body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }))

    await alegraRequest('/invoices', { method: 'POST', body: { date: '2026-08-30' } })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.alegra.com/api/v1/invoices',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ date: '2026-08-30' }) }),
    )
  })

  it('returns ok:true with the parsed response body on success', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 'abc' }), { status: 200 }))
    const result = await alegraRequest<{ id: string }>('/contacts')
    expect(result).toEqual({ ok: true, data: { id: 'abc' } })
  })

  it('returns ok:false (never throws) on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'invalid' }), { status: 422 }))
    const result = await alegraRequest('/contacts')
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('422')
  })

  it('returns ok:false (never throws) when fetch itself rejects, e.g. a network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unreachable'))
    const result = await alegraRequest('/contacts')
    expect(result).toEqual({ ok: false, error: 'network unreachable' })
  })
})
