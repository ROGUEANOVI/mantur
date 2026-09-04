'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { normalizeColombianPhone } from '@/lib/phone'
import { AVAILABILITY_DATE_RE, AVAILABILITY_STATUSES } from '@/lib/validation'

type ActionResult = { error: string } | void
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOUR_BUCKET = 'business-images'
const MAX_TOUR_IMAGES = 5

// ── RNT / Tarjeta Profesional resubmission ───────────────────────────────────
// Same pattern as mi-negocio/actions.ts and solicitar-rol/actions.ts: upload
// straight to the private compliance-documents bucket using the caller's own
// session (storage RLS only allows writing under the caller's own
// {auth.uid()}/ folder), storing only the path.

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
  if (!file || !file.size) return roleRequestsCopy.errors.documentRequired
  if (!VALID_DOCUMENT_MIME_TYPES.includes(file.type)) return roleRequestsCopy.errors.invalidDocument
  if (file.size > MAX_DOCUMENT_BYTES) return roleRequestsCopy.errors.documentTooLarge
  return null
}

async function uploadComplianceDocument(
  supabase: SupabaseClient,
  userId: string,
  docType: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const path = `${userId}/${docType}-${Date.now()}-${Math.random().toString(36).slice(2)}.${documentExtension(file.type)}`

  const { error } = await supabase.storage
    .from(COMPLIANCE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return { error: roleRequestsCopy.errors.uploadFailed }
  return { path }
}

async function getAuthenticatedGuide() {
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

  if (profile?.role !== 'tourist_guide') redirect('/')

  const { data: guide } = await supabase
    .from('tourist_guides')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!guide) redirect('/')

  return { supabase, userId: user.id, guideId: guide.id }
}

const VALID_SPECIALTIES = new Set([
  'ecotourism','history_culture','local_gastronomy','adventure','photography',
  'birdwatching','cultural','religious','rural',
])
const VALID_LANGUAGES = new Set(['spanish','english','french','portuguese','indigenous'])

