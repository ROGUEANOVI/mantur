import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const alegraRequestMock = vi.fn()
vi.mock('./client', () => ({
  alegraRequest: (...args: unknown[]) => alegraRequestMock(...args),
}))

const { createInvoiceCreditNote } = await import('./creditNotes')

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ALEGRA_COMMISSION_ITEM_ID = '2'
  process.env.ALEGRA_IVA_TAX_ID = '4'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('createInvoiceCreditNote', () => {
  it('throws when ALEGRA_COMMISSION_ITEM_ID is not configured', async () => {
    delete process.env.ALEGRA_COMMISSION_ITEM_ID
    await expect(createInvoiceCreditNote({ invoiceId: '99', amountCents: 50000 })).rejects.toThrow(
      'ALEGRA_COMMISSION_ITEM_ID is not configured',
    )
    expect(alegraRequestMock).not.toHaveBeenCalled()
  })

  it('throws when ALEGRA_IVA_TAX_ID is not configured', async () => {
    delete process.env.ALEGRA_IVA_TAX_ID
    await expect(createInvoiceCreditNote({ invoiceId: '99', amountCents: 50000 })).rejects.toThrow(
      'ALEGRA_IVA_TAX_ID is not configured',
    )
    expect(alegraRequestMock).not.toHaveBeenCalled()
  })

  it('references the original invoice and converts amountCents to decimal COP', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: { id: 55 } })

    await createInvoiceCreditNote({ invoiceId: '99', amountCents: 175000 })

    expect(alegraRequestMock).toHaveBeenCalledWith('/credit-notes', {
      method: 'POST',
      body: {
        date: expect.any(String),
        invoice: { id: '99' },
        items: [{ id: '2', price: 1750, quantity: 1, tax: [{ id: '4' }] }],
      },
    })
  })

  it('returns ok:true with the credit note id on success', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: { id: 55 } })
    const result = await createInvoiceCreditNote({ invoiceId: '99', amountCents: 175000 })
    expect(result).toEqual({ ok: true, creditNoteId: '55' })
  })

  it('propagates a failure from the underlying request', async () => {
    alegraRequestMock.mockResolvedValue({ ok: false, error: 'Alegra API returned 422' })
    const result = await createInvoiceCreditNote({ invoiceId: '99', amountCents: 175000 })
    expect(result).toEqual({ ok: false, error: 'Alegra API returned 422' })
  })

  it('returns ok:false when the response is missing an id', async () => {
    alegraRequestMock.mockResolvedValue({ ok: true, data: {} })
    const result = await createInvoiceCreditNote({ invoiceId: '99', amountCents: 175000 })
    expect(result.ok).toBe(false)
  })
})
