import { alegraRequest } from './client'

// Invoices ManTur's intermediation COMMISSION, not the gross booking amount
// — the underlying accommodation/tour/transport is provided by an
// independent business/guide/transporter, not by ManTur itself, so the
// commission is the only value ManTur actually earned and the correct
// taxable base (confirmed against DIAN doctrine on travel-agency
// intermediation commissions — see docs/wompi-alegra-integration-plan.md §6).
//
// No `tax` field on the line item: MANTUR TURISMO S.A.S.'s own Alegra
// company configuration is "No responsable de IVA" (Configuración →
// Configurar empresa → Responsabilidad tributaria) — confirmed live against
// the real account, which rejects an IVA-family tax (even "IVA Excluido" at
// 0%) with "No puedes usar impuestos IVA" for a non-IVA-responsible account.
// ALEGRA_COMMISSION_ITEM_ID must reference an item created with tax
// "Ninguno (0%)" to match.
function requireCommissionItemId(): string {
  const value = process.env.ALEGRA_COMMISSION_ITEM_ID
  if (!value) throw new Error('ALEGRA_COMMISSION_ITEM_ID is not configured')
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
  const date = todayIsoDate()

  // Alegra's price fields are decimal COP (e.g. 35000.00), not integer
  // cents like Wompi's API — convert once, here, at the API boundary.
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
