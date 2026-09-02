'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePrice, parsePositiveInt } from './parsers'
import { normalizeColombianPhone } from '@/lib/phone'
import { getAttributeFields, parseAttributes } from '@/lib/services/attributeConfig'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'

type ActionResult = { error: string } | void
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── RNT compliance document upload ───────────────────────────────────────────
// Same pattern as solicitar-rol/actions.ts: upload straight to the private
// compliance-documents bucket using the caller's own session (storage RLS
// only allows writing under the caller's own {auth.uid()}/ folder), and
// store only the storage path — never a public or signed URL — in the row.

const COMPLIANCE_BUCKET = 'compliance-documents'
const VALID_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024

function documentExtension(mimeType: string): string {
  switch (mimeType) {
    case 'application/pdf':
      return 'pdf'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'jpg'
  }
}

function validateComplianceFile(file: File | null): string | null {
  if (!file || !file.size) return 'Adjunta el certificado RNT.'
  if (!VALID_DOCUMENT_MIME_TYPES.includes(file.type)) return 'Formato no válido. Usa PDF, JPEG, PNG o WebP.'
  if (file.size > MAX_DOCUMENT_BYTES) return 'El archivo no puede superar 8 MB.'
  return null
}

async function uploadComplianceDocument(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const path = `${userId}/rnt-${Date.now()}-${Math.random().toString(36).slice(2)}.${documentExtension(file.type)}`

  const { error } = await supabase.storage
    .from(COMPLIANCE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return { error: 'No se pudo subir el documento. Intenta de nuevo.' }
  return { path }
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
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: `La descripción no puede superar ${DESCRIPTION_MAX_LENGTH} caracteres.` }
  }
  const address = (formData.get('address') as string | null)?.trim() || null
  const rawPhone = (formData.get('phone') as string | null)?.trim() || ''
  const categoryIds = (formData.getAll('category_ids') as string[]).filter((id) => UUID_RE.test(id))

  const rawLat = formData.get('lat') as string
  const rawLng = formData.get('lng') as string
  const lat = rawLat ? Number(rawLat) : null
  const lng = rawLng ? Number(rawLng) : null
  if ((rawLat && !Number.isFinite(lat)) || (rawLng && !Number.isFinite(lng))) {
    return { error: 'Las coordenadas deben ser números válidos.' }
  }

  if (!name) return { error: 'El nombre del negocio es obligatorio.' }
  if (!categoryIds.length) return { error: 'Selecciona al menos una categoría.' }

  const phone = rawPhone ? normalizeColombianPhone(rawPhone) : null
  if (rawPhone && !phone) return { error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' }

  const rntNumber = (formData.get('rnt_number') as string | null)?.trim()
  const rntFile = formData.get('rnt_document') as File | null
  if (!rntNumber) return { error: 'El número de RNT es obligatorio.' }
  const rntFileError = validateComplianceFile(rntFile)
  if (rntFileError) return { error: rntFileError }

  const rntUpload = await uploadComplianceDocument(supabase, userId, rntFile!)
  if ('error' in rntUpload) return { error: rntUpload.error }

  const { data: newBusiness, error } = await supabase
    .from('businesses')
    .insert({
      owner_id: userId, name, description, type: 'other', address, phone, lat, lng,
      verified: false, status: 'pending',
      rnt_number: rntNumber, rnt_document_path: rntUpload.path,
    })
    .select('id')
    .single()

  if (error || !newBusiness) {
    await supabase.storage.from(COMPLIANCE_BUCKET).remove([rntUpload.path])
    return { error: 'No se pudo crear el negocio. Intenta de nuevo.' }
  }

  const { error: linksError } = await supabase
    .from('business_category_links')
    .insert(categoryIds.map((id) => ({ business_id: newBusiness.id, category_id: id })))

  if (linksError) {
    await supabase.from('businesses').delete().eq('id', newBusiness.id)
    await supabase.storage.from(COMPLIANCE_BUCKET).remove([rntUpload.path])
    return { error: 'No se pudo guardar las categorías. Intenta de nuevo.' }
  }

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
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: `La descripción no puede superar ${DESCRIPTION_MAX_LENGTH} caracteres.` }
  }
  const address = (formData.get('address') as string | null)?.trim() || null
  const rawPhone = (formData.get('phone') as string | null)?.trim() || ''
  const categoryIds = (formData.getAll('category_ids') as string[]).filter((id) => UUID_RE.test(id))

  const rawLat = formData.get('lat') as string
  const rawLng = formData.get('lng') as string
  const lat = rawLat ? Number(rawLat) : null
  const lng = rawLng ? Number(rawLng) : null
  if ((rawLat && !Number.isFinite(lat)) || (rawLng && !Number.isFinite(lng))) {
    return { error: 'Las coordenadas deben ser números válidos.' }
  }

  if (!name) return { error: 'El nombre del negocio es obligatorio.' }
  if (!categoryIds.length) return { error: 'Selecciona al menos una categoría.' }

  const phone = rawPhone ? normalizeColombianPhone(rawPhone) : null
  if (rawPhone && !phone) return { error: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).' }

  // RNT re-upload is optional here — the owner only touches it to replace an
  // expired/rejected document, or to comply during the grace period for a
  // business created before this requirement existed. Number and document
  // are paired: either both are provided together, or neither is touched.
  const updatePayload: Record<string, unknown> = { name, description, address, phone, lat, lng }
  const rntFile = formData.get('rnt_document') as File | null
  if (rntFile && rntFile.size) {
    const rntNumber = (formData.get('rnt_number') as string | null)?.trim()
    if (!rntNumber) return { error: 'El número de RNT es obligatorio.' }
    const rntFileError = validateComplianceFile(rntFile)
    if (rntFileError) return { error: rntFileError }

    const rntUpload = await uploadComplianceDocument(supabase, userId, rntFile)
    if ('error' in rntUpload) return { error: rntUpload.error }

    updatePayload.rnt_number = rntNumber
    updatePayload.rnt_document_path = rntUpload.path
    // A new document needs a fresh admin review — reset the prior verdict
    // rather than keeping a stale 'verified' status on unreviewed content.
    updatePayload.rnt_status = 'pending_review'
    updatePayload.rnt_verified_by = null
    updatePayload.rnt_verified_at = null
  }

  const { error } = await supabase
    .from('businesses')
    .update(updatePayload)
    .eq('id', businessId)
    .eq('owner_id', userId)

  if (error) return { error: 'No se pudo actualizar el negocio. Intenta de nuevo.' }

  // Replace category links: delete existing, insert new selection
  await supabase.from('business_category_links').delete().eq('business_id', businessId)
  await supabase
    .from('business_category_links')
    .insert(categoryIds.map((id) => ({ business_id: businessId, category_id: id })))

  revalidatePath('/mi-negocio', 'layout')
  redirect(`/mi-negocio/${businessId}`)
}

