import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'

const confirmPayoutMock = vi.fn()

function makeRpcResult(result: { data: unknown; error: unknown }) {
  return Promise.resolve(result)
}

const rpcMock = vi.fn((fn: string, args: Record<string, unknown>) => {
  if (fn === 'confirm_provider_payout_from_webhook') return makeRpcResult(confirmPayoutMock(args))
  throw new Error(`unexpected rpc: ${fn}`)
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ rpc: rpcMock })),
}))

const { POST } = await import('./route')

const SECRET = 'test-payouts-events-secret'
const ORIGINAL_ENV = { ...process.env }
const NOW_SECONDS = Math.floor(Date.now() / 1000)

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

function buildEvent(overrides: {
  payoutId?: string
  status?: string
  reason?: string
  timestamp?: number
  badChecksum?: boolean
  nested?: boolean
  omitPayoutFields?: boolean
  extraFields?: Record<string, unknown>
} = {}) {
  const timestamp = overrides.timestamp ?? NOW_SECONDS
  const payoutFields = overrides.omitPayoutFields
    ? { ...(overrides.extraFields ?? {}) }
    : {
        id: overrides.payoutId ?? 'wompi-payout-1',
        status: overrides.status ?? 'APPROVED',
        ...(overrides.reason ? { reason: overrides.reason } : {}),
        ...(overrides.extraFields ?? {}),
      }

  const data = overrides.nested === false ? payoutFields : { payout: payoutFields }
  const properties = ['payout.id', 'payout.status']
  const checksum = overrides.badChecksum ? 'deadbeef'.repeat(8) : checksumFor(properties, data, timestamp)

  return {
    event: 'payout.updated',
    data,
    timestamp,
    signature: { properties, checksum },
  }
}

