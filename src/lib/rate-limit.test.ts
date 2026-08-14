import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Ratelimit } from '@upstash/ratelimit'

// Redis.fromEnv() / Ratelimit construction don't make network calls, but they
// do read these env vars at import time — set dummy values so the module can
// load in tests without needing a real Upstash database.
process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

const headersGet = vi.fn()
const ipAddressMock = vi.fn()

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: headersGet })),
}))

vi.mock('@vercel/functions', () => ({
  ipAddress: (...args: unknown[]) => ipAddressMock(...args),
}))

const { getClientIp, checkRateLimit } = await import('./rate-limit')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getClientIp', () => {
  it("returns Vercel's resolved IP when available", async () => {
    ipAddressMock.mockReturnValue('203.0.113.1')
    expect(await getClientIp()).toBe('203.0.113.1')
  })

  it('returns null (not a shared placeholder string) when the IP cannot be resolved', async () => {
    ipAddressMock.mockReturnValue(undefined)
    expect(await getClientIp()).toBeNull()
  })

  it('never reads x-forwarded-for directly — the client-supplied header value is not trusted', async () => {
    ipAddressMock.mockReturnValue('203.0.113.1')
    await getClientIp()
    expect(headersGet).not.toHaveBeenCalled()
  })
})

describe('checkRateLimit', () => {
  it('fails open (returns true) when the identifier is null', async () => {
    const limitFn = vi.fn()
    const result = await checkRateLimit({ limit: limitFn } as unknown as Ratelimit, null)
    expect(result).toBe(true)
    expect(limitFn).not.toHaveBeenCalled()
  })

  it('returns the limiter\'s success value when it resolves normally', async () => {
    const limitFn = vi.fn().mockResolvedValue({ success: false })
    const result = await checkRateLimit({ limit: limitFn } as unknown as Ratelimit, 'user-1')
    expect(result).toBe(false)
    expect(limitFn).toHaveBeenCalledWith('user-1')
  })

  it('fails open (returns true) when the limiter throws, e.g. a Redis outage', async () => {
    const limitFn = vi.fn().mockRejectedValue(new Error('upstash unreachable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkRateLimit({ limit: limitFn } as unknown as Ratelimit, 'user-1')

    expect(result).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
