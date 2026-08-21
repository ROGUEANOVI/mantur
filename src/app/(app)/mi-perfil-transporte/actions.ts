'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transportCopy } from '@/lib/copy/transport'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'

type ActionResult = { error: string } | void
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Compliance document resubmission ─────────────────────────────────────────
// Same pattern as solicitar-rol/actions.ts and mi-negocio/actions.ts.

const COMPLIANCE_BUCKET = 'compliance-documents'
const VALID_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
const VALID_TIERS = new Set(['cooperative', 'independent'])

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

function validateExpiryDate(raw: string | null): { value: string } | { error: string } {
  if (!raw) return { error: roleRequestsCopy.errors.missingFields }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return { error: roleRequestsCopy.errors.invalidExpiryDate }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (parsed < today) return { error: roleRequestsCopy.errors.invalidExpiryDate }
  return { value: raw }
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

async function getAuthenticatedTransporter() {
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

  if (profile?.role !== 'transporter') redirect('/')

  const { data: transporter } = await supabase
    .from('transporters')
    .select('id, transport_tier')
    .eq('profile_id', user.id)
    .single()

  if (!transporter) redirect('/')

  return { supabase, userId: user.id, transporterId: transporter.id, currentTier: transporter.transport_tier as string }
}

export async function updateTransporterProfile(formData: FormData): Promise<ActionResult> {
  // currentTier comes from the authenticated session's own row, never from
  // client input — a form field claiming "the tier didn't change" must not
  // be trusted, since tierChanged gates whether both documents are required
  // together (independent tier) rather than whether any mutation happens at
  // all. Found by security review: trusting a client-supplied current_tier
  // let a transporter falsely claim "no change" and upload only one of the
  // two required documents when actually switching tiers.
  const { supabase, userId, currentTier } = await getAuthenticatedTransporter()

  const tier = (formData.get('transport_tier') as string | null)?.trim()
  if (!tier || !VALID_TIERS.has(tier)) return { error: roleRequestsCopy.errors.invalidTier }

  const tierChanged = tier !== currentTier
  const updatePayload: Record<string, unknown> = {}
  let needsReview = false

  if (tier === 'cooperative') {
    const cooperativeFile = formData.get('cooperative_document') as File | null
    const hasNewDoc = !!(cooperativeFile && cooperativeFile.size)
    if (tierChanged && !hasNewDoc) return { error: transportCopy.editProfile.tierChangeRequiresDocument }

    if (hasNewDoc) {
      const fileError = validateComplianceFile(cooperativeFile)
      if (fileError) return { error: fileError }

      const cooperativeName = (formData.get('cooperative_name') as string | null)?.trim()
      const cooperativeRntNumber = (formData.get('cooperative_rnt_number') as string | null)?.trim()
      const cooperativeHabilitacionNumber = (formData.get('cooperative_habilitacion_number') as string | null)?.trim()
      if (!cooperativeName || !cooperativeRntNumber || !cooperativeHabilitacionNumber) {
        return { error: roleRequestsCopy.errors.missingFields }
      }

      const upload = await uploadComplianceDocument(supabase, userId, 'cooperativa', cooperativeFile!)
      if ('error' in upload) return { error: upload.error }

      updatePayload.transport_tier = 'cooperative'
      updatePayload.cooperative_name = cooperativeName
      updatePayload.cooperative_rnt_number = cooperativeRntNumber
      updatePayload.cooperative_habilitacion_number = cooperativeHabilitacionNumber
      updatePayload.cooperative_document_path = upload.path
      needsReview = true
    }
  } else {
    const licenseFile = formData.get('driver_license_document') as File | null
    const soatFile = formData.get('soat_document') as File | null
    const hasNewLicense = !!(licenseFile && licenseFile.size)
    const hasNewSoat = !!(soatFile && soatFile.size)
    if (tierChanged && !(hasNewLicense && hasNewSoat)) {
      return { error: transportCopy.editProfile.tierChangeRequiresDocument }
    }

    if (hasNewLicense) {
      const fileError = validateComplianceFile(licenseFile)
      if (fileError) return { error: fileError }

      const driverLicenseNumber = (formData.get('driver_license_number') as string | null)?.trim()
      if (!driverLicenseNumber) return { error: roleRequestsCopy.errors.missingFields }
      const expiry = validateExpiryDate(formData.get('driver_license_expiry') as string | null)
      if ('error' in expiry) return { error: expiry.error }

      const upload = await uploadComplianceDocument(supabase, userId, 'licencia', licenseFile!)
      if ('error' in upload) return { error: upload.error }

      updatePayload.transport_tier = 'independent'
      updatePayload.driver_license_number = driverLicenseNumber
      updatePayload.driver_license_expiry = expiry.value
      updatePayload.driver_license_document_path = upload.path
      needsReview = true
    }

    if (hasNewSoat) {
      const fileError = validateComplianceFile(soatFile)
      if (fileError) return { error: fileError }

      const expiry = validateExpiryDate(formData.get('soat_expiry_date') as string | null)
      if ('error' in expiry) return { error: expiry.error }

      const upload = await uploadComplianceDocument(supabase, userId, 'soat', soatFile!)
      if ('error' in upload) return { error: upload.error }

      updatePayload.transport_tier = 'independent'
      updatePayload.soat_expiry_date = expiry.value
      updatePayload.soat_document_path = upload.path
      needsReview = true
    }
  }

  if (needsReview) updatePayload.verification_status = 'pending_review'

  if (Object.keys(updatePayload).length === 0) {
    revalidatePath('/mi-perfil-transporte')
    return
  }

  const { error } = await supabase
    .from('transporters')
    .update(updatePayload)
    .eq('profile_id', userId)

  if (error) return { error: transportCopy.errors.generic }

  revalidatePath('/mi-perfil-transporte')
}

export async function toggleAvailability(): Promise<ActionResult> {
  const { supabase, transporterId } = await getAuthenticatedTransporter()

  const { data: current } = await supabase
    .from('transporters')
    .select('is_available')
    .eq('id', transporterId)
    .single()

  if (!current) return { error: transportCopy.errors.generic }

  const { error } = await supabase
    .from('transporters')
    .update({ is_available: !current.is_available })
    .eq('id', transporterId)

  if (error) return { error: transportCopy.errors.generic }

  revalidatePath('/mi-perfil-transporte')
  revalidatePath('/transportistas')
}

export async function acceptTransportRequest(formData: FormData): Promise<void> {
  const { transporterId } = await getAuthenticatedTransporter()

  const requestId = formData.get('requestId') as string
  if (!UUID_RE.test(requestId)) return

  const admin = createAdminClient()

  // Atomic claim: only succeeds if the request is still pending.
  // Postgres UPDATE is row-level atomic so only one transporter wins the race.
  // If data is empty, the request was already accepted — revalidate silently
  // so the transporter sees the updated list without the claimed request.
  await admin
    .from('transport_requests')
    .update({ transporter_id: transporterId, status: 'accepted' })
    .eq('id', requestId)
    .eq('status', 'pending')

  revalidatePath('/mi-perfil-transporte')
}

export async function markCompleted(formData: FormData): Promise<void> {
  const { transporterId } = await getAuthenticatedTransporter()

  const requestId = formData.get('requestId') as string
  if (!UUID_RE.test(requestId)) return

  const admin = createAdminClient()

  await admin
    .from('transport_requests')
    .update({ status: 'completed' })
    .eq('id', requestId)
    .eq('transporter_id', transporterId)
    .eq('status', 'accepted')

  revalidatePath('/mi-perfil-transporte')
}