const VALID_ACCOUNT_TYPES = new Set(['ahorros', 'corriente'])
const VALID_HOLDER_ID_TYPES = new Set(['CC', 'CE', 'NIT'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Wompi's own Payouts field requirements: accountNumber "must contain only
// numbers and be different from zero". holderIdNumber isn't documented as
// strictly numeric (NIT can carry a hyphenated check digit in some
// contexts), so it gets a looser but still bounded check.
const ACCOUNT_NUMBER_RE = /^(?!0+$)\d+$/
const HOLDER_ID_NUMBER_RE = /^[\d-]{5,20}$/

type PayoutActionResult = { error: string } | { success: true }

// Saves the bank account ManTur pays this business's net share (amount
// minus commission) into once a booking is confirmed. wompi_bank_id is
// Wompi's own internal bank catalog id — the owner picks it from a <select>
// populated server-side via listPayoutBanks() (GET /banks), so this is
// still a value chosen from Wompi's real catalog, not free text. The
// separate admin-only updateWompiBankId (src/app/(app)/admin/actions.ts)
// remains as a correction path (e.g. the catalog fetch failed at save time,
// or the value needs fixing without the owner re-submitting the whole
// form). Upserts on business_id (the table's primary key), since the owner
// may be creating this row for the first time or editing an existing one.
export async function savePayoutAccount(
  businessId: string,
  formData: FormData,
): Promise<PayoutActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }

  const { supabase, userId } = await getAuthenticatedOwner()

  const bankName = (formData.get('bank_name') as string | null)?.trim() || ''
  const wompiBankId = (formData.get('wompi_bank_id') as string | null)?.trim() || ''
  const accountType = formData.get('account_type') as string
  const accountNumber = (formData.get('account_number') as string | null)?.trim() || ''
  const holderIdType = formData.get('holder_id_type') as string
  const holderIdNumber = (formData.get('holder_id_number') as string | null)?.trim() || ''
  const holderName = (formData.get('holder_name') as string | null)?.trim() || ''
  const holderEmail = (formData.get('holder_email') as string | null)?.trim() || ''

  if (!bankName || !accountNumber || !holderIdNumber || !holderName || !holderEmail) {
    return { error: 'Completa todos los campos obligatorios.' }
  }
  if (!wompiBankId) return { error: 'Selecciona un banco válido.' }
  if (!VALID_ACCOUNT_TYPES.has(accountType)) return { error: 'Selecciona un tipo de cuenta válido.' }
  if (!VALID_HOLDER_ID_TYPES.has(holderIdType)) return { error: 'Selecciona un tipo de documento válido.' }
  if (!EMAIL_RE.test(holderEmail)) return { error: 'Escribe un correo electrónico válido.' }
  if (!ACCOUNT_NUMBER_RE.test(accountNumber)) return { error: 'El número de cuenta debe contener solo dígitos.' }
  if (!HOLDER_ID_NUMBER_RE.test(holderIdNumber)) return { error: 'Escribe un número de documento válido.' }

  // RLS (business_payout_accounts_insert_own/_update_own) already scopes
  // this to the caller's own business, but the same explicit ownership
  // check used everywhere else in this file (.eq('owner_id', userId)) is
  // cheap belt-and-suspenders for a table holding bank details.
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!business) return { error: 'Negocio no encontrado.' }

  const { error } = await supabase.from('business_payout_accounts').upsert(
    {
      business_id: businessId,
      bank_name: bankName,
      wompi_bank_id: wompiBankId,
      account_type: accountType,
      account_number: accountNumber,
      holder_id_type: holderIdType,
      holder_id_number: holderIdNumber,
      holder_name: holderName,
      holder_email: holderEmail,
    },
    { onConflict: 'business_id' },
  )

  if (error) return { error: 'No se pudo guardar la cuenta de pagos. Intenta de nuevo.' }

  revalidatePath(`/mi-negocio/${businessId}/editar`)
  return { success: true }
}

