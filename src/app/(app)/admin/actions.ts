'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'

type ActionResult = { error: string } | { success: true }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export async function approveBusiness(formData: FormData): Promise<void> {
  const { admin } = await getAuthenticatedAdmin()

  const businessId = formData.get('businessId') as string
  if (!UUID_RE.test(businessId)) redirect('/admin/negocios')

  const { data, error } = await admin
    .from('businesses')
    .update({ status: 'active', verified: true })
    .eq('id', businessId)
    .select('id')

  if (error || !data?.length) redirect('/admin/negocios')

  revalidatePath('/admin/negocios')
  revalidatePath('/negocios')
}

export async function rejectBusiness(formData: FormData): Promise<void> {
  const { admin } = await getAuthenticatedAdmin()

  const businessId = formData.get('businessId') as string
  if (!UUID_RE.test(businessId)) redirect('/admin/negocios')

  const { data, error } = await admin
    .from('businesses')
    .update({ status: 'rejected', verified: false })
    .eq('id', businessId)
    .select('id')

  if (error || !data?.length) redirect('/admin/negocios')

  revalidatePath('/admin/negocios')
}

export async function updateCommissionRate(
  formData: FormData,
): Promise<ActionResult> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const configId = formData.get('configId') as string
  if (!UUID_RE.test(configId))
    return { error: adminCopy.comisiones.errors.notFound }

  const raw = formData.get('rate') as string
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { error: adminCopy.comisiones.errors.invalidRate }
  }

  const { data, error } = await admin
    .from('commission_config')
    .update({ rate: parsed, updated_by: adminId })
    .eq('id', configId)
    .select('id')

  if (error || !data?.length)
    return { error: adminCopy.comisiones.errors.generic }

  revalidatePath('/admin/comisiones')
  return { success: true }
}
