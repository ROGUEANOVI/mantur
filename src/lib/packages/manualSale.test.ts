import { describe, it, expect } from 'vitest'
import {
  billingSummary,
  bogotaToday,
  computeCatalogTotal,
  customerName,
  firstEmbedded,
  parseManualPackageSale,
  parseManualPayment,
  type SalePackage,
} from './manualSale'

const TODAY = '2026-11-11'
const PER_PERSON: SalePackage = { base_price: '150000.00', pricing_unit: 'per_person', capacity: 10 }
const FIXED: SalePackage = { base_price: 280000, pricing_unit: 'fixed', capacity: null }

function fd(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const BASE = { quantity: '2', booking_date: '2026-11-20', payment_status: 'pending' }
const GUEST = { guest_full_name: 'Ana Pérez', guest_phone: '300 123 4567' }
const PAID = { payment_status: 'paid', payment_method: 'nequi_daviplata', paid_date: TODAY }

function sale(fields: Record<string, string>, pkg: SalePackage = PER_PERSON, mode: 'registered' | 'guest' = 'registered') {
  const result = parseManualPackageSale(fd(fields), pkg, mode, TODAY)
  if ('error' in result) throw new Error(`unexpected error: ${result.error}`)
  return result.sale
}

function errorOf(fields: Record<string, string>, pkg: SalePackage = PER_PERSON, mode: 'registered' | 'guest' = 'registered') {
  const result = parseManualPackageSale(fd(fields), pkg, mode, TODAY)
  return 'error' in result ? result.error : null
}

describe('computeCatalogTotal', () => {
  it('multiplies per_person price by quantity', () => {
    expect(computeCatalogTotal(PER_PERSON, 3)).toEqual({ storedQuantity: 3, catalogTotal: 450000 })
  })

  it('uses the flat price and stores quantity 1 for fixed packages', () => {
    expect(computeCatalogTotal(FIXED, 5)).toEqual({ storedQuantity: 1, catalogTotal: 280000 })
  })
})

describe('bogotaToday', () => {
  it('formats the Colombian calendar date, not UTC', () => {
    // 03:00 UTC on Nov 12 is still Nov 11 in Bogotá (UTC-5).
    expect(bogotaToday(new Date('2026-11-12T03:00:00Z'))).toBe('2026-11-11')
  })
})

describe('parseManualPackageSale — amounts', () => {
  it('computes the catalog total server-side and uses it as the total by default', () => {
    const s = sale(BASE)
    expect(s.catalogTotal).toBe(300000)
    expect(s.totalAmount).toBe(300000)
    expect(s.priceAdjustmentReason).toBeNull()
  })

  it('rejects a quantity over the package capacity', () => {
    expect(errorOf({ ...BASE, quantity: '11' })).toBe('Supera el cupo máximo disponible.')
  })

  it('rejects a quantity below 1', () => {
    expect(errorOf({ ...BASE, quantity: '0' })).toBe('La cantidad debe ser al menos 1.')
  })

  it('accepts an agreed total with a reason', () => {
    const s = sale({ ...BASE, price_override: 'on', agreed_total: '250000', price_adjustment_reason: 'Descuento grupo' })
    expect(s.totalAmount).toBe(250000)
    expect(s.catalogTotal).toBe(300000)
    expect(s.priceAdjustmentReason).toBe('Descuento grupo')
  })

  it('requires a reason when the agreed total differs from the catalog', () => {
    expect(errorOf({ ...BASE, price_override: 'on', agreed_total: '250000', price_adjustment_reason: ' ' })).toBe(
      'Escribe el motivo del precio acordado (entre 3 y 300 caracteres).',
    )
  })

  it('needs no reason when the agreed total equals the catalog total', () => {
    const s = sale({ ...BASE, price_override: 'on', agreed_total: '300000' })
    expect(s.totalAmount).toBe(300000)
    expect(s.priceAdjustmentReason).toBeNull()
  })

  it.each(['0', '-5', '12.5', 'abc', '', '100000001'])('rejects an invalid agreed total (%s)', (agreed) => {
    expect(errorOf({ ...BASE, price_override: 'on', agreed_total: agreed, price_adjustment_reason: 'x x x' })).toBe(
      'El total acordado debe ser un número entero mayor a 0.',
    )
  })

  it('ignores agreed_total when the override box is not checked', () => {
    expect(sale({ ...BASE, agreed_total: '1' }).totalAmount).toBe(300000)
  })
})

describe('parseManualPackageSale — dates and notes', () => {
  it('allows a past trip date (late registration)', () => {
    expect(sale({ ...BASE, booking_date: '2026-10-01' }).bookingDate).toBe('2026-10-01')
  })

  it.each(['2026-02-30', '20-11-2026', '', '2029-01-01'])('rejects an invalid or too-distant date (%s)', (date) => {
    expect(errorOf({ ...BASE, booking_date: date })).toBe('Elige una fecha de viaje válida.')
  })

  it('rejects notes over 1000 characters', () => {
    expect(errorOf({ ...BASE, notes: 'a'.repeat(1001) })).toBe('Las notas no pueden superar 1000 caracteres.')
  })
})

describe('parseManualPackageSale — guest customer', () => {
  it('returns no guest for a registered tourist, even if guest fields are sent', () => {
    expect(sale({ ...BASE, ...GUEST }).guest).toBeNull()
  })

  it('normalizes the phone and trims the name', () => {
    const s = sale({ ...BASE, guest_full_name: '  Ana   Pérez ', guest_phone: '+57 300 123 4567' }, PER_PERSON, 'guest')
    expect(s.guest).toEqual({
      fullName: 'Ana Pérez',
      phone: '3001234567',
      documentType: null,
      documentNumber: null,
      email: null,
    })
  })

  it('requires a name', () => {
    expect(errorOf({ ...BASE, ...GUEST, guest_full_name: 'A' }, PER_PERSON, 'guest')).toBe(
      'Escribe el nombre completo del cliente.',
    )
  })

  it('requires a valid Colombian mobile', () => {
    expect(errorOf({ ...BASE, ...GUEST, guest_phone: '12345' }, PER_PERSON, 'guest')).toBe(
      'El teléfono debe ser un celular colombiano de 10 dígitos.',
    )
  })

  it('stores the ID document when both parts are valid', () => {
    const s = sale(
      { ...BASE, ...GUEST, guest_document_type: 'CC', guest_document_number: '1 002 003 000', guest_email: 'Ana@Mail.com' },
      PER_PERSON,
      'guest',
    )
    expect(s.guest).toMatchObject({ documentType: 'CC', documentNumber: '1002003000', email: 'ana@mail.com' })
  })

  it.each([
    { guest_document_type: 'CC', guest_document_number: '' },
    { guest_document_type: '', guest_document_number: '1002003000' },
    { guest_document_type: 'XX', guest_document_number: '1002003000' },
    { guest_document_type: 'CC', guest_document_number: '12' },
  ])('rejects an incomplete or invalid document (%o)', (doc) => {
    expect(errorOf({ ...BASE, ...GUEST, ...doc }, PER_PERSON, 'guest')).toBe(
      'Revisa el documento: elige el tipo y escribe un número válido (5 a 20 caracteres).',
    )
  })

  it('rejects an invalid email', () => {
    expect(errorOf({ ...BASE, ...GUEST, guest_email: 'ana@' }, PER_PERSON, 'guest')).toBe('El correo no es válido.')
  })
})

describe('parseManualPackageSale — payment', () => {
  it('leaves payment fields empty for a pending sale', () => {
    const s = sale({ ...BASE, payment_method: 'cash', paid_date: TODAY })
    expect(s).toMatchObject({ isPaid: false, paymentMethod: null, paymentReference: null, paidAt: null })
  })

  it('records method, reference and a noon-Bogotá timestamp for a paid sale', () => {
    const s = sale({ ...BASE, ...PAID, payment_reference: 'TRX-123' })
    expect(s).toMatchObject({
      isPaid: true,
      paymentMethod: 'nequi_daviplata',
      paymentReference: 'TRX-123',
      paidAt: '2026-11-11T12:00:00-05:00',
    })
  })

  it('requires a known payment method when paid', () => {
    expect(errorOf({ ...BASE, ...PAID, payment_method: 'crypto' })).toBe('Selecciona el método de pago.')
  })

  it('rejects a future payment date', () => {
    expect(errorOf({ ...BASE, ...PAID, paid_date: '2026-11-12' })).toBe('La fecha del pago no puede ser futura.')
  })

  it('rejects a payment reference over 100 characters', () => {
    expect(errorOf({ ...BASE, ...PAID, payment_reference: 'x'.repeat(101) })).toBe(
      'El comprobante no puede superar 100 caracteres.',
    )
  })
})

describe('parseManualPayment', () => {
  it('parses a valid payment', () => {
    expect(parseManualPayment(fd({ payment_method: 'cash', paid_date: '2026-11-10' }), TODAY)).toEqual({
      method: 'cash',
      reference: null,
      paidAt: '2026-11-10T12:00:00-05:00',
    })
  })

  it('requires a method', () => {
    expect(parseManualPayment(fd({ paid_date: TODAY }), TODAY)).toEqual({ error: 'Selecciona el método de pago.' })
  })

  it('rejects a future date', () => {
    expect(parseManualPayment(fd({ payment_method: 'cash', paid_date: '2027-01-01' }), TODAY)).toEqual({
      error: 'La fecha del pago no puede ser futura.',
    })
  })
})

describe('display helpers', () => {
  const guest = {
    full_name: 'Ana Pérez',
    phone: '3001234567',
    document_type: 'CC',
    document_number: '1002003000',
    email: 'ana@mail.com',
  }

  it('firstEmbedded accepts an object, a one-element array or null', () => {
    expect(firstEmbedded(guest)).toBe(guest)
    expect(firstEmbedded([guest])).toBe(guest)
    expect(firstEmbedded([])).toBeNull()
    expect(firstEmbedded(null)).toBeNull()
  })

  it('customerName prefers the guest when present, else the profile', () => {
    expect(customerName(null, guest)).toEqual({ name: 'Ana Pérez', isGuest: true })
    expect(customerName({ full_name: 'Turista' }, null)).toEqual({ name: 'Turista', isGuest: false })
    expect(customerName(null, null)).toEqual({ name: '—', isGuest: false })
  })

  it('billingSummary lists guest ID/contact and the payment', () => {
    expect(
      billingSummary(guest, { manual_payment_method: 'bank_transfer', manual_payment_reference: 'R1', paid_at: null }),
    ).toBe('CC 1002003000 · 3001234567 · ana@mail.com · Transferencia bancaria (R1)')
  })

  it('billingSummary returns null when there is nothing to show', () => {
    expect(billingSummary(null, { manual_payment_method: null, manual_payment_reference: null, paid_at: null })).toBeNull()
  })
})