export async function updateGuideProfile(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedGuide()

  const rawPhone = ((formData.get('phone') as string | null) ?? '').trim()
  const bio = (formData.get('bio') as string | null)?.trim() || null
  const specialties = (formData.getAll('specialties') as string[]).filter((s) => VALID_SPECIALTIES.has(s))
  const languages = (formData.getAll('languages') as string[]).filter((l) => VALID_LANGUAGES.has(l))

  if (!rawPhone) return { error: guidesCopy.editProfile.phone + ' es obligatorio.' }
  const phone = normalizeColombianPhone(rawPhone)
  if (!phone) return { error: guidesCopy.errors.invalidPhone }

  // RNT/Tarjeta Profesional resubmission is optional — only touched when a
  // new document is uploaded. Number and document are paired per credential:
  // either both are provided together, or that credential is left untouched.
  // Uploading either resets verification_status so the admin re-reviews.
  const updatePayload: Record<string, unknown> = { phone, bio, specialties, languages }
  let needsReview = false

  const rntFile = formData.get('rnt_document') as File | null
  if (rntFile && rntFile.size) {
    const rntNumber = (formData.get('rnt_number') as string | null)?.trim()
    if (!rntNumber) return { error: roleRequestsCopy.errors.missingFields }
    const rntFileError = validateComplianceFile(rntFile)
    if (rntFileError) return { error: rntFileError }

    const rntUpload = await uploadComplianceDocument(supabase, userId, 'rnt', rntFile)
    if ('error' in rntUpload) return { error: rntUpload.error }

    updatePayload.rnt_number = rntNumber
    updatePayload.rnt_document_path = rntUpload.path
    needsReview = true
  }

  const tarjetaFile = formData.get('tarjeta_profesional_document') as File | null
  if (tarjetaFile && tarjetaFile.size) {
    const tarjetaNumber = (formData.get('tarjeta_profesional_number') as string | null)?.trim()
    if (!tarjetaNumber) return { error: roleRequestsCopy.errors.missingFields }
    const tarjetaFileError = validateComplianceFile(tarjetaFile)
    if (tarjetaFileError) return { error: tarjetaFileError }

    const tarjetaUpload = await uploadComplianceDocument(supabase, userId, 'tarjeta-profesional', tarjetaFile)
    if ('error' in tarjetaUpload) return { error: tarjetaUpload.error }

    updatePayload.tarjeta_profesional_number = tarjetaNumber
    updatePayload.tarjeta_profesional_document_path = tarjetaUpload.path
    needsReview = true
  }

  if (needsReview) updatePayload.verification_status = 'pending_review'

  const { error } = await supabase
    .from('tourist_guides')
    .update(updatePayload)
    .eq('profile_id', userId)

  if (error) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  redirect('/mi-perfil-guia')
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

// Saves the bank account ManTur pays this guide's net share (amount minus
// commission) into once a tour booking is confirmed. wompi_bank_id is
// Wompi's own internal bank catalog id — the guide picks it from a <select>
// populated server-side via listPayoutBanks() (GET /banks), so this is
// still a value chosen from Wompi's real catalog, not free text. The
// separate admin-only updateWompiBankId (src/app/(app)/admin/actions.ts)
// remains as a correction path (e.g. the catalog fetch failed at save time,
// or the value needs fixing without the guide re-submitting the whole
// form). Upserts on guide_id (the table's primary key), since the guide
// may be creating this row for the first time or editing an existing one.
export async function saveGuidePayoutAccount(formData: FormData): Promise<PayoutActionResult> {
  const { supabase, guideId } = await getAuthenticatedGuide()

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

  const { error } = await supabase.from('tourist_guide_payout_accounts').upsert(
    {
      guide_id: guideId,
      bank_name: bankName,
      wompi_bank_id: wompiBankId,
      account_type: accountType,
      account_number: accountNumber,
      holder_id_type: holderIdType,
      holder_id_number: holderIdNumber,
      holder_name: holderName,
      holder_email: holderEmail,
    },
    { onConflict: 'guide_id' },
  )

  if (error) return { error: 'No se pudo guardar la cuenta de pagos. Intenta de nuevo.' }

  revalidatePath('/mi-perfil-guia/editar')
  return { success: true }
}

// Fase 6 (Paquetes/Tours) self-service counterpart to the admin's
// setProviderAvailability (src/app/(app)/admin/paquetes/solicitudes/actions.ts).
// See setBusinessAvailability in mi-negocio/actions.ts for the full
// rationale — same table, same upsert-only posture, RLS
// (provider_availability_insert_own/_update_own, 20260908000000) does the
// real enforcement. guideId is always the caller's own — never trusts any
// id the form might carry, since a guide only ever has one profile.
export async function setGuideAvailability(formData: FormData): Promise<ActionResult> {
  const copy = guidesCopy.availability.errors
  const { supabase, userId, guideId } = await getAuthenticatedGuide()

  const date = formData.get('date') as string
  const status = formData.get('status') as string
  if (!AVAILABILITY_DATE_RE.test(date)) return { error: copy.generic }
  if (!AVAILABILITY_STATUSES.has(status)) return { error: copy.generic }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (date < today) return { error: copy.pastDate }

  const { error } = await supabase.from('provider_availability').upsert(
    {
      provider_type: 'guide',
      provider_id: guideId,
      date,
      status,
      source: 'provider_self_service',
      resolved_by: userId,
    },
    { onConflict: 'provider_type,provider_id,date' },
  )

  if (error) return { error: copy.generic }

  revalidatePath('/mi-perfil-guia/disponibilidad')
}

export async function toggleGuideAvailability(): Promise<ActionResult> {
  const { supabase, guideId } = await getAuthenticatedGuide()

  const { data: current } = await supabase
    .from('tourist_guides')
    .select('is_available')
    .eq('id', guideId)
    .single()

  if (!current) return { error: guidesCopy.errors.generic }

  const { error } = await supabase
    .from('tourist_guides')
    .update({ is_available: !current.is_available })
    .eq('id', guideId)

  if (error) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  revalidatePath('/guias')
}

// Same bound as src/app/(app)/mi-negocio/parsers.ts's parsePrice — kept
// local (not imported) since this file's guide-tour price is a distinct
// domain concept, but the two "set a price for a bookable thing" flows
// should reject the same unreasonable values.
function parsePrice(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? n : null
}

export async function createGuideTour(formData: FormData): Promise<ActionResult> {
  const { guideId } = await getAuthenticatedGuide()

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: guidesCopy.errors.nameRequired }

  const rawPrice = formData.get('price') as string
  const price = parsePrice(rawPrice)
  if (price === null) return { error: guidesCopy.errors.priceInvalid }

  const description = (formData.get('description') as string | null)?.trim() || null

  const rawCapacity = formData.get('capacity') as string
  const capacity = rawCapacity ? parseInt(rawCapacity, 10) : 1
  if (!Number.isInteger(capacity) || capacity < 1) return { error: guidesCopy.errors.capacityInvalid }

  const rawDuration = formData.get('duration_minutes') as string
  const durationMinutes = rawDuration ? parseInt(rawDuration, 10) : null
  const validDuration = durationMinutes === null || (Number.isInteger(durationMinutes) && durationMinutes > 0)
  if (!validDuration) return { error: guidesCopy.errors.generic }

  const admin = createAdminClient()

  const { error } = await admin.from('guide_tours').insert({
    guide_id: guideId,
    name,
    description,
    price,
    capacity,
    duration_minutes: durationMinutes || null,
    status: 'active',
  })

  if (error) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  redirect('/mi-perfil-guia')
}

