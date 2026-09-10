'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'

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

  return { admin: createAdminClient(), adminId: user.id }
}

type ActionResult = { error: string } | { success: true } | undefined

// Purely administrative — the admin has already collected the commission
// off-platform (WhatsApp/transferencia, same as the sale itself) and is
// just recording it. A direct update, not an RPC: this is the same level
// of trust as updateCommissionRate (src/app/(app)/admin/actions.ts), not a
// tourist/provider-facing money computation.
export async function markCommissionCollected(formData: FormData): Promise<ActionResult> {
  const { admin, adminId } = await getAuthenticatedAdmin()
  const copy = adminCopy.comisiones.pending.errors

  const commissionId = formData.get('commissionId') as string
  if (!UUID_RE.test(commissionId)) return { error: copy.notFound }

  const notesRaw = (formData.get('notes') as string | null)?.trim() || null

  const { data: updated, error } = await admin
    .from('provider_commissions')
    .update({ status: 'collected', collected_by: adminId, admin_notes: notesRaw })
    .eq('id', commissionId)
    .eq('status', 'pending')
    .select('id')

  if (error || !updated?.length) return { error: copy.generic }

  revalidatePath('/admin/comisiones/pendientes')
  return { success: true }
}