// Flips a business between 'active' and 'inactive' in place — no redirect,
// so it can be driven by a toggle switch instead of a full-page action.
// Deliberately does not accept 'pending' as a starting state: a business
// awaiting its first admin approval has nothing meaningful to toggle yet.
export async function toggleBusinessStatus(
  businessId: string,
  currentStatus: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }

  const { supabase, userId } = await getAuthenticatedOwner()

  if (currentStatus === 'active') {
    const { error } = await supabase
      .from('businesses')
      .update({ status: 'inactive' })
      .eq('id', businessId)
      .eq('owner_id', userId)

    if (error) return { error: 'No se pudo desactivar el negocio. Intenta de nuevo.' }

    revalidatePath('/mi-negocio', 'layout')
    revalidatePath('/negocios')
    return
  }

  if (currentStatus === 'inactive') {
    // Verify ownership with the user client before escalating to admin.
    const { data: owned } = await supabase
      .from('businesses')
      .select('id, verified')
      .eq('id', businessId)
      .eq('owner_id', userId)
      .eq('status', 'inactive')
      .maybeSingle()

    if (!owned) return { error: 'No se pudo activar el negocio. Intenta de nuevo.' }

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

    if (error) return { error: 'No se pudo activar el negocio. Intenta de nuevo.' }

    revalidatePath('/mi-negocio', 'layout')
    revalidatePath('/negocios')
    return
  }

  return { error: 'No se pudo actualizar el estado del negocio.' }
}

