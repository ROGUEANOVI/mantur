'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { sendRefundProcessedEmail, sendRefundRejectedEmail } from '@/lib/email/refundEmails'

type ActionResult = { error: string } | { success: true }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AdminClient = ReturnType<typeof createAdminClient>

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

  return { admin: createAdminClient(), adminId: user.id }
}

// Never trust a cached profiles.email column — resolves live from auth,
// same reasoning as rejectRoleRequest in admin/actions.ts.
async function getRequesterEmail(admin: AdminClient, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId)
  return data?.user?.email ?? null
}

export async function markRefundProcessedManually(formData: FormData): Promise<void> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const refundRequestId = formData.get('refundRequestId') as string
  if (!UUID_RE.test(refundRequestId)) redirect('/admin/reembolsos')

  const { data: applied } = await admin.rpc('mark_refund_request_processed', {
    p_refund_request_id: refundRequestId,
    p_method: 'manual',
    p_processed_by: adminId,
  })

  if (applied) {
    const { data: refund } = await admin
      .from('refund_requests')
      .select('refund_amount_cents, requested_by')
      .eq('id', refundRequestId)
      .single()

    if (refund) {
      const email = await getRequesterEmail(admin, refund.requested_by)
      if (email) await sendRefundProcessedEmail(email, refund.refund_amount_cents, 'manual')
    }
  }

  revalidatePath('/admin/reembolsos')
  revalidatePath('/mis-reservas')
}

export async function rejectRefundRequest(formData: FormData): Promise<void> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const refundRequestId = formData.get('refundRequestId') as string
  const reason = (formData.get('rejection_reason') as string | null)?.trim()
  if (!UUID_RE.test(refundRequestId) || !reason) redirect('/admin/reembolsos')

  const { data: updated } = await admin
    .from('refund_requests')
    .update({ status: 'rejected', admin_notes: reason, processed_by: adminId })
    .eq('id', refundRequestId)
    .in('status', ['pending', 'processing'])
    .select('requested_by')
    .single()

  if (updated) {
    const email = await getRequesterEmail(admin, updated.requested_by)
    if (email) await sendRefundRejectedEmail(email, reason)
  }

  revalidatePath('/admin/reembolsos')
  revalidatePath('/mis-reservas')
}

export async function updateRefundPolicyRate(formData: FormData): Promise<ActionResult> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const configId = formData.get('configId') as string
  if (!UUID_RE.test(configId)) return { error: adminCopy.reembolsos.errors.notFound }

  const raw = formData.get('rate') as string
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { error: adminCopy.reembolsos.errors.invalidRate }
  }

  const { data, error } = await admin
    .from('refund_policy_config')
    .update({ refund_percentage: parsed, updated_by: adminId })
    .eq('id', configId)
    .select('id')

  if (error || !data?.length) return { error: adminCopy.reembolsos.errors.generic }

  revalidatePath('/admin/reembolsos')
  return { success: true }
}
