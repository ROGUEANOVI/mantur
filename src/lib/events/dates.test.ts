import { describe, it, expect } from 'vitest'
import { dateBlock, dateRangeLabel, eventPhase, eventTiming, isIsoDate, lastDay, todayInBogota } from './dates'

const TODAY = '2026-11-12'

describe('isIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
  })

  it('rejects malformed strings and impossible dates', () => {
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate('12/11/2026')).toBe(false)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
  })
})

describe('todayInBogota', () => {
  it('uses Colombia time, not UTC: 02:00 UTC is still the previous day', () => {
    expect(todayInBogota(new Date('2026-11-13T02:00:00Z'))).toBe('2026-11-12')
  })

  it('rolls over at midnight Colombia time (05:00 UTC)', () => {
    expect(todayInBogota(new Date('2026-11-13T05:00:00Z'))).toBe('2026-11-13')
  })
})

describe('lastDay / eventPhase', () => {
  it('a single-day event ends the day it starts', () => {
    expect(lastDay({ starts_on: TODAY, ends_on: null })).toBe(TODAY)
  })

  it('is upcoming before its first day', () => {
    expect(eventPhase({ starts_on: '2026-11-20', ends_on: null }, TODAY)).toBe('upcoming')
  })

  it('is ongoing from its first through its last day', () => {
    expect(eventPhase({ starts_on: TODAY, ends_on: null }, TODAY)).toBe('ongoing')
    expect(eventPhase({ starts_on: '2026-11-10', ends_on: TODAY }, TODAY)).toBe('ongoing')
  })

  it('is finished after its last day', () => {
    expect(eventPhase({ starts_on: '2026-11-10', ends_on: '2026-11-11' }, TODAY)).toBe('finished')
    expect(eventPhase({ starts_on: '2026-11-11', ends_on: null }, TODAY)).toBe('finished')
  })
})

describe('eventTiming', () => {
  it('says "today" for a single-day event happening today', () => {
    expect(eventTiming({ starts_on: TODAY, ends_on: null }, TODAY)).toBe('today')
  })

  it('says "ongoing" for a multi-day event already under way', () => {
    expect(eventTiming({ starts_on: '2026-11-10', ends_on: '2026-11-14' }, TODAY)).toBe('ongoing')
  })

  it('says "tomorrow" the day before', () => {
    expect(eventTiming({ starts_on: '2026-11-13', ends_on: null }, TODAY)).toBe('tomorrow')
  })

  it('says "thisWeek" within the next six days', () => {
    expect(eventTiming({ starts_on: '2026-11-18', ends_on: null }, TODAY)).toBe('thisWeek')
  })

  it('says nothing for events further away, or already finished', () => {
    expect(eventTiming({ starts_on: '2026-11-19', ends_on: null }, TODAY)).toBeNull()
    expect(eventTiming({ starts_on: '2026-11-01', ends_on: null }, TODAY)).toBeNull()
  })

  it('handles the month boundary', () => {
    expect(eventTiming({ starts_on: '2026-12-01', ends_on: null }, '2026-11-30')).toBe('tomorrow')
  })
})

describe('dateBlock', () => {
  it('single day', () => {
    expect(dateBlock({ starts_on: '2026-12-14', ends_on: null })).toEqual({ days: '14', months: 'dic' })
  })

  it('treats an identical end date as a single day', () => {
    expect(dateBlock({ starts_on: '2026-12-14', ends_on: '2026-12-14' })).toEqual({ days: '14', months: 'dic' })
  })

  it('range within one month', () => {
    expect(dateBlock({ starts_on: '2026-12-14', ends_on: '2026-12-16' })).toEqual({ days: '14–16', months: 'dic' })
  })

  it('range across months', () => {
    expect(dateBlock({ starts_on: '2026-12-30', ends_on: '2027-01-02' })).toEqual({ days: '30–2', months: 'dic–ene' })
  })
})

describe('dateRangeLabel', () => {
  it('single day', () => {
    expect(dateRangeLabel({ starts_on: '2026-12-14', ends_on: null })).toBe('14 de diciembre')
  })

  it('range within one month', () => {
    expect(dateRangeLabel({ starts_on: '2026-12-14', ends_on: '2026-12-16' })).toBe('14 al 16 de diciembre')
  })

  it('range across months', () => {
    expect(dateRangeLabel({ starts_on: '2026-12-30', ends_on: '2027-01-02' })).toBe('30 de diciembre al 2 de enero')
  })
})
