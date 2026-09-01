import { describe, it, expect } from 'vitest'
import { computeHoursUntilBooking, computeRefundAmountCents, computeNetRefundAmountCents } from './refunds'

describe('computeHoursUntilBooking', () => {
  it('returns 240 hours (10 days) for a booking 10 days out', () => {
    expect(computeHoursUntilBooking('2026-09-10', '2026-08-31')).toBe(240)
  })

  it('returns 72 hours for a booking exactly 3 days out', () => {
    expect(computeHoursUntilBooking('2026-09-03', '2026-08-31')).toBe(72)
  })

  it('returns 24 hours for a booking exactly 1 day out', () => {
    expect(computeHoursUntilBooking('2026-09-01', '2026-08-31')).toBe(24)
  })

  it('returns 0 hours for a same-day booking', () => {
    expect(computeHoursUntilBooking('2026-08-31', '2026-08-31')).toBe(0)
  })

  it('clamps a past booking date (no-show) to 0 hours instead of negative', () => {
    expect(computeHoursUntilBooking('2026-08-20', '2026-08-31')).toBe(0)
  })

  it('correctly diffs across a month boundary', () => {
    expect(computeHoursUntilBooking('2026-09-01', '2026-08-30')).toBe(48)
  })
})

describe('computeRefundAmountCents', () => {
  it('computes the full amount at 100%', () => {
    expect(computeRefundAmountCents(135_000, 100)).toBe(135_000)
  })

  it('computes half the amount at 50%', () => {
    expect(computeRefundAmountCents(135_000, 50)).toBe(67_500)
  })

  it('returns 0 at 0%', () => {
    expect(computeRefundAmountCents(135_000, 0)).toBe(0)
  })

  it('rounds to the nearest cent instead of truncating', () => {
    // 999 * 50 / 100 = 499.5 -> rounds to 500, not 499
    expect(computeRefundAmountCents(999, 50)).toBe(500)
  })
})

describe('computeNetRefundAmountCents', () => {
  it("passes through the full gross amount for 'void', regardless of the fee", () => {
    expect(computeNetRefundAmountCents(100_000, 88_030, 'void')).toBe(100_000)
  })

  it("passes through the full gross amount for 'void' even with no fee snapshot", () => {
    expect(computeNetRefundAmountCents(100_000, null, 'void')).toBe(100_000)
  })

  it("deducts the Wompi fee from the gross amount for 'manual'", () => {
    expect(computeNetRefundAmountCents(100_000, 3_750, 'manual')).toBe(96_250)
  })

  it("treats a missing fee snapshot as 0 deduction for 'manual'", () => {
    expect(computeNetRefundAmountCents(100_000, null, 'manual')).toBe(100_000)
  })

  it("floors the result at 0 when the fee exceeds the gross amount for 'manual'", () => {
    expect(computeNetRefundAmountCents(500, 88_030, 'manual')).toBe(0)
  })
})
