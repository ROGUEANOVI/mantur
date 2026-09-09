import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getBlockedDates } from './availability'

type Row = Record<string, unknown>

function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            // provider_weekly_availability chain ends here (two .eq() calls)
            gte: () => ({
              lte: () => Promise.resolve({ data: tables[table] ?? [] }),
            }),
            then: (resolve: (v: { data: Row[] }) => unknown) =>
              Promise.resolve(resolve({ data: tables[table] ?? [] })),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof getBlockedDates>[0]
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Frozen "today" in Bogotá time — a Tuesday.
  vi.setSystemTime(new Date('2026-09-15T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getBlockedDates', () => {
  it('returns no blocked dates when nothing is marked', async () => {
    const admin = fakeAdmin({ provider_availability: [], provider_weekly_availability: [] })
    const blocked = await getBlockedDates(admin, 'service', 'item-1', 'business', 'biz-1')
    expect(blocked).toEqual([])
  })

  it('blocks a date the item itself marks unavailable', async () => {
    const admin = fakeAdmin({
      provider_availability: [{ date: '2026-09-20', status: 'unavailable' }],
      provider_weekly_availability: [],
    })
    const blocked = await getBlockedDates(admin, 'service', 'item-1', 'business', 'biz-1')
    expect(blocked).toContain('2026-09-20')
  })

  it('blocks a date the parent marks unavailable, even without an item-level row', async () => {
    let call = 0
    const admin = {
      from: (table: string) => {
        if (table === 'provider_availability') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => {
                      call += 1
                      // First call = item-level query (no row), second = parent-level.
                      if (call === 1) return Promise.resolve({ data: [] })
                      return Promise.resolve({ data: [{ date: '2026-09-22', status: 'unavailable' }] })
                    },
                  }),
                }),
              }),
            }),
          }
        }
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }
      },
    } as unknown as Parameters<typeof getBlockedDates>[0]

    const blocked = await getBlockedDates(admin, 'service', 'item-1', 'business', 'biz-1')
    expect(blocked).toContain('2026-09-22')
  })

  it('projects a weekly-unavailable weekday forward across the whole range', async () => {
    // 2026-09-15 is a Tuesday (weekday 2). Every future Tuesday should block.
    const admin = fakeAdmin({
      provider_availability: [],
      provider_weekly_availability: [{ weekday: 2, status: 'unavailable' }],
    })
    const blocked = await getBlockedDates(admin, 'service', 'item-1', 'business', 'biz-1')
    expect(blocked).toContain('2026-09-15')
    expect(blocked).toContain('2026-09-22')
    expect(blocked).toContain('2026-09-29')
    expect(blocked).not.toContain('2026-09-16')
  })

  it('lets an explicit per-date "available" override on the parent win over the weekly pattern', async () => {
    let call = 0
    const admin = {
      from: (table: string) => {
        if (table === 'provider_availability') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => {
                      call += 1
                      // First call = item-level query (empty), second = parent-level.
                      if (call === 1) return Promise.resolve({ data: [] })
                      return Promise.resolve({ data: [{ date: '2026-09-22', status: 'available' }] })
                    },
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [{ weekday: 2, status: 'unavailable' }] }),
            }),
          }),
        }
      },
    } as unknown as Parameters<typeof getBlockedDates>[0]

    const blocked = await getBlockedDates(admin, 'service', 'item-1', 'business', 'biz-1')
    // 2026-09-22 is a Tuesday and would otherwise be blocked by the weekly
    // pattern, but the parent's explicit 'available' row for that date wins.
    expect(blocked).not.toContain('2026-09-22')
    // A different Tuesday with no override still blocks.
    expect(blocked).toContain('2026-09-29')
  })
})
