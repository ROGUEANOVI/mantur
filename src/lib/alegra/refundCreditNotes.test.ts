import { describe, it, expect, vi, beforeEach } from 'vitest'

const createInvoiceCreditNoteMock = vi.fn()
vi.mock('./creditNotes', () => ({
  createInvoiceCreditNote: (...args: unknown[]) => createInvoiceCreditNoteMock(...args),
}))

const { syncAlegraCreditNoteForRefund } = await import('./refundCreditNotes')

function makeRpc(result: { data: unknown; error: unknown }) {
  return { maybeSingle: () => Promise.resolve(result) }
}

function makeAdmin() {
  const rpc = vi.fn()
  return { admin: { rpc } as unknown as Parameters<typeof syncAlegraCreditNoteForRefund>[0], rpc }
}

const REFUND_ID = '55555555-5555-5555-5555-555555555555'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('syncAlegraCreditNoteForRefund', () => {
  it('does nothing when the claim RPC errors', async () => {
    const { admin, rpc } = makeAdmin()
    rpc.mockReturnValueOnce(makeRpc({ data: null, error: { message: 'db error' } }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await syncAlegraCreditNoteForRefund(admin, REFUND_ID)

    expect(createInvoiceCreditNoteMock).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('does nothing when the claim returns no row (ineligible, already attempted, never invoiced, or not_applicable)', async () => {
    const { admin, rpc } = makeAdmin()
    rpc.mockReturnValueOnce(makeRpc({ data: null, error: null }))

    await syncAlegraCreditNoteForRefund(admin, REFUND_ID)

    expect(createInvoiceCreditNoteMock).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('calls Alegra with exactly the claimed invoice id and amount, then marks issued', async () => {
    const { admin, rpc } = makeAdmin()
    rpc.mockReturnValueOnce(makeRpc({ data: { alegra_invoice_id: 'inv-1', credit_amount_cents: 5000 }, error: null }))
    createInvoiceCreditNoteMock.mockResolvedValue({ ok: true, creditNoteId: 'cn-1' })

    await syncAlegraCreditNoteForRefund(admin, REFUND_ID)

    expect(createInvoiceCreditNoteMock).toHaveBeenCalledWith({ invoiceId: 'inv-1', amountCents: 5000 })
    expect(rpc).toHaveBeenCalledWith('mark_refund_request_credit_note_result', {
      p_refund_request_id: REFUND_ID,
      p_status: 'issued',
      p_alegra_credit_note_id: 'cn-1',
    })
  })

  it('marks failed when the Alegra call fails, without throwing', async () => {
    const { admin, rpc } = makeAdmin()
    rpc.mockReturnValueOnce(makeRpc({ data: { alegra_invoice_id: 'inv-1', credit_amount_cents: 5000 }, error: null }))
    createInvoiceCreditNoteMock.mockResolvedValue({ ok: false, error: 'Alegra API returned 422' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await syncAlegraCreditNoteForRefund(admin, REFUND_ID)

    expect(rpc).toHaveBeenCalledWith('mark_refund_request_credit_note_result', {
      p_refund_request_id: REFUND_ID,
      p_status: 'failed',
    })
    errorSpy.mockRestore()
  })

  it('never throws when an unexpected error occurs', async () => {
    const { admin, rpc } = makeAdmin()
    rpc.mockImplementationOnce(() => {
      throw new Error('unexpected')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(syncAlegraCreditNoteForRefund(admin, REFUND_ID)).resolves.toBeUndefined()

    errorSpy.mockRestore()
  })
})
