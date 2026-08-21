'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { roleRequestRateLimit, checkRateLimit } from '@/lib/rate-limit'
import { normalizeColombianPhone } from '@/lib/phone'
import { normalizeLicensePlate } from '@/lib/licensePlate'

type ActionResult = { error?: string; success?: boolean }
type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const VALID_VEHICLE_TYPES = new Set(['motocarro', 'moto', 'camioneta', 'buseta', 'otro'])
const VALID_TRANSPORT_TIERS = new Set(['cooperative', 'independent'])
const MAX_EXPERIENCE_YEARS = 60

const REQUESTABLE_ROLES = ['business_owner', 'transporter', 'tourist_guide'] as const
type RequestableRole = (typeof REQUESTABLE_ROLES)[number]

// ── Compliance document upload (RNT, Tarjeta Profesional, SOAT, licencia) ────
// Uploaded straight to the private `compliance-documents` bucket using the
// caller's own session (not the admin client) — the bucket's storage RLS
// only allows a user to write under their own {auth.uid()}/... folder, so
// this is safe without a service_role bypass. Only the storage *path* is
// stored in role_requests.metadata; nothing here ever mints a public or
// signed URL — that happens later, on demand, when an admin reviews it.

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

async function rollbackUploads(supabase: SupabaseClient, paths: string[]) {
  if (paths.length) await supabase.storage.from(COMPLIANCE_BUCKET).remove(paths)
}

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

