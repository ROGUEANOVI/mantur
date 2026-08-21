'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getAuthenticatedAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/')
  return createAdminClient()
}

// Revokes the transporter role and hides the driver from /transportistas.
// Distinct from the driver's own availability toggle (mi-perfil-transporte):
// reverting the role also locks them out of their own panel (its guard checks
// profile.role === 'transporter'), so a suspended driver can't just flip
// themselves back available.
export async function deactivateTransporter(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const transporterId = formData.get('transporterId') as string | null
  const profileId = formData.get('profileId') as string | null
  if (!transporterId || !profileId) return

  await admin.from('transporters').update({ is_available: false }).eq('id', transporterId)
  await admin.from('profiles').update({ role: 'tourist' }).eq('id', profileId)

  revalidatePath('/admin/transportistas')
  revalidatePath('/transportistas')
}

export async function activateTransporter(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const profileId = formData.get('profileId') as string | null
  if (!profileId) return

  await admin.from('profiles').update({ role: 'transporter' }).eq('id', profileId)

  revalidatePath('/admin/transportistas')
  revalidatePath('/transportistas')
}

export async function deleteTransporter(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const transporterId = formData.get('transporterId') as string | null
  const profileId = formData.get('profileId') as string | null
  if (!transporterId || !profileId) return

  // Blocked when the driver has ride history (transport_requests.transporter_id
  // is ON DELETE RESTRICT) — send the admin back with a message instead of
  // silently doing nothing.
  const { error } = await admin.from('transporters').delete().eq('id', transporterId)
  if (error) redirect('/admin/transportistas?error=has_requests')

  await admin.from('profiles').update({ role: 'tourist' }).eq('id', profileId)

  revalidatePath('/admin/transportistas')
  revalidatePath('/transportistas')
  redirect('/admin/transportistas')
}
