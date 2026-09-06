import type { createAdminClient } from '@/lib/supabase/admin'
import { createInvoiceCreditNote } from './creditNotes'

type AdminClient = ReturnType<typeof createAdminClient>

type ClaimedCreditNote = { alegra_invoice_id: string; credit_amount_cents: number }

// Claims a processed refund for a credit-note attempt (via
// claim_refund_request_for_credit_note — see the RPC's own comment for the
// eligibility rules: must be 'processed', not yet attempted, and its
// transaction must actually have an alegra_invoice_id) and, only if
// eligible, calls Alegra and records the result. Deliberately never throws
// and never affects the caller's own success path, same posture as
// syncAlegraInvoice() in the Wompi webhook — a credit-note failure here is
// a ledger entry for admin follow-up (refund_requests.alegra_credit_note_status
// = 'failed'), not a reason to fail whatever refund flow triggered it.
export async function syncAlegraCreditNoteForRefund(admin: AdminClient, refundRequestId: string): Promise<void> {
  try {
    // maybeSingle(), not single(): 0 rows is the expected, routine shape for
    // "ineligible/already claimed/not_applicable" (see below) — single()
    // would surface that as a PGRST116 error via PostgREST, burying genuine
    // RPC failures in noise from completely normal refunds. (The sibling
    // provider_payouts claim call has this same single()-vs-0-rows mismatch
    // pre-existing elsewhere in the codebase — out of scope here, flagged
    // as a separate follow-up.)
    const { data: claimed, error: claimError } = await admin
      .rpc('claim_refund_request_for_credit_note', { p_refund_request_id: refundRequestId })
      .maybeSingle<ClaimedCreditNote>()

    if (claimError) {
      console.error('Failed to claim a refund for an Alegra credit note', claimError)
      return
    }
    // No row: ineligible (not processed yet), already attempted, never
    // invoiced, or a 0-cent (not_applicable) refund — the RPC itself already
    // recorded whichever of those applies. Nothing left to do here.
    if (!claimed) return

    const result = await createInvoiceCreditNote({
      invoiceId: claimed.alegra_invoice_id,
      amountCents: claimed.credit_amount_cents,
    })

    if (result.ok) {
      await admin.rpc('mark_refund_request_credit_note_result', {
        p_refund_request_id: refundRequestId,
        p_status: 'issued',
        p_alegra_credit_note_id: result.creditNoteId,
      })
    } else {
      console.error('Failed to create an Alegra credit note for a refund', result.error)
      await admin.rpc('mark_refund_request_credit_note_result', {
        p_refund_request_id: refundRequestId,
        p_status: 'failed',
      })
    }
  } catch (error) {
    console.error('Unexpected error while syncing an Alegra credit note for a refund', error)
  }
}
