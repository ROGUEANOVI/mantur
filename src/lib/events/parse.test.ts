import { describe, it, expect } from 'vitest'
import { parseEventFields } from './parse'
import { eventsCopy } from '@/lib/copy/events'

const errors = eventsCopy.admin.errors
const PLACE_ID = '22222222-2222-2222-2222-222222222222'
const PACKAGE_ID = '33333333-3333-3333-3333-333333333333'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const base = { title: 'Festival del Retorno', starts_on: '2026-12-14', cta_type: 'whatsapp', is_active: 'on' }

describe('parseEventFields', () => {
  it('parses a minimal valid event with defaults', () => {
    expect(parseEventFields(form(base))).toEqual({
      fields: {
        title: 'Festival del Retorno',
        summary: null,
        starts_on: '2026-12-14',
        ends_on: null,
        time_label: null,
        location_label: null,
        place_id: null,
        cta_type: 'whatsapp',
        package_id: null,
        external_url: null,
        is_active: true,
        sort_order: 0,
      },
    })
  })

  it('trims text and keeps optional fields', () => {
    const result = parseEventFields(
      form({
        ...base,
        title: '  Festival  ',
        summary: ' Música vallenata ',
        ends_on: '2026-12-16',
        time_label: 'Desde las 7:00 p. m.',
        location_label: 'Plaza principal',
        place_id: PLACE_ID,
        sort_order: '3',
      }),
    )
    expect(result).toMatchObject({
      fields: {
        title: 'Festival',
        summary: 'Música vallenata',
        ends_on: '2026-12-16',
        time_label: 'Desde las 7:00 p. m.',
        location_label: 'Plaza principal',
        place_id: PLACE_ID,
        sort_order: 3,
      },
    })
  })

  it('treats an unchecked is_active as paused', () => {
    const { is_active: _omit, ...rest } = base
    expect(parseEventFields(form(rest))).toMatchObject({ fields: { is_active: false } })
  })

  it('stores an end date equal to the start as a single-day event', () => {
    expect(parseEventFields(form({ ...base, ends_on: '2026-12-14' }))).toMatchObject({ fields: { ends_on: null } })
  })

  it.each([
    [{ title: '' }, errors.titleRequired],
    [{ title: 'x'.repeat(91) }, errors.titleTooLong],
    [{ summary: 'x'.repeat(221) }, errors.summaryTooLong],
    [{ starts_on: '' }, errors.invalidStartsOn],
    [{ starts_on: '2026-02-30' }, errors.invalidStartsOn],
    [{ ends_on: 'mañana' }, errors.invalidEndsOn],
    [{ ends_on: '2026-12-13' }, errors.endsBeforeStart],
    [{ time_label: 'x'.repeat(61) }, errors.timeLabelTooLong],
    [{ location_label: 'x'.repeat(91) }, errors.locationTooLong],
    [{ place_id: 'not-a-uuid' }, errors.invalidPlace],
    [{ cta_type: 'popup' }, errors.invalidCtaType],
    [{ sort_order: '-1' }, errors.invalidSortOrder],
    [{ sort_order: '1.5' }, errors.invalidSortOrder],
    [{ sort_order: '10000' }, errors.invalidSortOrder],
  ])('rejects %o', (override, expected) => {
    expect(parseEventFields(form({ ...base, ...override }))).toEqual({ error: expected })
  })

  describe('call to action', () => {
    it('package: requires a valid package id', () => {
      expect(parseEventFields(form({ ...base, cta_type: 'package' }))).toEqual({ error: errors.packageRequired })
      expect(parseEventFields(form({ ...base, cta_type: 'package', package_id: 'x' }))).toEqual({
        error: errors.invalidPackage,
      })
      expect(parseEventFields(form({ ...base, cta_type: 'package', package_id: PACKAGE_ID }))).toMatchObject({
        fields: { cta_type: 'package', package_id: PACKAGE_ID, external_url: null },
      })
    })

    it('external: requires an https link', () => {
      for (const url of ['', 'http://manaure.gov.co', 'javascript:void(0)', 'https://']) {
        expect(parseEventFields(form({ ...base, cta_type: 'external', external_url: url }))).toEqual({
          error: errors.invalidExternalUrl,
        })
      }
      expect(
        parseEventFields(form({ ...base, cta_type: 'external', external_url: 'https://manaure.gov.co/evento' })),
      ).toMatchObject({ fields: { external_url: 'https://manaure.gov.co/evento', package_id: null } })
    })

    it('drops stale package/link values that the chosen CTA does not use', () => {
      const result = parseEventFields(
        form({ ...base, cta_type: 'none', package_id: PACKAGE_ID, external_url: 'https://example.com' }),
      )
      expect(result).toMatchObject({ fields: { cta_type: 'none', package_id: null, external_url: null } })
    })
  })
})
