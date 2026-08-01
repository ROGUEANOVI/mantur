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

export async function forceDeactivateBusiness(formData: FormData): Promise<void> {
  const { admin } = await getAuthenticatedAdmin()

  const businessId = formData.get('businessId') as string
  if (!UUID_RE.test(businessId)) redirect('/admin/negocios')

  await admin
    .from('businesses')
    .update({ status: 'inactive' })
    .eq('id', businessId)

  revalidatePath('/admin/negocios')
  revalidatePath('/negocios')
}

export async function forceActivateBusiness(formData: FormData): Promise<void> {
  const { admin } = await getAuthenticatedAdmin()

  const businessId = formData.get('businessId') as string
  if (!UUID_RE.test(businessId)) redirect('/admin/negocios')

  await admin
    .from('businesses')
    .update({ status: 'active', verified: true })
    .eq('id', businessId)

  revalidatePath('/admin/negocios')
  revalidatePath('/negocios')
}

export async function toggleFeaturedBusiness(formData: FormData): Promise<void> {
  const { admin } = await getAuthenticatedAdmin()

  const businessId = formData.get('businessId') as string
  if (!UUID_RE.test(businessId)) redirect('/admin/negocios')

  const featured = formData.get('featured') === 'true'

  await admin
    .from('businesses')
    .update({ is_featured: featured })
    .eq('id', businessId)

  revalidatePath('/admin/negocios')
  revalidatePath('/')
}

const BUSINESS_TYPES = ['resort', 'restaurant', 'farm', 'eatery', 'other'] as const

export async function createBusinessAsAdmin(
  formData: FormData,
): Promise<ActionResult> {
  const { admin } = await getAuthenticatedAdmin()

  const name = (formData.get('name') as string).trim()
  if (!name) return { error: adminCopy.negocios.form.errors.nameRequired }

  const type = formData.get('type') as string
  if (!BUSINESS_TYPES.includes(type as (typeof BUSINESS_TYPES)[number]))
    return { error: adminCopy.negocios.form.errors.typeRequired }

  const ownerId = formData.get('ownerId') as string
  if (!UUID_RE.test(ownerId))
    return { error: adminCopy.negocios.form.errors.ownerRequired }

  const description = (formData.get('description') as string).trim() || null
  const address = (formData.get('address') as string).trim() || null
  const phone = (formData.get('phone') as string).trim() || null

  const { error } = await admin.from('businesses').insert({
    name,
    type,
    description,
    address,
    phone,
    owner_id: ownerId,
    status: 'active',
    verified: true,
  })

  if (error) return { error: adminCopy.negocios.form.errors.generic }

  revalidatePath('/admin/negocios')
  revalidatePath('/negocios')
  return { success: true }
}

const PLACE_TYPES = ['waterfall', 'river', 'viewpoint', 'plaza', 'park', 'other'] as const

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
  redirect('/admin/lugares')
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
  redirect('/admin/lugares')
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

// ── Place image actions ──────────────────────────────────────────────────────

const PLACE_BUCKET = 'place-images'
const MAX_PLACE_IMAGES = 5

function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

function validateImageFile(file: File | null): string | null {
  if (!file || !file.size) return 'Selecciona una imagen.'
  const valid = ['image/jpeg', 'image/png', 'image/webp']
  if (!valid.includes(file.type)) return 'Formato no válido. Usa JPEG, PNG o WebP.'
  if (file.size > 5 * 1024 * 1024) return 'La imagen no puede superar 5 MB.'
  return null
}

export async function uploadPlaceImage(
  placeId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(placeId)) return { error: 'Lugar no encontrado.' }
  const { admin } = await getAuthenticatedAdmin()

  const { data: place } = await admin
    .from('places')
    .select('id, images')
    .eq('id', placeId)
    .maybeSingle()

  if (!place) return { error: 'Lugar no encontrado.' }

  const currentImages: string[] = place.images ?? []
  if (currentImages.length >= MAX_PLACE_IMAGES) {
    return { error: `Máximo ${MAX_PLACE_IMAGES} fotos por lugar.` }
  }

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const path = `places/${placeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

  const { error: uploadError } = await admin.storage
    .from(PLACE_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })

  if (uploadError) return { error: 'No se pudo subir la imagen. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(PLACE_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('places')
    .update({ images: [...currentImages, publicUrl] })
    .eq('id', placeId)

  if (updateError) {
    await admin.storage.from(PLACE_BUCKET).remove([path])
    return { error: 'No se pudo guardar la imagen.' }
  }

  revalidatePath('/admin/lugares')
  revalidatePath('/lugares')
  revalidatePath('/')
}

export async function deletePlaceImage(
  placeId: string,
  imageUrl: string,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(placeId)) return { error: 'Lugar no encontrado.' }
  const { admin } = await getAuthenticatedAdmin()

  const { data: place } = await admin
    .from('places')
    .select('id, images')
    .eq('id', placeId)
    .maybeSingle()

  if (!place) return { error: 'Lugar no encontrado.' }

  const storagePath = extractStoragePath(imageUrl, PLACE_BUCKET)
  if (storagePath) {
    await admin.storage.from(PLACE_BUCKET).remove([storagePath])
  }

  const newImages = (place.images ?? []).filter((u: string) => u !== imageUrl)
  await admin.from('places').update({ images: newImages }).eq('id', placeId)

  revalidatePath('/admin/lugares')
  revalidatePath('/lugares')
  revalidatePath('/')
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