function postRequest(body: unknown) {
  return new Request('https://mantur.co/api/webhooks/wompi-payouts', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.WOMPI_PAYOUTS_EVENTS_SECRET = SECRET
  confirmPayoutMock.mockReturnValue({ data: [{ id: 'payout-row-1' }], error: null })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('POST /api/webhooks/wompi-payouts', () => {
  it('returns 500 and never calls the RPC when WOMPI_PAYOUTS_EVENTS_SECRET is not configured', async () => {
    delete process.env.WOMPI_PAYOUTS_EVENTS_SECRET
    const response = await POST(postRequest(buildEvent()))
    expect(response.status).toBe(500)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns 400 on invalid JSON', async () => {
    const request = new Request('https://mantur.co/api/webhooks/wompi-payouts', { method: 'POST', body: '{not json' })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects with 401 when the checksum does not match, and never calls the RPC', async () => {
    const response = await POST(postRequest(buildEvent({ badChecksum: true })))
    expect(response.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 when the event timestamp is stale', async () => {
    const response = await POST(postRequest(buildEvent({ timestamp: NOW_SECONDS - 49 * 60 * 60 })))
    expect(response.status).toBe(401)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it.each(['APPROVED', 'TOTAL_PAYMENT', 'approved'])(
    'confirms a %s status as paid, with no error message',
    async (status) => {
      const response = await POST(postRequest(buildEvent({ status })))
      expect(response.status).toBe(200)
      expect(confirmPayoutMock).toHaveBeenCalledWith({
        p_wompi_payout_id: 'wompi-payout-1',
        p_status: 'paid',
        p_error_message: null,
      })
    },
  )

  it.each(['FAILED', 'REJECTED', 'NOT_APPROVED'])('confirms a %s status as failed', async (status) => {
    const response = await POST(postRequest(buildEvent({ status })))
    expect(response.status).toBe(200)
    expect(confirmPayoutMock).toHaveBeenCalledWith({
      p_wompi_payout_id: 'wompi-payout-1',
      p_status: 'failed',
      p_error_message: null,
    })
  })

  it('passes through the reason field as p_error_message on a failed status', async () => {
    const response = await POST(postRequest(buildEvent({ status: 'REJECTED', reason: 'insufficient funds' })))
    expect(response.status).toBe(200)
    expect(confirmPayoutMock).toHaveBeenCalledWith({
      p_wompi_payout_id: 'wompi-payout-1',
      p_status: 'failed',
      p_error_message: 'insufficient funds',
    })
  })

  it('never forwards a reason field as p_error_message on a paid status', async () => {
    await POST(postRequest(buildEvent({ status: 'APPROVED', reason: 'should be ignored' })))
    expect(confirmPayoutMock).toHaveBeenCalledWith({
      p_wompi_payout_id: 'wompi-payout-1',
      p_status: 'paid',
      p_error_message: null,
    })
  })

  it.each(['PROCESSING', 'PENDING', 'PARTIAL_PAYMENT', 'PENDING_APPROVAL'])(
    'does not call the RPC for the still-in-flight status %s, but still acks 200',
    async (status) => {
      const response = await POST(postRequest(buildEvent({ status })))
      expect(response.status).toBe(200)
      expect(rpcMock).not.toHaveBeenCalled()
    },
  )

  it('reads a flat (non-nested) payload shape too', async () => {
    await POST(postRequest(buildEvent({ nested: false, status: 'APPROVED' })))
    expect(confirmPayoutMock).toHaveBeenCalledWith({
      p_wompi_payout_id: 'wompi-payout-1',
      p_status: 'paid',
      p_error_message: null,
    })
  })

  it('acks 200 without calling the RPC when the payload is missing id/status in the expected shape', async () => {
    const response = await POST(postRequest(buildEvent({ omitPayoutFields: true })))
    expect(response.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('is a no-op (200, no throw) when the RPC finds no matching sent row — unknown id or already-resolved', async () => {
    confirmPayoutMock.mockReturnValue({ data: [], error: null })
    const response = await POST(postRequest(buildEvent({ status: 'APPROVED' })))
    expect(response.status).toBe(200)
  })

  it('returns 500 when the RPC itself errors, so Wompi retries', async () => {
    confirmPayoutMock.mockReturnValue({ data: null, error: { message: 'db error' } })
    const response = await POST(postRequest(buildEvent({ status: 'APPROVED' })))
    expect(response.status).toBe(500)
  })

  // Regression: this route used to log the raw event payload verbatim for
  // debugging the unconfirmed shape assumption — but a real payout event can
  // carry PII/financial data (legal id, name, email, bank account number).
  // Whatever gets logged must never contain the actual values, only field
  // names/types, on both the success path and the "unrecognized shape" path.
  it('never logs raw PII/financial field values from the payload, only their shape', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sensitive = {
      legalId: '1002003000',
      accountNumber: '00011122233',
      name: 'Finca El Paraíso',
      email: 'finca@example.com',
    }

    await POST(
      postRequest(buildEvent({ status: 'APPROVED', extraFields: sensitive })),
    )

    const loggedCalls = [...infoSpy.mock.calls, ...errorSpy.mock.calls]
    const loggedText = JSON.stringify(loggedCalls)
    for (const value of Object.values(sensitive)) {
      expect(loggedText).not.toContain(value)
    }
    expect(loggedText).toContain('"legalId":"string"')

    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('never logs raw PII/financial field values on the unrecognized-shape path either', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sensitive = { legalId: '1002003000', accountNumber: '00011122233' }

    // omitPayoutFields drops id/status so parsePayoutEvent() returns null,
    // exercising the "missing an id/status in the expected shape" log path —
    // extraFields still rides along in the payload to prove even that
    // failure branch never echoes real values.
    await POST(
      postRequest(buildEvent({ omitPayoutFields: true, extraFields: sensitive })),
    )

    const loggedText = JSON.stringify(errorSpy.mock.calls)
    for (const value of Object.values(sensitive)) {
      expect(loggedText).not.toContain(value)
    }

    errorSpy.mockRestore()
  })
})
