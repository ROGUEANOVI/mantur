'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionResult = { error: string } | void

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePrice(raw: string): number | null {
  const price = parseFloat(raw)
  // isNaN catches NaN; Number.isFinite rejects Infinity/-Infinity
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return null
  return price
}

function parsePositiveInt(raw: string | null): number | null | false {
  if (!raw) return null
  const n = parseInt(raw, 10)
  if (isNaN(n) || n <= 0) return false
  return n
}

async function getAuthenticatedOwner() {
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

  if (profile?.role !== 'business_owner') redirect('/')

  return { supabase, userId: user.id }
}

export async function createBusiness(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedOwner()

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const type = formData.get('type') as string
  const address = (formData.get('address') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() || null

  const validTypes = ['resort', 'restaurant', 'farm', 'eatery', 'other']
  if (!name || !validTypes.includes(type)) {
    return { error: 'Datos inválidos. Verifica el nombre y el tipo de negocio.' }
  }

  const { error } = await supabase.from('businesses').insert({
    owner_id: userId,
    name,
    description,
    type,
    address,
    phone,
    verified: false,
    status: 'pending',
  })

  if (error) return { error: 'No se pudo crear el negocio. Intenta de nuevo.' }

  revalidatePath('/mi-negocio')
  redirect('/mi-negocio')
}

export async function updateBusiness(
  businessId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }

  const { supabase, userId } = await getAuthenticatedOwner()

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const type = formData.get('type') as string
  const address = (formData.get('address') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() || null

  const validTypes = ['resort', 'restaurant', 'farm', 'eatery', 'other']
  if (!name || !validTypes.includes(type)) {
    return { error: 'Datos inválidos. Verifica el nombre y el tipo de negocio.' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ name, description, type, address, phone })
    .eq('id', businessId)
    .eq('owner_id', userId)

  if (error) return { error: 'No se pudo actualizar el negocio. Intenta de nuevo.' }

  revalidatePath('/mi-negocio', 'layout')
  redirect(`/mi-negocio/${businessId}`)
}

export async function deactivateBusiness(businessId: string, _formData: FormData): Promise<void> {
  if (!UUID_RE.test(businessId)) return

  const { supabase, userId } = await getAuthenticatedOwner()

  const { error } = await supabase
    .from('businesses')
    .update({ status: 'inactive' })
    .eq('id', businessId)
    .eq('owner_id', userId)

  if (error) return

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath('/negocios')
  redirect('/mi-negocio')
}

export async function reactivateBusiness(businessId: string, _formData: FormData): Promise<void> {
  if (!UUID_RE.test(businessId)) return

  // Verify ownership with the user client before escalating to admin.
  const { supabase, userId } = await getAuthenticatedOwner()
  const { data: owned } = await supabase
    .from('businesses')
    .select('id, verified')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .eq('status', 'inactive')
    .maybeSingle()

  if (!owned) return

  // Verified businesses restore directly to active — no re-approval needed.
  // Unverified ones go back to pending for admin review.
  // RLS only allows owners to set status='inactive', so we use the admin
  // client here after verifying ownership above.
  const targetStatus = owned.verified ? 'active' : 'pending'
  const admin = createAdminClient()
  const { error } = await admin
    .from('businesses')
    .update({ status: targetStatus })
    .eq('id', businessId)

  if (error) return

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath('/negocios')
  redirect(`/mi-negocio/${businessId}`)
}

export async function createExperience(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedOwner()

  const businessId = formData.get('business_id') as string
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }

  // Verify the business belongs to this owner before inserting
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .single()

  if (!business) return { error: 'Negocio no encontrado.' }

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null

  // Price is parsed and validated server-side — never trust the raw client value.
  // parsePrice rejects NaN, Infinity, negatives, and unreasonable amounts.
  const price = parsePrice(formData.get('price') as string)
  if (!name || price === null) {
    return { error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' }
  }

  const capacity = parsePositiveInt(formData.get('capacity') as string | null)
  if (capacity === false) return { error: 'El cupo debe ser un número positivo.' }

  const duration_minutes = parsePositiveInt(formData.get('duration_minutes') as string | null)
  if (duration_minutes === false) return { error: 'La duración debe ser un número positivo.' }

  const { error } = await supabase.from('experiences').insert({
    business_id: businessId,
    name,
    description,
    price,
    capacity,
    duration_minutes,
    status: 'active',
  })

  if (error) return { error: 'No se pudo crear la experiencia. Intenta de nuevo.' }

  revalidatePath('/mi-negocio', 'layout')
  redirect(`/mi-negocio/${businessId}/experiencias`)
}

export async function updateExperience(
  experienceId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(experienceId)) return { error: 'Experiencia no encontrada.' }

  const { supabase } = await getAuthenticatedOwner()

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null

  const price = parsePrice(formData.get('price') as string)
  if (!name || price === null) {
    return { error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' }
  }

  const capacity = parsePositiveInt(formData.get('capacity') as string | null)
  if (capacity === false) return { error: 'El cupo debe ser un número positivo.' }

  const duration_minutes = parsePositiveInt(formData.get('duration_minutes') as string | null)
  if (duration_minutes === false) return { error: 'La duración debe ser un número positivo.' }

  // RLS UPDATE policy verifies ownership via the businesses table.
  // .select('id') forces PostgREST to return the modified row so we can
  // detect a silent RLS block (0 rows updated) vs a real error.
  const { data, error } = await supabase
    .from('experiences')
    .update({ name, description, price, capacity, duration_minutes })
    .eq('id', experienceId)
    .select('id')

  if (error || !data?.length) {
    return { error: 'No se pudo actualizar la experiencia. Intenta de nuevo.' }
  }

  revalidatePath('/mi-negocio', 'layout')
}

export async function toggleExperienceStatus(
  experienceId: string,
  currentStatus: 'active' | 'inactive',
): Promise<ActionResult> {
  if (!UUID_RE.test(experienceId)) return { error: 'Experiencia no encontrada.' }

  const { supabase } = await getAuthenticatedOwner()

  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'

  // .select('id') detects silent RLS blocks (0 rows updated)
  const { data, error } = await supabase
    .from('experiences')
    .update({ status: newStatus })
    .eq('id', experienceId)
    .select('id')

  if (error || !data?.length) {
    return { error: 'No se pudo actualizar el estado. Intenta de nuevo.' }
  }

  revalidatePath('/mi-negocio', 'layout')
}

// ── Image helpers ────────────────────────────────────────────────────────────

const BUSINESS_BUCKET = 'business-images'
const MAX_BUSINESS_IMAGES = 5

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

export async function uploadBusinessImage(
  businessId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, images')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Negocio no encontrado.' }

  const currentImages: string[] = owned.images ?? []
  if (currentImages.length >= MAX_BUSINESS_IMAGES) {
    return { error: `Máximo ${MAX_BUSINESS_IMAGES} fotos por negocio.` }
  }

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const admin = createAdminClient()
  const path = `businesses/${businessId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

  const { error: uploadError } = await admin.storage
    .from(BUSINESS_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })

  if (uploadError) return { error: 'No se pudo subir la imagen. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(BUSINESS_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('businesses')
    .update({ images: [...currentImages, publicUrl] })
    .eq('id', businessId)

  if (updateError) {
    await admin.storage.from(BUSINESS_BUCKET).remove([path])
    return { error: 'No se pudo guardar la imagen.' }
  }

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${businessId}`)
}

export async function deleteBusinessImage(
  businessId: string,
  imageUrl: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, images')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Negocio no encontrado.' }

  const admin = createAdminClient()
  const storagePath = extractStoragePath(imageUrl, BUSINESS_BUCKET)
  if (storagePath) {
    await admin.storage.from(BUSINESS_BUCKET).remove([storagePath])
  }

  const newImages = (owned.images ?? []).filter((u: string) => u !== imageUrl)
  await admin.from('businesses').update({ images: newImages }).eq('id', businessId)

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${businessId}`)
}
