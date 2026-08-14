import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const verifyOtp = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { verifyOtp },
  })),
}))

const { GET } = await import('./route')

beforeEach(() => {
  vi.clearAllMocks()
})

function makeRequest(search: string) {
  return new NextRequest(`https://mantur.co/auth/confirm${search}`)
}

describe('GET /auth/confirm', () => {
  it('redirects to the confirm-error page when token_hash is missing', async () => {
    const res = await GET(makeRequest('?type=email'))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=confirm')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('redirects to the confirm-error page when type is missing', async () => {
    const res = await GET(makeRequest('?token_hash=abc123'))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=confirm')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('rejects a type outside signup/email (e.g. "recovery"), without calling verifyOtp', async () => {
    const res = await GET(makeRequest('?token_hash=abc123&type=recovery'))

    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=confirm')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('redirects to the confirm-error page when verifyOtp fails', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'invalid token' } })

    const res = await GET(makeRequest('?token_hash=abc123&type=email'))

    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc123' })
    expect(res.headers.get('location')).toBe('https://mantur.co/login?error=confirm')
  })

  it('redirects to / by default after a successful confirmation', async () => {
    verifyOtp.mockResolvedValue({ error: null })

    const res = await GET(makeRequest('?token_hash=abc123&type=email'))

    expect(res.headers.get('location')).toBe('https://mantur.co/')
  })

  it('redirects to a same-origin "next" path when provided', async () => {
    verifyOtp.mockResolvedValue({ error: null })

    const res = await GET(makeRequest('?token_hash=abc123&type=email&next=/mi-perfil'))

    expect(res.headers.get('location')).toBe('https://mantur.co/mi-perfil')
  })

  it('ignores a protocol-relative "next" value to avoid an open redirect', async () => {
    verifyOtp.mockResolvedValue({ error: null })

    const res = await GET(makeRequest('?token_hash=abc123&type=email&next=%2F%2Fevil.com'))

    expect(res.headers.get('location')).toBe('https://mantur.co/')
  })

  it('ignores an absolute "next" value to avoid an open redirect', async () => {
    verifyOtp.mockResolvedValue({ error: null })

    const res = await GET(
      makeRequest('?token_hash=abc123&type=email&next=https%3A%2F%2Fevil.com'),
    )

    expect(res.headers.get('location')).toBe('https://mantur.co/')
  })
})
