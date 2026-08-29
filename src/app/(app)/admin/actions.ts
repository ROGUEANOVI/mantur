'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { normalizeColombianPhone } from '@/lib/phone'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'
import {
  sendRoleRequestApprovedEmail,
  sendRoleRequestRejectedEmail,
  type RequestableRole,
} from '@/lib/email/roleRequestEmails'

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
  const { admin, adminId } = await getAuthenticatedAdmin()

  const businessId = formData.get('businessId') as string
  if (!UUID_RE.test(businessId)) redirect('/admin/negocios')

  // Hard gate: a business cannot go live without a reviewed RNT document.
  // The admin opening the signed link in the RNT section before clicking
  // Aprobar is the verification step, same as approveRoleRequest — so this
  // action also marks rnt_status verified, not just status/verified.
  const { data: business } = await admin
    .from('businesses')
    .select('rnt_document_path')
    .eq('id', businessId)
    .maybeSingle()

  if (!business?.rnt_document_path) redirect('/admin/negocios?status=pending&error=rnt_missing')

  const { data, error } = await admin
    .from('businesses')
    .update({
      status: 'active', verified: true,
      rnt_status: 'verified', rnt_verified_by: adminId, rnt_verified_at: new Date().toISOString(),
    })
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

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: adminCopy.negocios.form.errors.nameRequired }

  const type = formData.get('type') as string
  if (!BUSINESS_TYPES.includes(type as (typeof BUSINESS_TYPES)[number]))
    return { error: adminCopy.negocios.form.errors.typeRequired }

  const ownerId = formData.get('ownerId') as string
  if (!UUID_RE.test(ownerId))
    return { error: adminCopy.negocios.form.errors.ownerRequired }

  const description = (formData.get('description') as string | null)?.trim() || null
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: adminCopy.negocios.form.errors.descriptionTooLong }
  }
  const address = (formData.get('address') as string | null)?.trim() || null
  const rawPhone = (formData.get('phone') as string | null)?.trim() || ''

  const phone = rawPhone ? normalizeColombianPhone(rawPhone) : null
  if (rawPhone && !phone) return { error: adminCopy.negocios.form.errors.invalidPhone }

  const rawLat = formData.get('lat') as string
  const rawLng = formData.get('lng') as string
  const lat = rawLat ? Number(rawLat) : null
  const lng = rawLng ? Number(rawLng) : null
  if ((rawLat && !Number.isFinite(lat)) || (rawLng && !Number.isFinite(lng))) {
    return { error: adminCopy.negocios.form.errors.invalidCoords }
  }

  const { error } = await admin.from('businesses').insert({
    name,
    type,
    description,
    address,
    phone,
    lat,
    lng,
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

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: adminCopy.lugares.errors.nameRequired }

  const type = formData.get('type') as string
  if (!PLACE_TYPES.includes(type as (typeof PLACE_TYPES)[number]))
    return { error: adminCopy.lugares.errors.typeRequired }

  const description = (formData.get('description') as string | null)?.trim() || null
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: adminCopy.lugares.errors.descriptionTooLong }
  }
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

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: adminCopy.lugares.errors.nameRequired }

  const type = formData.get('type') as string
  if (!PLACE_TYPES.includes(type as (typeof PLACE_TYPES)[number]))
    return { error: adminCopy.lugares.errors.typeRequired }

  const description = (formData.get('description') as string | null)?.trim() || null
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: adminCopy.lugares.errors.descriptionTooLong }
  }
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

// ── Place media actions ──────────────────────────────────────────────────────

const PLACE_BUCKET = 'place-images'
const PLACE_VIDEO_BUCKET = 'place-videos'
const MAX_PLACE_MEDIA = 10

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

