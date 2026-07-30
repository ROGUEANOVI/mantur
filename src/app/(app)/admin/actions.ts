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

const PLACE_TYPES = ['waterfall', 'river', 'viewpoint', 'beach', 'park', 'other'] as const

export async function createPlace(formData: FormData): Promise<ActionResult> {
  const { admin } = await getAuthenticatedAdmin()

  const name = (formData.get('name') as string).trim()
  if (!name) return { error: adminCopy.lugares.errors.nameRequired }

  const type = formData.get('type') as string
  if (!PLACE_TYPES.includes(type as (typeof PLACE_TYPES)[number]))
    return { error: adminCopy.lugares.errors.typeRequired }

  const description = (formData.get('description') as string).trim() || null
  const rawLat = formData.get('lat') as string
  const rawLng = formData.get('lng') as string
  const lat = rawLat ? Number(rawLat) : null
  const lng = rawLng ? Number(rawLng) : null

  if ((rawLat && !Number.isFinite(lat)) || (rawLng && !Number.isFinite(lng))) {
    return { error: adminCopy.lugares.errors.invalidCoords }
  }

  const { error } = await admin
    .from('places')
    .insert({ name, description, type, lat, lng })

  if (error) return { error: adminCopy.lugares.errors.generic }

  revalidatePath('/admin/lugares')
  revalidatePath('/lugares')
  return { success: true }
}

export async function updatePlace(formData: FormData): Promise<ActionResult> {
  const { admin } = await getAuthenticatedAdmin()

  const placeId = formData.get('placeId') as string
  if (!UUID_RE.test(placeId)) return { error: adminCopy.lugares.errors.notFound }

  const name = (formData.get('name') as string).trim()
  if (!name) return { error: adminCopy.lugares.errors.nameRequired }

  const type = formData.get('type') as string
  if (!PLACE_TYPES.includes(type as (typeof PLACE_TYPES)[number]))
    return { error: adminCopy.lugares.errors.typeRequired }

  const description = (formData.get('description') as string).trim() || null
  const rawLat = formData.get('lat') as string
  const rawLng = formData.get('lng') as string
  const lat = rawLat ? Number(rawLat) : null
  const lng = rawLng ? Number(rawLng) : null

  if ((rawLat && !Number.isFinite(lat)) || (rawLng && !Number.isFinite(lng))) {
    return { error: adminCopy.lugares.errors.invalidCoords }
  }

  const { data, error } = await admin
    .from('places')
    .update({ name, description, type, lat, lng })
    .eq('id', placeId)
    .select('id')

  if (error || !data?.length) return { error: adminCopy.lugares.errors.generic }

  revalidatePath('/admin/lugares')
  revalidatePath('/lugares')
  return { success: true }
}

export async function deletePlace(formData: FormData): Promise<void> {
  const { admin } = await getAuthenticatedAdmin()

  const placeId = formData.get('placeId') as string
  if (!UUID_RE.test(placeId)) redirect('/admin/lugares')

  await admin.from('places').delete().eq('id', placeId)

  revalidatePath('/admin/lugares')
  revalidatePath('/lugares')
  redirect('/admin/lugares')
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