export async function createService(formData: FormData): Promise<ActionResult> {
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

  const serviceTypeId = formData.get('service_type_id') as string
  if (!UUID_RE.test(serviceTypeId)) return { error: 'Tipo de servicio no válido.' }

  // service_type_id is locked at creation — fetch its slug to know which
  // attribute fields to parse. Not trusting a client-supplied slug avoids
  // an attributes payload shaped for a type the id doesn't actually match.
  const { data: serviceType } = await supabase
    .from('service_types')
    .select('slug')
    .eq('id', serviceTypeId)
    .eq('is_active', true)
    .single()

  if (!serviceType) return { error: 'Tipo de servicio no válido.' }

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: `La descripción no puede superar ${DESCRIPTION_MAX_LENGTH} caracteres.` }
  }

  // Price is parsed and validated server-side — never trust the raw client value.
  // parsePrice rejects NaN, Infinity, negatives, and unreasonable amounts.
  const base_price = parsePrice(formData.get('base_price') as string)
  if (!name || base_price === null) {
    return { error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' }
  }

  const capacity = parsePositiveInt(formData.get('capacity') as string | null)
  if (capacity === false) return { error: 'El cupo debe ser un número positivo.' }

  const fields = getAttributeFields(serviceType.slug)
  const parsed = parseAttributes(fields, formData)
  if ('error' in parsed) return { error: parsed.error }

  const { error } = await supabase.from('services').insert({
    business_id: businessId,
    service_type_id: serviceTypeId,
    name,
    description,
    base_price,
    capacity,
    attributes: parsed.attributes,
    status: 'active',
  })

  if (error) return { error: 'No se pudo crear el servicio. Intenta de nuevo.' }

  revalidatePath('/mi-negocio', 'layout')
  redirect(`/mi-negocio/${businessId}/servicios`)
}

export async function updateService(
  serviceId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(serviceId)) return { error: 'Servicio no encontrado.' }

  const { supabase } = await getAuthenticatedOwner()

  // service_type_id is locked after creation — re-read it (rather than
  // trusting the form) to know which attribute fields apply on this edit.
  const { data: existing } = await supabase
    .from('services')
    .select('service_types(slug)')
    .eq('id', serviceId)
    .single<{ service_types: { slug: string } | null }>()

  if (!existing?.service_types) return { error: 'Servicio no encontrado.' }

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: `La descripción no puede superar ${DESCRIPTION_MAX_LENGTH} caracteres.` }
  }

  const base_price = parsePrice(formData.get('base_price') as string)
  if (!name || base_price === null) {
    return { error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' }
  }

  const capacity = parsePositiveInt(formData.get('capacity') as string | null)
  if (capacity === false) return { error: 'El cupo debe ser un número positivo.' }

  const fields = getAttributeFields(existing.service_types.slug)
  const parsed = parseAttributes(fields, formData)
  if ('error' in parsed) return { error: parsed.error }

  // RLS UPDATE policy verifies ownership via the businesses table.
  // .select('id') forces PostgREST to return the modified row so we can
  // detect a silent RLS block (0 rows updated) vs a real error.
  const { data, error } = await supabase
    .from('services')
    .update({ name, description, base_price, capacity, attributes: parsed.attributes })
    .eq('id', serviceId)
    .select('id')

  if (error || !data?.length) {
    return { error: 'No se pudo actualizar el servicio. Intenta de nuevo.' }
  }

  revalidatePath('/mi-negocio', 'layout')
}

export async function toggleServiceStatus(
  serviceId: string,
  currentStatus: 'active' | 'inactive',
): Promise<ActionResult> {
  if (!UUID_RE.test(serviceId)) return { error: 'Servicio no encontrado.' }

  const { supabase } = await getAuthenticatedOwner()

  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'

  // .select('id') detects silent RLS blocks (0 rows updated)
  const { data, error } = await supabase
    .from('services')
    .update({ status: newStatus })
    .eq('id', serviceId)
    .select('id')

  if (error || !data?.length) {
    return { error: 'No se pudo actualizar el estado. Intenta de nuevo.' }
  }

  revalidatePath('/mi-negocio', 'layout')
}

// ── Media helpers ────────────────────────────────────────────────────────────

const BUSINESS_BUCKET = 'business-images'
const BUSINESS_VIDEO_BUCKET = 'business-videos'
const MAX_BUSINESS_MEDIA = 10
const MAX_SERVICE_MEDIA = 10

const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

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

function validateVideoMeta(fileType: string, fileSize: number): string | null {
  if (!VIDEO_MIME_TYPES.includes(fileType)) return 'Formato no válido. Usa MP4, WebM o QuickTime.'
  if (!fileSize || fileSize > MAX_VIDEO_BYTES) return 'El video no puede superar 50 MB.'
  return null
}

function videoExtension(fileType: string): string {
  switch (fileType) {
    case 'video/webm':
      return 'webm'
    case 'video/quicktime':
      return 'mov'
    default:
      return 'mp4'
  }
}