export async function submitRoleRequest(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser()
  const copy = roleRequestsCopy.errors

  const allowed = await checkRateLimit(roleRequestRateLimit, user.id)
  if (!allowed) return { error: copy.rateLimited }

  const rawRole = formData.get('requested_role') as string
  if (!(REQUESTABLE_ROLES as readonly string[]).includes(rawRole)) {
    return { error: copy.missingFields }
  }
  const requestedRole = rawRole as RequestableRole

  // Check current role — can't request what you already have
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === requestedRole) return { error: copy.alreadyHasRole }

  // Check for an existing pending request for this role
  const { data: existing } = await supabase
    .from('role_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('requested_role', requestedRole)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return { error: copy.alreadyPending }

  // Build role-specific metadata. Uploaded compliance documents are tracked
  // in `uploadedPaths` so a later validation/insert failure can roll them
  // back instead of leaving orphaned files in storage.
  let metadata: Record<string, unknown> = {}
  const uploadedPaths: string[] = []

  if (requestedRole === 'business_owner') {
    const businessName = (formData.get('business_name') as string | null)?.trim()
    const categorySlugs = formData.getAll('category_slugs') as string[]
    const rawPhone = (formData.get('phone') as string | null)?.trim()
    const rntNumber = (formData.get('rnt_number') as string | null)?.trim()
    const rntFile = formData.get('rnt_document') as File | null
    if (!businessName || !categorySlugs.length || !rawPhone || !rntNumber) return { error: copy.missingFields }

    const phone = normalizeColombianPhone(rawPhone)
    if (!phone) return { error: copy.invalidPhone }

    const rntFileError = validateComplianceFile(rntFile)
    if (rntFileError) return { error: rntFileError }

    const rawLat = (formData.get('lat') as string | null) ?? ''
    const rawLng = (formData.get('lng') as string | null) ?? ''
    const lat = rawLat ? Number(rawLat) : null
    const lng = rawLng ? Number(rawLng) : null
    if ((rawLat && !Number.isFinite(lat)) || (rawLng && !Number.isFinite(lng))) {
      return { error: copy.invalidCoords }
    }

    const rntUpload = await uploadComplianceDocument(supabase, user.id, 'rnt', rntFile!)
    if ('error' in rntUpload) return { error: rntUpload.error }
    uploadedPaths.push(rntUpload.path)

    metadata = {
      business_name: businessName,
      category_slugs: categorySlugs,
      phone,
      lat,
      lng,
      rnt_number: rntNumber,
      rnt_document_path: rntUpload.path,
    }
  }

  if (requestedRole === 'transporter') {
    const rawLicensePlate = (formData.get('license_plate') as string | null)?.trim()
    const vehicleType = (formData.get('vehicle_type') as string | null)?.trim()
    const rawPhone = (formData.get('phone') as string | null)?.trim()
    const tier = (formData.get('transport_tier') as string | null)?.trim()
    if (!rawLicensePlate || !vehicleType || !rawPhone || !tier) return { error: copy.missingFields }
    if (!VALID_TRANSPORT_TIERS.has(tier)) return { error: copy.invalidTier }

    const licensePlate = normalizeLicensePlate(rawLicensePlate)
    if (!licensePlate) return { error: copy.invalidLicensePlate }

    if (!VALID_VEHICLE_TYPES.has(vehicleType)) return { error: copy.invalidVehicleType }

    const phone = normalizeColombianPhone(rawPhone)
    if (!phone) return { error: copy.invalidPhone }

    if (tier === 'cooperative') {
      const cooperativeName = (formData.get('cooperative_name') as string | null)?.trim()
      const cooperativeRntNumber = (formData.get('cooperative_rnt_number') as string | null)?.trim()
      const cooperativeHabilitacionNumber = (formData.get('cooperative_habilitacion_number') as string | null)?.trim()
      const cooperativeFile = formData.get('cooperative_document') as File | null
      if (!cooperativeName || !cooperativeRntNumber || !cooperativeHabilitacionNumber) {
        return { error: copy.missingFields }
      }
      const cooperativeFileError = validateComplianceFile(cooperativeFile)
      if (cooperativeFileError) return { error: cooperativeFileError }

      const cooperativeUpload = await uploadComplianceDocument(supabase, user.id, 'cooperativa', cooperativeFile!)
      if ('error' in cooperativeUpload) return { error: cooperativeUpload.error }
      uploadedPaths.push(cooperativeUpload.path)

      metadata = {
        license_plate: licensePlate,
        vehicle_type: vehicleType,
        phone,
        transport_tier: tier,
        cooperative_name: cooperativeName,
        cooperative_rnt_number: cooperativeRntNumber,
        cooperative_habilitacion_number: cooperativeHabilitacionNumber,
        cooperative_document_path: cooperativeUpload.path,
      }
    } else {
      const driverLicenseNumber = (formData.get('driver_license_number') as string | null)?.trim()
      const driverLicenseFile = formData.get('driver_license_document') as File | null
      const soatFile = formData.get('soat_document') as File | null
      if (!driverLicenseNumber) return { error: copy.missingFields }

      const licenseExpiry = validateExpiryDate(formData.get('driver_license_expiry') as string | null)
      if ('error' in licenseExpiry) return { error: licenseExpiry.error }

      const soatExpiry = validateExpiryDate(formData.get('soat_expiry_date') as string | null)
      if ('error' in soatExpiry) return { error: soatExpiry.error }

      const licenseFileError = validateComplianceFile(driverLicenseFile)
      if (licenseFileError) return { error: licenseFileError }
      const soatFileError = validateComplianceFile(soatFile)
      if (soatFileError) return { error: soatFileError }

      const licenseUpload = await uploadComplianceDocument(supabase, user.id, 'licencia', driverLicenseFile!)
      if ('error' in licenseUpload) return { error: licenseUpload.error }
      uploadedPaths.push(licenseUpload.path)

      const soatUpload = await uploadComplianceDocument(supabase, user.id, 'soat', soatFile!)
      if ('error' in soatUpload) {
        await rollbackUploads(supabase, uploadedPaths)
        return { error: soatUpload.error }
      }
      uploadedPaths.push(soatUpload.path)

      metadata = {
        license_plate: licensePlate,
        vehicle_type: vehicleType,
        phone,
        transport_tier: tier,
        driver_license_number: driverLicenseNumber,
        driver_license_expiry: licenseExpiry.value,
        driver_license_document_path: licenseUpload.path,
        soat_expiry_date: soatExpiry.value,
        soat_document_path: soatUpload.path,
      }
    }
  }

  if (requestedRole === 'tourist_guide') {
    const specialties = formData.getAll('specialties') as string[]
    const languages = formData.getAll('languages') as string[]
    const experienceYears = parseInt(formData.get('experience_years') as string, 10)
    const bio = (formData.get('bio') as string | null)?.trim()
    const rawPhone = (formData.get('phone') as string | null)?.trim()
    const rntNumber = (formData.get('rnt_number') as string | null)?.trim()
    const tarjetaNumber = (formData.get('tarjeta_profesional_number') as string | null)?.trim()
    const rntFile = formData.get('rnt_document') as File | null
    const tarjetaFile = formData.get('tarjeta_profesional_document') as File | null
    if (
      !specialties.length || !languages.length || !Number.isFinite(experienceYears) ||
      !bio || !rawPhone || !rntNumber || !tarjetaNumber
    ) {
      return { error: copy.missingFields }
    }
    if (experienceYears < 0 || experienceYears > MAX_EXPERIENCE_YEARS) {
      return { error: copy.invalidExperienceYears }
    }
    const phone = normalizeColombianPhone(rawPhone)
    if (!phone) return { error: copy.invalidPhone }

    const rntFileError = validateComplianceFile(rntFile)
    if (rntFileError) return { error: rntFileError }
    const tarjetaFileError = validateComplianceFile(tarjetaFile)
    if (tarjetaFileError) return { error: tarjetaFileError }

    const rntUpload = await uploadComplianceDocument(supabase, user.id, 'rnt', rntFile!)
    if ('error' in rntUpload) return { error: rntUpload.error }
    uploadedPaths.push(rntUpload.path)

    const tarjetaUpload = await uploadComplianceDocument(supabase, user.id, 'tarjeta-profesional', tarjetaFile!)
    if ('error' in tarjetaUpload) {
      await rollbackUploads(supabase, uploadedPaths)
      return { error: tarjetaUpload.error }
    }
    uploadedPaths.push(tarjetaUpload.path)

    metadata = {
      specialties,
      languages,
      experience_years: experienceYears,
      bio,
      phone,
      rnt_number: rntNumber,
      rnt_document_path: rntUpload.path,
      tarjeta_profesional_number: tarjetaNumber,
      tarjeta_profesional_document_path: tarjetaUpload.path,
    }
  }

  const notes = (formData.get('notes') as string | null)?.trim() || null

  const { error } = await supabase.from('role_requests').insert({
    user_id: user.id,
    requested_role: requestedRole,
    metadata,
    notes,
  })

  if (error) {
    await rollbackUploads(supabase, uploadedPaths)
    return { error: copy.generic }
  }

  revalidatePath('/solicitar-rol')
  return { success: true }
}
