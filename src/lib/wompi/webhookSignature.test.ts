import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { isValidChecksum, isFreshTimestamp, resolvePath, type WompiWebhookEvent } from './webhookSignature'

const SECRET = 'test-secret'

function eventWithChecksum(overrides: Partial<WompiWebhookEvent> = {}): WompiWebhookEvent {
  const timestamp = Math.floor(Date.now() / 1000)
  const data = { transaction: { id: 'wompi-tx-1', status: 'APPROVED' } }
  const properties = ['transaction.id', 'transaction.status']
  const concatenated = properties.map((p) => String(resolvePath(data, p))).join('') + String(timestamp) + SECRET
  const checksum = createHash('sha256').update(concatenated).digest('hex')

  return {
    event: 'transaction.updated',
    data,
    timestamp,
    signature: { properties, checksum },
    ...overrides,
  }
}

describe('resolvePath', () => {
  it('resolves a dotted path into nested data', () => {
    expect(resolvePath({ transaction: { id: 'tx-1' } }, 'transaction.id')).toBe('tx-1')
  })

  it('returns undefined for a path that does not exist', () => {
    expect(resolvePath({ transaction: { id: 'tx-1' } }, 'transaction.missing')).toBeUndefined()
    expect(resolvePath({ transaction: { id: 'tx-1' } }, 'payout.id')).toBeUndefined()
  })

  it('returns undefined rather than throwing when a path segment is not an object', () => {
    expect(resolvePath({ transaction: 'not-an-object' }, 'transaction.id')).toBeUndefined()
    expect(resolvePath(null, 'transaction.id')).toBeUndefined()
  })
})

describe('isValidChecksum', () => {
  it('accepts a correctly computed checksum', () => {
    expect(isValidChecksum(eventWithChecksum(), SECRET)).toBe(true)
  })

  it('rejects when the secret is wrong', () => {
    expect(isValidChecksum(eventWithChecksum(), 'wrong-secret')).toBe(false)
  })

  it('rejects a tampered checksum of the same length', () => {
    const event = eventWithChecksum()
    const tampered = event.signature!.checksum.slice(0, -1) + (event.signature!.checksum.at(-1) === '0' ? '1' : '0')
    expect(isValidChecksum({ ...event, signature: { ...event.signature!, checksum: tampered } }, SECRET)).toBe(false)
  })

  it('rejects a checksum of the wrong length instead of throwing', () => {
    const event = eventWithChecksum()
    expect(isValidChecksum({ ...event, signature: { ...event.signature!, checksum: 'short' } }, SECRET)).toBe(false)
  })

  it('rejects when signature is missing entirely', () => {
    const event = eventWithChecksum({ signature: undefined })
    expect(isValidChecksum(event, SECRET)).toBe(false)
  })

  it('rejects when properties is empty', () => {
    const event = eventWithChecksum()
    expect(isValidChecksum({ ...event, signature: { ...event.signature!, properties: [] } }, SECRET)).toBe(false)
  })

  it('rejects when timestamp is 0/falsy', () => {
    const event = eventWithChecksum({ timestamp: 0 })
    expect(isValidChecksum(event, SECRET)).toBe(false)
  })

  it('treats a missing resolved property value as an empty string, not a crash', () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const data = { transaction: { id: 'tx-1' } }
    const properties = ['transaction.id', 'transaction.does_not_exist']
    const concatenated = properties.map((p) => String(resolvePath(data, p) ?? '')).join('') + String(timestamp) + SECRET
    const checksum = createHash('sha256').update(concatenated).digest('hex')

    expect(
      isValidChecksum({ event: 'transaction.updated', data, timestamp, signature: { properties, checksum } }, SECRET),
    ).toBe(true)
  })
})

describe('isFreshTimestamp', () => {
  const nowSeconds = () => Math.floor(Date.now() / 1000)

  it('accepts a timestamp from right now', () => {
    expect(isFreshTimestamp(nowSeconds())).toBe(true)
  })

  it('accepts a timestamp within the allowed clock-skew window in the future', () => {
    expect(isFreshTimestamp(nowSeconds() + 60)).toBe(true)
  })

  it('rejects a timestamp too far in the future', () => {
    expect(isFreshTimestamp(nowSeconds() + 10 * 60)).toBe(false)
  })

  it('accepts a timestamp within the max event age', () => {
    expect(isFreshTimestamp(nowSeconds() - 24 * 60 * 60)).toBe(true)
  })

  it('rejects a stale timestamp older than the max event age', () => {
    expect(isFreshTimestamp(nowSeconds() - 49 * 60 * 60)).toBe(false)
  })
})
