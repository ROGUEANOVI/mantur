import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const alegraRequestMock = vi.fn()
vi.mock('./client', () => ({
  alegraRequest: (...args: unknown[]) => alegraRequestMock(...args),
}))

const { createCommissionInvoice, getInvoiceDianEvents, resolveDianInvoiceStatus } = await import('./invoices')

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ALEGRA_COMMISSION_ITEM_ID = '2'
  process.env.ALEGRA_IVA_TAX_ID = '4'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('createCommissionInvoice', () => {
  it('throws when ALEGRA_COMMISSION_ITEM_ID is not configured', async () => {
    delete process.env.ALEGRA_COMMISSION_ITEM_ID
    await expect(createCommissionInvoice({ contactId: '43', commissionAmountCents: 350000 })).rejects.toThrow(
      'ALEGRA_COMMISSION_ITEM_ID is not configured',
    )
    expect(alegraRequestMock).not.toHaveBeenCalled()
  })

  it('throws when ALEGRA_IVA_TAX_ID is not configured', async () => {
    delete process.env.ALEGRA_IVA_TAX_ID
    await expect(createCommissionInvoice({ contactId: '43', commissionAmountCents: 350000 })).rejects.toThrow(
      'ALEGRA_IVA_TAX_ID is not configured',
    )
    expect(alegraRequestMock).not.toHaveBeenCalled()
  })

  it('converts commissionAmountCents to decimal COP and attaches the 19% IVA tax by id (account is IVA-responsible)', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: { id: 99 } })

    await createCommissionInvoice({ contactId: '43', commissionAmountCents: 350000 })

    expect(alegraRequestMock).toHaveBeenCalledWith('/invoices', {
      method: 'POST',
      body: {
        date: expect.any(String),
        dueDate: expect.any(String),
        client: '43',
        items: [{ id: '2', price: 3500, quantity: 1, tax: [{ id: '4' }] }],
      },
    })
  })

  it('returns ok:true with the invoice id on success', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: { id: 99 } })
    const result = await createCommissionInvoice({ contactId: '43', commissionAmountCents: 350000 })
    expect(result).toEqual({ ok: true, invoiceId: '99' })
  })

  it('propagates a failure from the underlying request', async () => {
    alegraRequestMock.mockResolvedValue({ ok: false, error: 'Alegra API returned 422' })
    const result = await createCommissionInvoice({ contactId: '43', commissionAmountCents: 350000 })
    expect(result).toEqual({ ok: false, error: 'Alegra API returned 422' })
  })

  it('returns ok:false when the response is missing an id', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: {} })
    const result = await createCommissionInvoice({ contactId: '43', commissionAmountCents: 350000 })
    expect(result.ok).toBe(false)
  })
})

describe('getInvoiceDianEvents', () => {
  it('requests the invoice with fields=events', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: { events: [] } })
    await getInvoiceDianEvents('99')
    expect(alegraRequestMock).toHaveBeenCalledWith('/invoices/99?fields=events')
  })

  it('returns the parsed events on success', async () => {
    alegraRequestMock.mockResolvedValue({
      ok: true,
      data: { events: [{ type: 'ACKNOWLEDGMENT_DIAN', date: '2026-09-05' }, { type: 'ACCEPTED_DIAN' }] },
    })
    const result = await getInvoiceDianEvents('99')
    expect(result).toEqual({
      ok: true,
      events: [
        { type: 'ACKNOWLEDGMENT_DIAN', date: '2026-09-05' },
        { type: 'ACCEPTED_DIAN', date: undefined },
      ],
    })
  })

  it('defaults to an empty events array when the field is missing or malformed', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: {} })
    const result = await getInvoiceDianEvents('99')
    expect(result).toEqual({ ok: true, events: [] })
  })

  it('filters out malformed entries without a string type', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: { events: [{ type: 'ACCEPTED_DIAN' }, { date: '2026-09-05' }, null] } })
    const result = await getInvoiceDianEvents('99')
    expect(result).toEqual({ ok: true, events: [{ type: 'ACCEPTED_DIAN', date: undefined }] })
  })

  it('propagates a failure from the underlying request', async () => {
    alegraRequestMock.mockResolvedValue({ ok: false, error: 'Alegra API returned 404' })
    const result = await getInvoiceDianEvents('99')
    expect(result).toEqual({ ok: false, error: 'Alegra API returned 404' })
  })
})

describe('resolveDianInvoiceStatus', () => {
  it('returns emitted when an ACCEPTED_DIAN event is present', () => {
    expect(resolveDianInvoiceStatus([{ type: 'ACKNOWLEDGMENT_DIAN' }, { type: 'ACCEPTED_DIAN' }])).toBe('emitted')
  })

  it('returns rejected when a REJECTED_DIAN event is present', () => {
    expect(resolveDianInvoiceStatus([{ type: 'REJECTED_DIAN' }])).toBe('rejected')
  })

  it('prefers emitted when both terminal events are somehow present', () => {
    expect(resolveDianInvoiceStatus([{ type: 'REJECTED_DIAN' }, { type: 'ACCEPTED_DIAN' }])).toBe('emitted')
  })

  it('returns null when only non-terminal events are present', () => {
    expect(resolveDianInvoiceStatus([{ type: 'ACKNOWLEDGMENT_DIAN' }])).toBeNull()
  })

  it('returns null when there are no events at all', () => {
    expect(resolveDianInvoiceStatus([])).toBeNull()
  })
})