export async function uploadBusinessImage(
  businessId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, images, videos, slug')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Negocio no encontrado.' }

  const currentImages: string[] = owned.images ?? []
  if (currentImages.length + (owned.videos ?? []).length >= MAX_BUSINESS_MEDIA) {
    return { error: `Máximo ${MAX_BUSINESS_MEDIA} fotos y videos por negocio.` }
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
  revalidatePath(`/negocios/${owned.slug}`)
}

type SignedUploadResult = { token: string; path: string; publicUrl: string } | { error: string }

export async function requestBusinessVideoUpload(
  businessId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<SignedUploadResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, images, videos')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Negocio no encontrado.' }

  const currentCount = (owned.images ?? []).length + (owned.videos ?? []).length
  if (currentCount >= MAX_BUSINESS_MEDIA) {
    return { error: `Máximo ${MAX_BUSINESS_MEDIA} fotos y videos por negocio.` }
  }

  const fileError = validateVideoMeta(fileType, fileSize)
  if (fileError) return { error: fileError }

  const admin = createAdminClient()
  const path = `businesses/${businessId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${videoExtension(fileType)}`

  const { data, error } = await admin.storage.from(BUSINESS_VIDEO_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: 'No se pudo iniciar la subida del video. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(BUSINESS_VIDEO_BUCKET).getPublicUrl(path)

  return { token: data.token, path: data.path, publicUrl }
}

export async function confirmBusinessVideoUpload(
  businessId: string,
  path: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }
  // The path must fall under this business's own folder — confirm never
  // trusts a client-supplied URL directly, since that would let a caller
  // skip validateVideoMeta (called only in requestBusinessVideoUpload) or
  // link in arbitrary external content as if it were an uploaded video.
  if (!path.startsWith(`businesses/${businessId}/`)) return { error: 'Video no válido.' }

  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, images, videos, slug')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Negocio no encontrado.' }

  const currentVideos: string[] = owned.videos ?? []
  if ((owned.images ?? []).length + currentVideos.length >= MAX_BUSINESS_MEDIA) {
    return { error: `Máximo ${MAX_BUSINESS_MEDIA} fotos y videos por negocio.` }
  }

  const admin = createAdminClient()
  const { data: { publicUrl } } = admin.storage.from(BUSINESS_VIDEO_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('businesses')
    .update({ videos: [...currentVideos, publicUrl] })
    .eq('id', businessId)

  if (updateError) return { error: 'No se pudo guardar el video.' }

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${owned.slug}`)
}

export async function deleteBusinessVideo(
  businessId: string,
  videoUrl: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, videos, slug')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Negocio no encontrado.' }

  const admin = createAdminClient()
  const storagePath = extractStoragePath(videoUrl, BUSINESS_VIDEO_BUCKET)
  if (storagePath) {
    await admin.storage.from(BUSINESS_VIDEO_BUCKET).remove([storagePath])
  }

  const newVideos = (owned.videos ?? []).filter((u: string) => u !== videoUrl)
  await admin.from('businesses').update({ videos: newVideos }).eq('id', businessId)

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${owned.slug}`)
}

export async function uploadServiceImage(
  serviceId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(serviceId)) return { error: 'Servicio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  // Verify the service belongs to a business owned by this user.
  const { data: service } = await supabase
    .from('services')
    .select('id, images, videos, business_id')
    .eq('id', serviceId)
    .maybeSingle()

  if (!service) return { error: 'Servicio no encontrado.' }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, slug')
    .eq('id', service.business_id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Servicio no encontrado.' }

  const currentImages: string[] = service.images ?? []
  if (currentImages.length + (service.videos ?? []).length >= MAX_SERVICE_MEDIA) {
    return { error: `Máximo ${MAX_SERVICE_MEDIA} fotos y videos por servicio.` }
  }

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const admin = createAdminClient()
  const path = `services/${serviceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

  const { error: uploadError } = await admin.storage
    .from(BUSINESS_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })

  if (uploadError) return { error: 'No se pudo subir la imagen. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(BUSINESS_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('services')
    .update({ images: [...currentImages, publicUrl] })
    .eq('id', serviceId)

  if (updateError) {
    await admin.storage.from(BUSINESS_BUCKET).remove([path])
    return { error: 'No se pudo guardar la imagen.' }
  }

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${owned.slug}`)
}

