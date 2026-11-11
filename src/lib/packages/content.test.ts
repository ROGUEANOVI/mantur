import { describe, it, expect } from 'vitest'
import { describeTier, joinLines, parseLines, parsePackageContent, parsePriceTier } from './content'

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('parseLines', () => {
  it('splits by line (\\n or \\r\\n), trims and drops blank lines', () => {
    expect(parseLines('Transporte\r\n\r\n  Guía local  \nSeguro')).toEqual(['Transporte', 'Guía local', 'Seguro'])
  })

  it('strips bullets and numbering typed by habit', () => {
    expect(parseLines('- Uno\n• Dos\n1. Tres\n2) Cuatro\n✅ Cinco')).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'])
  })

  it('round-trips with joinLines', () => {
    expect(parseLines(joinLines(['A', 'B']))).toEqual(['A', 'B'])
    expect(joinLines(null)).toBe('')
  })
})

describe('parsePackageContent', () => {
  it('returns all-empty fields for an empty form', () => {
    const result = parsePackageContent(fd({}), null)
    expect(result).toEqual({
      fields: {
        summary: null,
        itinerary: [],
        includes: [],
        what_to_bring: [],
        duration_label: null,
        meeting_point: null,
        difficulty: null,
        min_people: null,
        payment_info: null,
        cancellation_policy: null,
      },
    })
  })

  it('parses a fully filled form', () => {
    const result = parsePackageContent(
      fd({
        summary: '5 destinos en un día.',
        itinerary: 'Pozo Azul\nLos Pinos',
        includes: '- Transporte\n- Almuerzo',
        what_to_bring: 'Traje de baño',
        duration_label: '1 día · 8:00 a. m. a 6:00 p. m.',
        meeting_point: 'Parque principal',
        difficulty: 'media',
        min_people: '2',
        payment_info: 'Transferencia o Nequi.',
        cancellation_policy: 'Reprogramación sin costo con 48 h de aviso.',
      }),
      12,
    )
    expect(result).toEqual({
      fields: expect.objectContaining({
        itinerary: ['Pozo Azul', 'Los Pinos'],
        includes: ['Transporte', 'Almuerzo'],
        difficulty: 'media',
        min_people: 2,
      }),
    })
  })

  it('rejects an unknown difficulty', () => {
    expect(parsePackageContent(fd({ difficulty: 'extrema' }), null)).toEqual({
      error: 'Selecciona una dificultad válida.',
    })
  })

  it.each(['0', '-1', '1.5', 'dos'])('rejects an invalid minimum group (%s)', (value) => {
    expect(parsePackageContent(fd({ min_people: value }), null)).toEqual({
      error: 'El grupo mínimo debe ser un número entero mayor a 0.',
    })
  })

  it('rejects a minimum group above the package capacity', () => {
    expect(parsePackageContent(fd({ min_people: '13' }), 12)).toEqual({
      error: 'El grupo mínimo no puede superar el cupo máximo del paquete.',
    })
  })

  it('enforces the text limits', () => {
    expect(parsePackageContent(fd({ summary: 'a'.repeat(281) }), null)).toEqual({
      error: 'El resumen no puede superar 280 caracteres.',
    })
    expect(parsePackageContent(fd({ includes: Array(21).fill('x').join('\n') }), null)).toEqual({
      error: 'Cada lista admite hasta 20 líneas de máximo 300 caracteres.',
    })
    expect(parsePackageContent(fd({ cancellation_policy: 'a'.repeat(801) }), null)).toEqual({
      error: 'La política de cancelación no puede superar 800 caracteres.',
    })
  })
})

describe('parsePriceTier', () => {
  it('parses an open-ended per-person tier', () => {
    expect(parsePriceTier(fd({ min_people: '6', amount: '190000', amount_basis: 'per_person' }))).toEqual({
      tier: { min_people: 6, max_people: null, amount: 190000, amount_basis: 'per_person' },
    })
  })

  it('rejects a max below the min', () => {
    expect(parsePriceTier(fd({ min_people: '3', max_people: '2', amount: '1', amount_basis: 'per_group' }))).toEqual({
      error: 'El máximo debe ser un entero mayor o igual al mínimo.',
    })
  })

  it.each(['0', '12.5', 'abc', '100000001'])('rejects an invalid amount (%s)', (amount) => {
    expect(parsePriceTier(fd({ min_people: '2', amount, amount_basis: 'per_group' }))).toEqual({
      error: 'El valor debe ser un número entero mayor a 0.',
    })
  })

  it('rejects an unknown basis', () => {
    expect(parsePriceTier(fd({ min_people: '2', amount: '1000', amount_basis: 'per_night' }))).toEqual({
      error: 'Elige si el valor es por persona o del grupo.',
    })
  })
})

describe('describeTier', () => {
  it('describes an exact group size with a group total', () => {
    expect(describeTier({ min_people: 2, max_people: 2, amount: '280000.00', amount_basis: 'per_group' })).toEqual({
      people: '2 personas',
      price: '$280.000 en total',
    })
  })

  it('describes a range and an open-ended size per person', () => {
    expect(describeTier({ min_people: 3, max_people: 5, amount: 210000, amount_basis: 'per_person' }).people).toBe(
      '3 a 5 personas',
    )
    expect(describeTier({ min_people: 6, max_people: null, amount: 190000, amount_basis: 'per_person' })).toEqual({
      people: '6 o más personas',
      price: '$190.000 por persona',
    })
  })
})
