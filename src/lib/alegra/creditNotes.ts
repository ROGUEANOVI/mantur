import { alegraRequest } from './client'

function requireCommissionItemId(): string {
  const value = process.env.ALEGRA_COMMISSION_ITEM_ID
  if (!value) throw new Error('ALEGRA_COMMISSION_ITEM_ID is not configured')
  return value
}

function requireIvaTaxId(): string {
  const value = process.env.ALEGRA_IVA_TAX_ID
  if (!value) throw new Error('ALEGRA_IVA_TAX_ID is not configured')
  return value
}

function todayIsoDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

export type CreateCreditNoteResult = { ok: true; creditNoteId: string } | { ok: false; error: string }

// Credits part or all of a previously-issued commission invoice
// (createCommissionInvoice) when a refund is processed. Same item/tax id
// and cents-to-decimal conversion as the original invoice — the credit note
// must use the exact same commission item so it nets against the right
// income line in Alegra's own reporting. The exact field name for
// referencing the original invoice on a credit note (`invoice: {id}` below)
// is NOT verified against a real Alegra API response (no ALEGRA_TOKEN was
// available while writing this) — confirm/correct on the first real refund
// that reaches this call, same posture already used for
// findOrCreateContact()'s `regime` field.
export async function createInvoiceCreditNote(params: {
  invoiceId: string
  amountCents: number
}): Promise<CreateCreditNoteResult> {
  const itemId = requireCommissionItemId()
  const taxId = requireIvaTaxId()
  const date = todayIsoDate()

  const amount = params.amountCents / 100

  const result = await alegraRequest<{ id: string | number }>('/credit-notes', {
    method: 'POST',
    body: {
      date,
      invoice: { id: params.invoiceId },
      items: [
        {
          id: itemId,
          price: amount,
          quantity: 1,
          tax: [{ id: taxId }],
        },
      ],
    },
  })

  if (!result.ok) return result
  if (!result.data?.id) {
    return { ok: false, error: `Alegra credit note response missing an id: ${JSON.stringify(result.data)}` }
  }

  return { ok: true, creditNoteId: String(result.data.id) }
}
