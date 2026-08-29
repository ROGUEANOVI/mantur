import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'

const rpcMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: rpcMock })),
}))

const { POST } = await import('./route')

const SECRET = 'test-events-secret'
const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.WOMPI_EVENTS_SECRET = SECRET
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

function resolvePath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, source)
}

function checksumFor(properties: string[], data: Record<string, unknown>, timestamp: number, secret = SECRET) {
  const concatenated = properties.map((p) => String(resolvePath(data, p) ?? '')).join('') + String(timestamp) + secret
  return createHash('sha256').update(concatenated).digest('hex')
}

const NOW_SECONDS = Math.floor(Date.now() / 1000)

function buildEvent(overrides: {
  status?: string
  bookingId?: string
  wompiTransactionId?: string
  amountInCents?: number
  currency?: string | null
  eventType?: string
  timestamp?: number
  badChecksum?: boolean
} = {}) {
  const timestamp = overrides.timestamp ?? NOW_SECONDS
  const transaction: Record<string, unknown> = {
    id: overrides.wompiTransactionId ?? 'wompi-tx-1',
    status: overrides.status ?? 'APPROVED',
    reference: overrides.bookingId ?? '11111111-1111-1111-1111-111111111111',
    amount_in_cents: overrides.amountInCents ?? 50000,
  }
  if (overrides.currency !== null) transaction.currency = overrides.currency ?? 'COP'

  const data = { transaction }
  // Matches Wompi's own real signature.properties for transaction.updated —
  // notably `reference`/`currency` are NOT in this list (see route.ts's
  // comment on why the RPC independently cross-checks amount/currency).
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']
  const checksum = overrides.badChecksum
    ? 'deadbeef'.repeat(8)
    : checksumFor(properties, data, timestamp)

  return {
    event: overrides.eventType ?? 'transaction.updated',
    data,
    timestamp,
    signature: { properties, checksum },
  }
}

function postRequest(body: unknown) {
  return new Request('https://mantur.co/api/webhooks/wompi', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/webhooks/wompi', () => {
  it('returns 500 and never calls the RPC when WOMPI_EVENTS_SECRET is not configured', async () => {
    delete process.env.WOMPI_EVENTS_SECRET
    const res = await POST(postRequest(buildEvent()))
    expect(res.status).toBe(500)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(new Request('https://mantur.co/api/webhooks/wompi', { method: 'POST', body: '{not json' }))
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 when the checksum does not match, and never calls the RPC', async () => {
    const res = await POST(postRequest(buildEvent({ badChecksum: true })))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a tampered amount even if the attacker recomputes everything else (checksum covers amount_in_cents)', async () => {
    const event = buildEvent()
    // Tamper with the amount after the checksum was computed over the original data.
    event.data.transaction.amount_in_cents = 1
    const res = await POST(postRequest(event))
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an event whose timestamp is far outside the accepted freshness window (bounds how long a captured signed payload stays replayable)', async () => {
    const res = await POST(postRequest(buildEvent({ timestamp: NOW_SECONDS - 60 * 60 * 24 * 30 }))) // 30 days old
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects an event timestamped too far in the future', async () => {
    const res = await POST(postRequest(buildEvent({ timestamp: NOW_SECONDS + 60 * 60 * 24 }))) // 1 day ahead
    expect(res.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('accepts an event within the freshness window, e.g. a legitimate late retry within Wompi\'s documented 24h policy', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    const res = await POST(postRequest(buildEvent({ timestamp: NOW_SECONDS - 60 * 60 * 20 }))) // 20h old
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing for non-transaction.updated events', async () => {
    const event = buildEvent({ eventType: 'nequi_token.updated' })
    const res = await POST(postRequest(event))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing for an unrecognized transaction status', async () => {
    const res = await POST(postRequest(buildEvent({ status: 'SOME_NEW_STATUS' })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing when the reference is not a valid UUID (reference is not checksum-covered, so it must not be trusted blindly)', async () => {
    const res = await POST(postRequest(buildEvent({ bookingId: 'not-a-uuid' })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing when currency is missing from the payload', async () => {
    const res = await POST(postRequest(buildEvent({ currency: null })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('acknowledges (200) but skips processing when amount_in_cents is zero or negative', async () => {
    const res = await POST(postRequest(buildEvent({ amountInCents: 0 })))
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls apply_wompi_webhook_transaction_update with the booking id, wompi transaction id, status, amount, and currency for a valid APPROVED event', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    const res = await POST(
      postRequest(
        buildEvent({
          status: 'APPROVED',
          bookingId: '22222222-2222-2222-2222-222222222222',
          wompiTransactionId: 'wompi-tx-99',
          amountInCents: 135000,
          currency: 'COP',
        }),
      ),
    )

    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('apply_wompi_webhook_transaction_update', {
      p_booking_id: '22222222-2222-2222-2222-222222222222',
      p_wompi_transaction_id: 'wompi-tx-99',
      p_wompi_status: 'APPROVED',
      p_wompi_amount_in_cents: 135000,
      p_wompi_currency: 'COP',
    })
  })

  it('still returns 200 when the RPC reports the update was already applied (idempotent no-op, not an error)', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null })
    const res = await POST(postRequest(buildEvent()))
    expect(res.status).toBe(200)
  })

  it('returns 500 (so Wompi retries) when the RPC itself errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const res = await POST(postRequest(buildEvent()))
    expect(res.status).toBe(500)
  })

  it.each(['DECLINED', 'ERROR', 'VOIDED', 'PENDING'])('accepts a valid %s status event', async (status) => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    const res = await POST(postRequest(buildEvent({ status })))
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('apply_wompi_webhook_transaction_update', expect.objectContaining({ p_wompi_status: status }))
  })
})
