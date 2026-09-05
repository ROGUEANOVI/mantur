'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { getInvoiceDianEvents, resolveDianInvoiceStatus } from '@/lib/alegra/invoices'

type ActionResult = { error: string } | { success: true; message: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthenticatedAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return { admin: createAdminClient() }
}

// Single-click, no automatic retry — consistent with the rest of this
// integration's Alegra calls (createCommissionInvoice has none either):
// a failure is left visible for a human to notice and try again, rather
// than the app guessing at a backoff schedule for a low-volume manual-ops
// business. Read-only against DIAN state (GET /invoices/{id}?fields=events),
// so there's no double-fire/idempotency concern like a payout or credit note
// would have — a plain conditional UPDATE below is proportionate.
export async function checkInvoiceDianStatus(formData: FormData): Promise<ActionResult> {
  const { admin } = await getAuthenticatedAdmin()
  const copy = adminCopy.facturas

  const transactionId = formData.get('transactionId') as string
  if (!UUID_RE.test(transactionId)) return { error: copy.errors.notFound }

  const { data: transaction } = await admin
    .from('transactions')
    .select('alegra_invoice_id')
    .eq('id', transactionId)
    .single()

  if (!transaction?.alegra_invoice_id) return { error: copy.errors.notFound }

  const result = await getInvoiceDianEvents(transaction.alegra_invoice_id)
  if (!result.ok) {
    console.error('Failed to fetch Alegra DIAN events', result.error)
    return { error: copy.errors.generic }
  }

  // Evidence trail for correcting resolveDianInvoiceStatus()'s unconfirmed
  // rejection-event guess against the first real one — event types/dates
  // only, never invoice line items or contact data.
  console.info('Alegra DIAN events checked', { transactionId, events: result.events })

  const resolved = resolveDianInvoiceStatus(result.events)
  if (!resolved) {
    return { success: true, message: copy.stillPending }
  }

  await admin.from('transactions').update({ alegra_invoice_status: resolved }).eq('id', transactionId)

  revalidatePath('/admin/facturas')
  return { success: true, message: copy.updated }
}
