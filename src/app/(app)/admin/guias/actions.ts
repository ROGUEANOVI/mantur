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

// Revokes the tourist_guide role and hides the guide from /guias. Distinct
// from the guide's own availability toggle (mi-perfil-guia): reverting the
// role also locks them out of their own panel (its guard checks
// profile.role === 'tourist_guide'), so a suspended guide can't just flip
// themselves back available.
export async function deactivateGuide(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const guideId = formData.get('guideId') as string | null
  const profileId = formData.get('profileId') as string | null
  if (!guideId || !profileId) return

  await admin.from('tourist_guides').update({ is_available: false }).eq('id', guideId)
  await admin.from('profiles').update({ role: 'tourist' }).eq('id', profileId)

  revalidatePath('/admin/guias')
  revalidatePath('/guias')
}

export async function activateGuide(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const profileId = formData.get('profileId') as string | null
  if (!profileId) return

  await admin.from('profiles').update({ role: 'tourist_guide' }).eq('id', profileId)

  revalidatePath('/admin/guias')
  revalidatePath('/guias')
}

export async function deleteGuide(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const guideId = formData.get('guideId') as string | null
  const profileId = formData.get('profileId') as string | null
  if (!guideId || !profileId) return

  // Blocked when the guide has bookings (bookings.guide_id is
  // ON DELETE RESTRICT) — send the admin back with a message instead of
  // silently doing nothing.
  const { error } = await admin.from('tourist_guides').delete().eq('id', guideId)
  if (error) redirect('/admin/guias?error=has_bookings')

  await admin.from('profiles').update({ role: 'tourist' }).eq('id', profileId)

  revalidatePath('/admin/guias')
  revalidatePath('/guias')
  redirect('/admin/guias')
}