export async function deleteServiceImage(
  serviceId: string,
  imageUrl: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(serviceId)) return { error: 'Servicio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: service } = await supabase
    .from('services')
    .select('id, images, business_id')
    .eq('id', serviceId)
    .maybeSingle()

  if (!service) return { error: 'Servicio no encontrado.' }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, slug')
    .eq('id', service.business_id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Servicio no encontrado.' }

  const admin = createAdminClient()
  const storagePath = extractStoragePath(imageUrl, BUSINESS_BUCKET)
  if (storagePath) {
    await admin.storage.from(BUSINESS_BUCKET).remove([storagePath])
  }

  const newImages = (service.images ?? []).filter((u: string) => u !== imageUrl)
  await admin.from('services').update({ images: newImages }).eq('id', serviceId)

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${owned.slug}`)
}

export async function requestServiceVideoUpload(
  serviceId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<SignedUploadResult> {
  if (!UUID_RE.test(serviceId)) return { error: 'Servicio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: service } = await supabase
    .from('services')
    .select('id, images, videos, business_id')
    .eq('id', serviceId)
    .maybeSingle()

  if (!service) return { error: 'Servicio no encontrado.' }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', service.business_id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Servicio no encontrado.' }

  const currentCount = (service.images ?? []).length + (service.videos ?? []).length
  if (currentCount >= MAX_SERVICE_MEDIA) {
    return { error: `Máximo ${MAX_SERVICE_MEDIA} fotos y videos por servicio.` }
  }

  const fileError = validateVideoMeta(fileType, fileSize)
  if (fileError) return { error: fileError }

  const admin = createAdminClient()
  const path = `services/${serviceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${videoExtension(fileType)}`

  const { data, error } = await admin.storage.from(BUSINESS_VIDEO_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: 'No se pudo iniciar la subida del video. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(BUSINESS_VIDEO_BUCKET).getPublicUrl(path)

  return { token: data.token, path: data.path, publicUrl }
}

export async function confirmServiceVideoUpload(
  serviceId: string,
  path: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(serviceId)) return { error: 'Servicio no encontrado.' }
  // See confirmBusinessVideoUpload: confirm never trusts a client-supplied
  // URL directly, only a path scoped to this service's own folder.
  if (!path.startsWith(`services/${serviceId}/`)) return { error: 'Video no válido.' }

  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: service } = await supabase
    .from('services')
    .select('id, images, videos, business_id')
    .eq('id', serviceId)
    .maybeSingle()

  if (!service) return { error: 'Servicio no encontrado.' }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, slug')
    .eq('id', service.business_id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Servicio no encontrado.' }

  const currentVideos: string[] = service.videos ?? []
  if ((service.images ?? []).length + currentVideos.length >= MAX_SERVICE_MEDIA) {
    return { error: `Máximo ${MAX_SERVICE_MEDIA} fotos y videos por servicio.` }
  }

  const admin = createAdminClient()
  const { data: { publicUrl } } = admin.storage.from(BUSINESS_VIDEO_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('services')
    .update({ videos: [...currentVideos, publicUrl] })
    .eq('id', serviceId)

  if (updateError) return { error: 'No se pudo guardar el video.' }

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${owned.slug}`)
}

export async function deleteServiceVideo(
  serviceId: string,
  videoUrl: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(serviceId)) return { error: 'Servicio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: service } = await supabase
    .from('services')
    .select('id, videos, business_id')
    .eq('id', serviceId)
    .maybeSingle()

  if (!service) return { error: 'Servicio no encontrado.' }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, slug')
    .eq('id', service.business_id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (!owned) return { error: 'Servicio no encontrado.' }

  const admin = createAdminClient()
  const storagePath = extractStoragePath(videoUrl, BUSINESS_VIDEO_BUCKET)
  if (storagePath) {
    await admin.storage.from(BUSINESS_VIDEO_BUCKET).remove([storagePath])
  }

  const newVideos = (service.videos ?? []).filter((u: string) => u !== videoUrl)
  await admin.from('services').update({ videos: newVideos }).eq('id', serviceId)

  revalidatePath('/mi-negocio', 'layout')
  revalidatePath(`/negocios/${owned.slug}`)
}

export async function deleteBusinessImage(
  businessId: string,
  imageUrl: string,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }
  const { supabase, userId } = await getAuthenticatedOwner()

  const { data: owned } = await supabase
    .from('businesses')
    .select('id, images, slug')
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
  revalidatePath(`/negocios/${owned.slug}`)
}
