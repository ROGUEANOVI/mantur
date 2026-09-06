import { describe, it, expect } from 'vitest'
import { resolvePackageProviders } from './providers'

function makeAdmin(items: unknown[]) {
  return {
    from: (table: string) => {
      if (table === 'package_items') {
        return { select: () => ({ eq: () => Promise.resolve({ data: items }) }) }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  } as unknown as Parameters<typeof resolvePackageProviders>[0]
}

describe('resolvePackageProviders', () => {
  it('returns an empty array when the package has no items', async () => {
    const result = await resolvePackageProviders(makeAdmin([]), 'package-1')
    expect(result).toEqual([])
  })

  it('maps a service item to a business recipient', async () => {
    const result = await resolvePackageProviders(
      makeAdmin([{ internal_cost_cents: 5000, services: { business_id: 'biz-1' }, guide_tours: null }]),
      'package-1',
    )
    expect(result).toEqual([{ recipientType: 'business', recipientId: 'biz-1', amountCents: 5000 }])
  })

  it('maps a guide_tour item to a guide recipient', async () => {
    const result = await resolvePackageProviders(
      makeAdmin([{ internal_cost_cents: 3000, services: null, guide_tours: { guide_id: 'guide-1' } }]),
      'package-1',
    )
    expect(result).toEqual([{ recipientType: 'guide', recipientId: 'guide-1', amountCents: 3000 }])
  })

  it('sums multiple items from the same provider into one entry', async () => {
    const result = await resolvePackageProviders(
      makeAdmin([
        { internal_cost_cents: 5000, services: { business_id: 'biz-1' }, guide_tours: null },
        { internal_cost_cents: 3000, services: { business_id: 'biz-1' }, guide_tours: null },
      ]),
      'package-1',
    )
    expect(result).toEqual([{ recipientType: 'business', recipientId: 'biz-1', amountCents: 8000 }])
  })

  it('keeps separate providers as separate entries', async () => {
    const result = await resolvePackageProviders(
      makeAdmin([
        { internal_cost_cents: 5000, services: { business_id: 'biz-1' }, guide_tours: null },
        { internal_cost_cents: 3000, services: null, guide_tours: { guide_id: 'guide-1' } },
      ]),
      'package-1',
    )
    expect(result).toEqual([
      { recipientType: 'business', recipientId: 'biz-1', amountCents: 5000 },
      { recipientType: 'guide', recipientId: 'guide-1', amountCents: 3000 },
    ])
  })

  it('skips an item with neither a service nor a guide_tour relation resolvable', async () => {
    const result = await resolvePackageProviders(
      makeAdmin([{ internal_cost_cents: 5000, services: null, guide_tours: null }]),
      'package-1',
    )
    expect(result).toEqual([])
  })

  it('returns an empty array when the query returns no data', async () => {
    const admin = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null }) }) }) } as unknown as Parameters<
      typeof resolvePackageProviders
    >[0]
    const result = await resolvePackageProviders(admin, 'package-1')
    expect(result).toEqual([])
  })
})
