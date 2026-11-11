import { describe, it, expect, beforeEach } from 'vitest'
import {
  campaignTag,
  captureAttribution,
  cleanCampaign,
  parseAcquisition,
  parseAttribution,
  readAttribution,
  sourceFromAttribution,
} from './attribution'

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('parseAttribution', () => {
  it('keeps the known campaign keys only', () => {
    expect(
      parseAttribution('?utm_source=meta&utm_medium=paid_social&utm_campaign=mt_ventas_fullday_202611&foo=bar'),
    ).toEqual({ utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'mt_ventas_fullday_202611' })
  })

  it('drops values with characters outside the safe charset', () => {
    expect(parseAttribution('?utm_campaign=<script>&utm_source=google')).toEqual({ utm_source: 'google' })
  })
})

describe('captureAttribution', () => {
  it('stores the first touch and ignores later ones in the same session', () => {
    captureAttribution('?utm_source=meta&utm_campaign=first')
    captureAttribution('?utm_source=google&utm_campaign=second')
    expect(readAttribution()).toEqual({ utm_source: 'meta', utm_campaign: 'first' })
  })

  it('stores nothing for a direct visit', () => {
    captureAttribution('')
    expect(readAttribution()).toEqual({})
  })
})

describe('sourceFromAttribution', () => {
  it.each([
    [{ gclid: 'abc' }, 'google_ads'],
    [{ utm_source: 'google', utm_medium: 'cpc' }, 'google_ads'],
    [{ utm_source: 'meta', utm_medium: 'paid_social' }, 'meta_ads'],
    [{ utm_source: 'instagram', utm_medium: 'paid_social' }, 'meta_ads'],
    [{ fbclid: 'x', utm_medium: 'paid' }, 'meta_ads'],
    [{ utm_source: 'instagram' }, 'instagram'],
    [{ fbclid: 'x' }, 'facebook'],
    [{ utm_source: 'tiktok' }, 'tiktok'],
    [{ utm_source: 'google' }, 'google_organic'],
    [{ utm_source: 'newsletter' }, 'other'],
    [{}, null],
  ])('%o → %s', (attribution, expected) => {
    expect(sourceFromAttribution(attribution)).toBe(expected)
  })
})

describe('campaignTag', () => {
  it('prefers the campaign, falls back to the source, empty when direct', () => {
    expect(campaignTag({ utm_source: 'meta', utm_campaign: 'mt_x' })).toBe('mt_x')
    expect(campaignTag({ utm_source: 'meta' })).toBe('meta')
    expect(campaignTag({})).toBe('')
  })
})

describe('parseAcquisition (server)', () => {
  function fd(fields: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    return f
  }

  it('accepts a known source and a clean campaign', () => {
    expect(parseAcquisition(fd({ acquisition_source: 'meta_ads', acquisition_campaign: 'mt_ventas_202611' }))).toEqual({
      acquisition_source: 'meta_ads',
      acquisition_campaign: 'mt_ventas_202611',
    })
  })

  it('nulls out unknown sources and unsafe campaigns instead of failing', () => {
    expect(parseAcquisition(fd({ acquisition_source: 'hacker', acquisition_campaign: 'a b <c>' }))).toEqual({
      acquisition_source: null,
      acquisition_campaign: null,
    })
    expect(parseAcquisition(fd({}))).toEqual({ acquisition_source: null, acquisition_campaign: null })
  })

  it('cleanCampaign caps the length at 150', () => {
    expect(cleanCampaign('a'.repeat(200))).toHaveLength(150)
  })
})