export async function updateGuideTour(
  tourId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const { guideId } = await getAuthenticatedGuide()
  if (!UUID_RE.test(tourId)) return { error: guidesCopy.errors.notFound }

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: guidesCopy.errors.nameRequired }

  const rawPrice = formData.get('price') as string
  const price = parsePrice(rawPrice)
  if (price === null) return { error: guidesCopy.errors.priceInvalid }

  const description = (formData.get('description') as string | null)?.trim() || null

  const rawCapacity = formData.get('capacity') as string
  const capacity = rawCapacity ? parseInt(rawCapacity, 10) : 1
  if (!Number.isInteger(capacity) || capacity < 1) return { error: guidesCopy.errors.capacityInvalid }

  const rawDuration = formData.get('duration_minutes') as string
  const durationMinutes = rawDuration ? parseInt(rawDuration, 10) : null
  const validDuration = durationMinutes === null || (Number.isInteger(durationMinutes) && durationMinutes > 0)
  if (!validDuration) return { error: guidesCopy.errors.generic }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('guide_tours')
    .update({ name, description, price, capacity, duration_minutes: durationMinutes || null })
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .select('id')

  if (error || !data?.length) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  return { success: true }
}

export async function toggleTourStatus(formData: FormData): Promise<void> {
  const { guideId } = await getAuthenticatedGuide()

  const tourId = formData.get('tourId') as string
  if (!UUID_RE.test(tourId)) return

  const supabase = await createClient()
  const { data: tour } = await supabase
    .from('guide_tours')
    .select('status')
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .single()

  if (!tour) return

  const admin = createAdminClient()
  await admin
    .from('guide_tours')
    .update({ status: tour.status === 'active' ? 'inactive' : 'active' })
    .eq('id', tourId)

  revalidatePath('/mi-perfil-guia')
}

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

export async function uploadTourImage(
  tourId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(tourId)) return { error: guidesCopy.errors.notFound }
  const { guideId } = await getAuthenticatedGuide()
  const admin = createAdminClient()

  const { data: tour } = await admin
    .from('guide_tours')
    .select('id, images')
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .maybeSingle()

  if (!tour) return { error: guidesCopy.errors.notFound }

  const currentImages: string[] = tour.images ?? []
  if (currentImages.length >= MAX_TOUR_IMAGES) {
    return { error: `Máximo ${MAX_TOUR_IMAGES} fotos por tour.` }
  }

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const path = `guide-tours/${tourId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

  const { error: uploadError } = await admin.storage
    .from(TOUR_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })

  if (uploadError) return { error: 'No se pudo subir la imagen. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(TOUR_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('guide_tours')
    .update({ images: [...currentImages, publicUrl] })
    .eq('id', tourId)

  if (updateError) {
    await admin.storage.from(TOUR_BUCKET).remove([path])
    return { error: 'No se pudo guardar la imagen.' }
  }

  revalidatePath('/mi-perfil-guia')
  revalidatePath('/guias')
}

export async function deleteTourImage(
  tourId: string,
  imageUrl: string,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(tourId)) return { error: guidesCopy.errors.notFound }
  const { guideId } = await getAuthenticatedGuide()
  const admin = createAdminClient()

  const { data: tour } = await admin
    .from('guide_tours')
    .select('id, images')
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .maybeSingle()

  if (!tour) return { error: guidesCopy.errors.notFound }

  const storagePath = extractStoragePath(imageUrl, TOUR_BUCKET)
  if (storagePath) {
    await admin.storage.from(TOUR_BUCKET).remove([storagePath])
  }

  const newImages = (tour.images ?? []).filter((u: string) => u !== imageUrl)
  await admin.from('guide_tours').update({ images: newImages }).eq('id', tourId)

  revalidatePath('/mi-perfil-guia')
  revalidatePath('/guias')
}
