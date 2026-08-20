import { describe, it, expect } from 'vitest'
import { haversineDistanceKm } from './geo'

describe('haversineDistanceKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistanceKm([10.3912, -73.0272], [10.3912, -73.0272])).toBe(0)
  })

  it('returns the great-circle distance between two known points', () => {
    // Bogotá to Medellín is ~245km in a straight line.
    const bogota: [number, number] = [4.711, -74.0721]
    const medellin: [number, number] = [6.2442, -75.5812]
    const km = haversineDistanceKm(bogota, medellin)
    expect(km).toBeGreaterThan(230)
    expect(km).toBeLessThan(260)
  })

  it('is symmetric', () => {
    const a: [number, number] = [10.4, -73.0]
    const b: [number, number] = [10.35, -73.05]
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10)
  })
})