export async function uploadPlaceImage(
  placeId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(placeId)) return { error: 'Lugar no encontrado.' }
  const { admin } = await getAuthenticatedAdmin()

  const { data: place } = await admin
    .from('places')
    .select('id, images, videos')
    .eq('id', placeId)
    .maybeSingle()

  if (!place) return { error: 'Lugar no encontrado.' }

  const currentImages: string[] = place.images ?? []
  if (currentImages.length + (place.videos ?? []).length >= MAX_PLACE_MEDIA) {
    return { error: `Máximo ${MAX_PLACE_MEDIA} fotos y videos por lugar.` }
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

export async function requestPlaceVideoUpload(
  placeId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<{ token: string; path: string; publicUrl: string } | { error: string }> {
  if (!UUID_RE.test(placeId)) return { error: 'Lugar no encontrado.' }
  const { admin } = await getAuthenticatedAdmin()

  const { data: place } = await admin
    .from('places')
    .select('id, images, videos')
    .eq('id', placeId)
    .maybeSingle()

  if (!place) return { error: 'Lugar no encontrado.' }

  const currentCount = (place.images ?? []).length + (place.videos ?? []).length
  if (currentCount >= MAX_PLACE_MEDIA) {
    return { error: `Máximo ${MAX_PLACE_MEDIA} fotos y videos por lugar.` }
  }

  const fileError = validateVideoMeta(fileType, fileSize)
  if (fileError) return { error: fileError }

  const path = `places/${placeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${videoExtension(fileType)}`

  const { data, error } = await admin.storage.from(PLACE_VIDEO_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: 'No se pudo iniciar la subida del video. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(PLACE_VIDEO_BUCKET).getPublicUrl(path)

  return { token: data.token, path: data.path, publicUrl }
}

export async function confirmPlaceVideoUpload(
  placeId: string,
  path: string,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(placeId)) return { error: 'Lugar no encontrado.' }
  // See confirmBusinessVideoUpload (mi-negocio/actions.ts): confirm never
  // trusts a client-supplied URL directly, only a path scoped to this
  // place's own folder — the public URL is derived server-side below.
  if (!path.startsWith(`places/${placeId}/`)) return { error: 'Video no válido.' }

  const { admin } = await getAuthenticatedAdmin()

  const { data: place } = await admin
    .from('places')
    .select('id, images, videos')
    .eq('id', placeId)
    .maybeSingle()

  if (!place) return { error: 'Lugar no encontrado.' }

  const currentVideos: string[] = place.videos ?? []
  if ((place.images ?? []).length + currentVideos.length >= MAX_PLACE_MEDIA) {
    return { error: `Máximo ${MAX_PLACE_MEDIA} fotos y videos por lugar.` }
  }

  const { data: { publicUrl } } = admin.storage.from(PLACE_VIDEO_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('places')
    .update({ videos: [...currentVideos, publicUrl] })
    .eq('id', placeId)

  if (updateError) return { error: 'No se pudo guardar el video.' }

  revalidatePath('/admin/lugares')
  revalidatePath('/lugares')
  revalidatePath('/')
}

export async function deletePlaceVideo(
  placeId: string,
  videoUrl: string,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(placeId)) return { error: 'Lugar no encontrado.' }
  const { admin } = await getAuthenticatedAdmin()

  const { data: place } = await admin
    .from('places')
    .select('id, videos')
    .eq('id', placeId)
    .maybeSingle()

  if (!place) return { error: 'Lugar no encontrado.' }

  const storagePath = extractStoragePath(videoUrl, PLACE_VIDEO_BUCKET)
  if (storagePath) {
    await admin.storage.from(PLACE_VIDEO_BUCKET).remove([storagePath])
  }

  const newVideos = (place.videos ?? []).filter((u: string) => u !== videoUrl)
  await admin.from('places').update({ videos: newVideos }).eq('id', placeId)

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

// Wompi's Payouts API identifies a destination bank by its own internal
// catalog id (looked up from the merchant dashboard), not by the free-text
// bank name a business/guide enters themselves — see the migration comment
// on business_payout_accounts.wompi_bank_id. Only an admin (who has access
// to that dashboard) sets this field; it requires the recipient to have
// already saved their own bank details first (the row must already exist —
// this never creates one, since every other column on these tables is
// NOT NULL and the recipient is the only one who knows those values).
export async function updateWompiBankId(formData: FormData): Promise<ActionResult> {
  const { admin } = await getAuthenticatedAdmin()

  const recipientType = formData.get('recipientType') as string
  const recipientId = formData.get('recipientId') as string
  const wompiBankId = (formData.get('wompiBankId') as string | null)?.trim() || ''

  if (recipientType !== 'business' && recipientType !== 'guide') {
    return { error: adminCopy.payoutAccounts.errors.generic }
  }
  if (!UUID_RE.test(recipientId)) return { error: adminCopy.payoutAccounts.errors.notFound }
  if (!wompiBankId) return { error: adminCopy.payoutAccounts.errors.invalidValue }

  const table = recipientType === 'business' ? 'business_payout_accounts' : 'tourist_guide_payout_accounts'
  const idColumn = recipientType === 'business' ? 'business_id' : 'guide_id'

  const { data, error } = await admin
    .from(table)
    .update({ wompi_bank_id: wompiBankId })
    .eq(idColumn, recipientId)
    .select(idColumn)

  if (error) return { error: adminCopy.payoutAccounts.errors.generic }
  if (!data?.length) return { error: adminCopy.payoutAccounts.errors.notFound }

  revalidatePath('/admin/negocios')
  revalidatePath('/admin/guias')
  return { success: true }
}

// ── Role request actions ─────────────────────────────────────────────────────

const VALID_ROLES = ['business_owner', 'transporter', 'tourist_guide'] as const

export async function approveRoleRequest(formData: FormData): Promise<void> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const requestId = formData.get('requestId') as string
  if (!UUID_RE.test(requestId)) redirect('/admin/solicitudes')

  const { data: request } = await admin
    .from('role_requests')
    .select('user_id, requested_role, metadata')
    .eq('id', requestId)
    .single()

  if (!request) redirect('/admin/solicitudes')
  if (!(VALID_ROLES as readonly string[]).includes(request.requested_role)) redirect('/admin/solicitudes')

  // Update request status
  await admin
    .from('role_requests')
    .update({ status: 'approved', reviewer_id: adminId, reviewed_at: new Date().toISOString() })
    .eq('id', requestId)

  // Update user's role in profiles
  await admin
    .from('profiles')
    .update({ role: request.requested_role })
    .eq('id', request.user_id)

  // Auto-create business so the owner doesn't re-enter info and avoids a second approval step
  if (request.requested_role === 'business_owner') {
    const meta = (request.metadata ?? {}) as Record<string, unknown>
    const businessName = (meta.business_name as string | undefined)?.trim()
    if (businessName) {
      const lat = typeof meta.lat === 'number' && Number.isFinite(meta.lat) ? meta.lat : null
      const lng = typeof meta.lng === 'number' && Number.isFinite(meta.lng) ? meta.lng : null

      const { data: newBusiness } = await admin
        .from('businesses')
        .insert({
          name: businessName,
          owner_id: request.user_id,
          phone: (meta.phone as string | undefined)?.trim() || null,
          lat,
          lng,
          type: 'other',
          status: 'active',
          verified: true,
          rnt_number: (meta.rnt_number as string | undefined)?.trim() || null,
          rnt_document_path: (meta.rnt_document_path as string | undefined) || null,
          // The admin reviewed the RNT document (via the signed link in
          // /admin/solicitudes) before clicking Aprobar — that manual check
          // is the verification, so this approval action marks it verified
          // directly rather than requiring a separate verify step.
          rnt_status: 'verified',
          rnt_verified_by: adminId,
          rnt_verified_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      // Link the categories the applicant specified
      if (newBusiness) {
        const categorySlugs = Array.isArray(meta.category_slugs)
          ? (meta.category_slugs as string[])
          : []

        if (categorySlugs.length > 0) {
          const { data: cats } = await admin
            .from('business_categories')
            .select('id')
            .in('slug', categorySlugs)
            .eq('is_active', true)

          if (cats?.length) {
            await admin
              .from('business_category_links')
              .insert(cats.map((c) => ({ business_id: newBusiness.id, category_id: c.id })))
          }
        }
      }
    }
  }

  // Auto-create transporter profile so the driver doesn't need to re-enter their vehicle info
  if (request.requested_role === 'transporter') {
    const meta = (request.metadata ?? {}) as Record<string, unknown>
    // submitRoleRequest already normalizes phone before it ever reaches
    // metadata, but re-normalize defensively here too — this also covers
    // any request submitted before that validation existed.
    const rawPhone = (meta.phone as string | undefined) ?? ''
    const tier = meta.transport_tier === 'cooperative' ? 'cooperative' : 'independent'
    await admin.from('transporters').insert({
      profile_id: request.user_id,
      vehicle_type: (meta.vehicle_type as string | undefined) ?? 'otro',
      license_plate: ((meta.license_plate as string | undefined) ?? '').toUpperCase().trim(),
      phone: normalizeColombianPhone(rawPhone) ?? rawPhone,
      is_available: false,
      transport_tier: tier,
      cooperative_name: (meta.cooperative_name as string | undefined)?.trim() || null,
      cooperative_rnt_number: (meta.cooperative_rnt_number as string | undefined)?.trim() || null,
      cooperative_habilitacion_number: (meta.cooperative_habilitacion_number as string | undefined)?.trim() || null,
      cooperative_document_path: (meta.cooperative_document_path as string | undefined) || null,
      driver_license_number: (meta.driver_license_number as string | undefined)?.trim() || null,
      driver_license_expiry: (meta.driver_license_expiry as string | undefined) || null,
      driver_license_document_path: (meta.driver_license_document_path as string | undefined) || null,
      soat_expiry_date: (meta.soat_expiry_date as string | undefined) || null,
      soat_document_path: (meta.soat_document_path as string | undefined) || null,
      // See the businesses branch above for why approval == verification here.
      verification_status: 'verified',
      verified_by: adminId,
      verified_at: new Date().toISOString(),
    })
  }

  // Auto-create tourist guide profile from the metadata captured at application time
  if (request.requested_role === 'tourist_guide') {
    const meta = (request.metadata ?? {}) as Record<string, unknown>
    const rawPhone = (meta.phone as string | undefined)?.trim() || ''
    await admin.from('tourist_guides').insert({
      profile_id: request.user_id,
      specialties: Array.isArray(meta.specialties) ? meta.specialties : [],
      languages: Array.isArray(meta.languages) ? meta.languages : [],
      bio: (meta.bio as string | undefined)?.trim() || null,
      phone: normalizeColombianPhone(rawPhone) ?? rawPhone,
      is_available: false,
      rnt_number: (meta.rnt_number as string | undefined)?.trim() || null,
      rnt_document_path: (meta.rnt_document_path as string | undefined) || null,
      tarjeta_profesional_number: (meta.tarjeta_profesional_number as string | undefined)?.trim() || null,
      tarjeta_profesional_document_path: (meta.tarjeta_profesional_document_path as string | undefined) || null,
      // See the businesses branch above for why approval == verification here.
      verification_status: 'verified',
      verified_by: adminId,
      verified_at: new Date().toISOString(),
    })
  }

  // Cancel any other pending requests from this user (they got a role)
  await admin
    .from('role_requests')
    .update({ status: 'rejected', rejection_reason: 'Otro rol fue aprobado.', reviewer_id: adminId, reviewed_at: new Date().toISOString() })
    .eq('user_id', request.user_id)
    .eq('status', 'pending')
    .neq('id', requestId)

  const { data: authUser } = await admin.auth.admin.getUserById(request.user_id)
  if (authUser?.user?.email) {
    await sendRoleRequestApprovedEmail(authUser.user.email, request.requested_role as RequestableRole)
  }

  revalidatePath('/admin/solicitudes')
  revalidatePath('/solicitar-rol')
  revalidatePath('/negocios')
  revalidatePath('/')
}

// ── Compliance document viewing ──────────────────────────────────────────────

const COMPLIANCE_BUCKET = 'compliance-documents'

// The compliance-documents bucket is private — no public URL is ever stored.
// This mints a short-lived signed URL on demand instead, for either the
// admin (any document) or the document's own owner (their own path only,
// so they can confirm what they submitted).
export async function getComplianceDocumentUrl(
  path: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: adminCopy.errors.unauthorized }

  // This is an exported Server Action — any authenticated caller can invoke
  // it directly with an arbitrary path string, not just via the admin UI
  // that normally supplies one. The ownership check below is a string
  // prefix match, so a crafted "{myId}/../{otherId}/doc.pdf" must be
  // rejected here first rather than trusted to fail naturally — reject any
  // path containing "." / ".." segments, backslashes, or otherwise not
  // already in canonical form.
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (
    segments.length === 0 ||
    segments.some((s) => s === '.' || s === '..') ||
    segments.join('/') !== path
  ) {
    return { error: adminCopy.errors.unauthorized }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isOwnDocument = path.startsWith(`${user.id}/`)
  if (profile?.role !== 'admin' && !isOwnDocument) return { error: adminCopy.errors.unauthorized }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(COMPLIANCE_BUCKET)
    .createSignedUrl(path, 60)

  if (error || !data) return { error: adminCopy.solicitudes.documentUnavailable }
  return { url: data.signedUrl }
}

export async function rejectRoleRequest(formData: FormData): Promise<void> {
  const { admin, adminId } = await getAuthenticatedAdmin()

  const requestId = formData.get('requestId') as string
  const reason = (formData.get('rejection_reason') as string | null)?.trim()
  if (!UUID_RE.test(requestId) || !reason) redirect('/admin/solicitudes')

  const { data: updated } = await admin
    .from('role_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewer_id: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('user_id, requested_role')
    .single()

  if (updated) {
    const { data: authUser } = await admin.auth.admin.getUserById(updated.user_id)
    if (authUser?.user?.email) {
      await sendRoleRequestRejectedEmail(authUser.user.email, updated.requested_role as RequestableRole, reason)
    }
  }

  revalidatePath('/admin/solicitudes')
  revalidatePath('/solicitar-rol')
}
