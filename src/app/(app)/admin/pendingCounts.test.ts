import { describe, it, expect, vi, beforeEach } from 'vitest'

// getSidebarPendingCounts is wrapped in React's cache(), which memoizes
// indefinitely when called outside an actual render tree (no way to detect
// "the render finished" in a plain test). Each test below resets modules and
// re-imports fresh so one test's mocked counts can never leak into another's
// memoized result.
async function importFreshWithCounts(counts: {
  negocios: number | null
  solicitudes: number | null
  reembolsosPending: number | null
  reembolsosProcessing: number | null
}) {
  vi.resetModules()

  const fromMock = vi.fn((table: string) => {
    if (table === 'businesses') {
      return { select: () => ({ eq: () => ({ count: counts.negocios, error: null }) }) }
    }
    if (table === 'role_requests') {
      return { select: () => ({ eq: () => ({ count: counts.solicitudes, error: null }) }) }
    }
    if (table === 'refund_requests') {
      // Both calls share this table — differentiate by which status was
      // asked for so 'pending' and 'processing' resolve independently.
      return {
        select: () => ({
          eq: (_col: string, value: string) => ({
            count: value === 'pending' ? counts.reembolsosPending : counts.reembolsosProcessing,
            error: null,
          }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({ from: fromMock }),
  }))

  const { getSidebarPendingCounts } = await import('./pendingCounts')
  return getSidebarPendingCounts()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getSidebarPendingCounts', () => {
  it('sums pending and processing refund counts into reembolsos, keeping the split available separately', async () => {
    const result = await importFreshWithCounts({
      negocios: 2,
      solicitudes: 3,
      reembolsosPending: 1,
      reembolsosProcessing: 4,
    })

    expect(result).toEqual({
      negocios: 2,
      solicitudes: 3,
      reembolsos: 5,
      reembolsosPending: 1,
      reembolsosProcessing: 4,
    })
  })

  it('treats a null count (e.g. a query error) as 0 for every field', async () => {
    const result = await importFreshWithCounts({
      negocios: null,
      solicitudes: null,
      reembolsosPending: null,
      reembolsosProcessing: null,
    })

    expect(result).toEqual({
      negocios: 0,
      solicitudes: 0,
      reembolsos: 0,
      reembolsosPending: 0,
      reembolsosProcessing: 0,
    })
  })

  it('reports reembolsos as the total even when only processing has anything (no pending)', async () => {
    const result = await importFreshWithCounts({
      negocios: 0,
      solicitudes: 0,
      reembolsosPending: 0,
      reembolsosProcessing: 1,
    })

    expect(result.reembolsos).toBe(1)
    expect(result.reembolsosPending).toBe(0)
    expect(result.reembolsosProcessing).toBe(1)
  })
})
