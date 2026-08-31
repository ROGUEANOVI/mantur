import { alegraRequest } from './client'

// Invoices ManTur's intermediation COMMISSION, not the gross booking amount
// — the underlying accommodation/tour/transport is provided by an
// independent business/guide/transporter, not by ManTur itself, so the
// commission is the only value ManTur actually earned and the correct
// taxable base (confirmed against DIAN doctrine on travel-agency
// intermediation commissions — see docs/wompi-alegra-integration-plan.md §6).
//
// 19% IVA is charged on the commission: MANTUR TURISMO S.A.S. added
// responsibility code 48 (Impuesto sobre las ventas - IVA) to its RUT on
// 2026-08-30 and its Alegra company configuration was updated to "Responsable
// de IVA" to match (Configuración → Configurar empresa → Responsabilidad
// tributaria) — until then Alegra's API rejected any IVA-family tax (even
// "IVA Excluido" at 0%) with "No puedes usar impuestos IVA" for a
// non-IVA-responsible account, which is why an earlier version of this file
// sent no tax at all. ALEGRA_COMMISSION_ITEM_ID must reference an item
// configured with a 19% IVA tax to match, and ALEGRA_IVA_TAX_ID is that same
// tax's id (Configuración → Impuestos in Alegra) so the invoice line item
// references it explicitly rather than relying on the item's own default.
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

export type CreateCommissionInvoiceResult = { ok: true; invoiceId: string } | { ok: false; error: string }

export async function createCommissionInvoice(params: {
  contactId: string
  commissionAmountCents: number
}): Promise<CreateCommissionInvoiceResult> {
  const itemId = requireCommissionItemId()
  const taxId = requireIvaTaxId()
  const date = todayIsoDate()

  // Alegra's price fields are decimal COP (e.g. 35000.00), not integer
  // cents like Wompi's API — convert once, here, at the API boundary. This
  // is the pre-tax commission amount; Alegra computes and adds the 19% IVA
  // itself from the referenced tax id, same as it does in the item editor.
  const commissionAmount = params.commissionAmountCents / 100

  const result = await alegraRequest<{ id: string | number }>('/invoices', {
    method: 'POST',
    body: {
      date,
      dueDate: date,
      client: params.contactId,
      items: [
        {
          id: itemId,
          price: commissionAmount,
          quantity: 1,
          tax: [{ id: taxId }],
        },
      ],
    },
  })

  if (!result.ok) return result
  if (!result.data?.id) {
    return { ok: false, error: `Alegra invoice response missing an id: ${JSON.stringify(result.data)}` }
  }

  return { ok: true, invoiceId: String(result.data.id) }
}
