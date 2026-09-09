'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transportCopy } from '@/lib/copy/transport'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { AVAILABILITY_DATE_RE, AVAILABILITY_STATUSES, WEEKDAYS } from '@/lib/validation'

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

  // Optional quoted price (pesos, converted to cents) — lets
  // createTransportBooking charge for this ride once in-platform transport
  // payment gets wired in (see that Server Action's own comment; it stays
  // dormant regardless of whether a price is quoted here). Absent/invalid
  // input is silently treated as "not quoted yet", same as the existing
  // cash-only flow when this field didn't exist at all.
  const pricePesosRaw = formData.get('price_pesos') as string | null
  const pricePesos = pricePesosRaw ? Number(pricePesosRaw) : null
  const priceCents =
    pricePesos !== null && Number.isFinite(pricePesos) && pricePesos > 0 ? Math.round(pricePesos * 100) : null

  const admin = createAdminClient()

  // Atomic claim: only succeeds if the request is still pending.
  // Postgres UPDATE is row-level atomic so only one transporter wins the race.
  // If data is empty, the request was already accepted — revalidate silently
  // so the transporter sees the updated list without the claimed request.
  await admin
    .from('transport_requests')
    .update({ transporter_id: transporterId, status: 'accepted', price_cents: priceCents })
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

// ── Availability ─────────────────────────────────────────────────────────
// Calco de setBusinessAvailability/setGuideAvailability (mi-negocio/actions.ts,
// mi-perfil-guia/actions.ts) — transporter gets its own self-service general
// calendar for the first time (20260920000000 widened
// provider_availability_*_own to cover 'transporter', which
// 20260908000000 had excluded on purpose back when transport never
// participated in packages).

export async function setTransporterAvailability(formData: FormData): Promise<ActionResult> {
  const copy = transportCopy.availability.errors
  const { supabase, userId, transporterId } = await getAuthenticatedTransporter()

  const date = formData.get('date') as string
  const status = formData.get('status') as string
  if (!AVAILABILITY_DATE_RE.test(date)) return { error: copy.generic }
  if (!AVAILABILITY_STATUSES.has(status)) return { error: copy.generic }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (date < today) return { error: copy.pastDate }

  const { error } = await supabase.from('provider_availability').upsert(
    {
      provider_type: 'transporter',
      provider_id: transporterId,
      date,
      status,
      source: 'provider_self_service',
      resolved_by: userId,
    },
    { onConflict: 'provider_type,provider_id,date' },
  )

  if (error) return { error: copy.generic }

  revalidatePath('/mi-perfil-transporte/disponibilidad')
}

// Weekly recurring counterpart — see setBusinessWeeklyAvailability
// (mi-negocio/actions.ts) for the full rationale.
export async function setTransporterWeeklyAvailability(formData: FormData): Promise<ActionResult> {
  const copy = transportCopy.availability.errors
  const { supabase, transporterId } = await getAuthenticatedTransporter()

  const rawWeekday = formData.get('weekday') as string
  const weekday = parseInt(rawWeekday, 10)
  const status = formData.get('status') as string
  if (!WEEKDAYS.has(weekday)) return { error: copy.generic }
  if (!AVAILABILITY_STATUSES.has(status)) return { error: copy.generic }

  const { error } = await supabase.from('provider_weekly_availability').upsert(
    {
      provider_type: 'transporter',
      provider_id: transporterId,
      weekday,
      status,
      source: 'provider_self_service',
    },
    { onConflict: 'provider_type,provider_id,weekday' },
  )

  if (error) return { error: copy.generic }

  revalidatePath('/mi-perfil-transporte/disponibilidad')
}

// Item-level counterpart, for a single route rather than the whole
// transporter. Ownership verified through the
// transporter_route→transporters→profile_id chain, mirroring
// provider_availability_insert_own/_update_own's own 'transporter_route'
// branch (20260920000000).
export async function setTransporterRouteAvailability(formData: FormData): Promise<ActionResult> {
  const copy = transportCopy.routeAvailability.errors
  const routeId = formData.get('providerId') as string
  if (!UUID_RE.test(routeId)) return { error: copy.notFound }

  const { supabase, userId, transporterId } = await getAuthenticatedTransporter()

  const date = formData.get('date') as string
  const status = formData.get('status') as string
  if (!AVAILABILITY_DATE_RE.test(date)) return { error: copy.generic }
  if (!AVAILABILITY_STATUSES.has(status)) return { error: copy.generic }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (date < today) return { error: copy.pastDate }

  const { data: route } = await supabase
    .from('transporter_routes')
    .select('id')
    .eq('id', routeId)
    .eq('transporter_id', transporterId)
    .maybeSingle()

  if (!route) return { error: copy.notFound }

  const { error } = await supabase.from('provider_availability').upsert(
    {
      provider_type: 'transporter_route',
      provider_id: routeId,
      date,
      status,
      source: 'provider_self_service',
      resolved_by: userId,
    },
    { onConflict: 'provider_type,provider_id,date' },
  )

  if (error) return { error: copy.generic }

  revalidatePath(`/mi-perfil-transporte/rutas/${routeId}/disponibilidad`)
}

// ── Routes ───────────────────────────────────────────────────────────────
// transporter_routes is the transporter's own published menu — the third
// leg of business→services / guide→guide_tours symmetry
// (20260920000000_add_item_availability_and_transporter_routes.sql).

// Same upper bound as mi-perfil-guia/actions.ts's local parsePrice — without
// one, a large enough value overflows the integer price_*_cents columns
// (~2.1B max) once multiplied by 100, turning a validation gap into a raw DB
// error surfaced as the generic message.
const MAX_ROUTE_PRICE_PESOS = 100_000_000

function parseRoutePriceCents(raw: string | null): number | null | false {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0 || n > MAX_ROUTE_PRICE_PESOS) return false
  return Math.round(n * 100)
}

const MAX_ROUTE_DURATION_MINUTES = 1440

function parseRouteDuration(raw: string | null): number | null | false {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const n = parseInt(trimmed, 10)
  if (!Number.isInteger(n) || n <= 0 || n > MAX_ROUTE_DURATION_MINUTES) return false
  return n
}

type RouteActionResult = { error: string } | void

export async function createTransporterRoute(formData: FormData): Promise<RouteActionResult> {
  const copy = transportCopy.routes.errors
  const { supabase, transporterId } = await getAuthenticatedTransporter()

  const origin = (formData.get('origin') as string | null)?.trim() || ''
  const destination = (formData.get('destination') as string | null)?.trim() || ''
  if (!origin || !destination) return { error: copy.missingFields }

  const allowsOneWay = formData.get('allows_one_way') === 'on'
  const allowsRoundTrip = formData.get('allows_round_trip') === 'on'
  if (!allowsOneWay && !allowsRoundTrip) return { error: copy.noModality }

  const priceOneWayCents = parseRoutePriceCents(formData.get('price_one_way') as string | null)
  if (priceOneWayCents === false) return { error: copy.invalidPrice }
  const priceRoundTripCents = parseRoutePriceCents(formData.get('price_round_trip') as string | null)
  if (priceRoundTripCents === false) return { error: copy.invalidPrice }

  const durationMinutes = parseRouteDuration(formData.get('estimated_duration_minutes') as string | null)
  if (durationMinutes === false) return { error: copy.invalidDuration }

  const notes = (formData.get('notes') as string | null)?.trim() || null

  const { error } = await supabase.from('transporter_routes').insert({
    transporter_id: transporterId,
    origin,
    destination,
    allows_one_way: allowsOneWay,
    allows_round_trip: allowsRoundTrip,
    price_one_way_cents: allowsOneWay ? priceOneWayCents : null,
    price_round_trip_cents: allowsRoundTrip ? priceRoundTripCents : null,
    estimated_duration_minutes: durationMinutes,
    notes,
    status: 'active',
  })

  if (error) return { error: copy.generic }

  revalidatePath('/mi-perfil-transporte/rutas')
  redirect('/mi-perfil-transporte/rutas')
}

export async function updateTransporterRoute(
  routeId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const copy = transportCopy.routes.errors
  if (!UUID_RE.test(routeId)) return { error: copy.notFound }

  const { supabase, transporterId } = await getAuthenticatedTransporter()

  const origin = (formData.get('origin') as string | null)?.trim() || ''
  const destination = (formData.get('destination') as string | null)?.trim() || ''
  if (!origin || !destination) return { error: copy.missingFields }

  const allowsOneWay = formData.get('allows_one_way') === 'on'
  const allowsRoundTrip = formData.get('allows_round_trip') === 'on'
  if (!allowsOneWay && !allowsRoundTrip) return { error: copy.noModality }

  const priceOneWayCents = parseRoutePriceCents(formData.get('price_one_way') as string | null)
  if (priceOneWayCents === false) return { error: copy.invalidPrice }
  const priceRoundTripCents = parseRoutePriceCents(formData.get('price_round_trip') as string | null)
  if (priceRoundTripCents === false) return { error: copy.invalidPrice }

  const durationMinutes = parseRouteDuration(formData.get('estimated_duration_minutes') as string | null)
  if (durationMinutes === false) return { error: copy.invalidDuration }

  const notes = (formData.get('notes') as string | null)?.trim() || null

  const { data, error } = await supabase
    .from('transporter_routes')
    .update({
      origin,
      destination,
      allows_one_way: allowsOneWay,
      allows_round_trip: allowsRoundTrip,
      price_one_way_cents: allowsOneWay ? priceOneWayCents : null,
      price_round_trip_cents: allowsRoundTrip ? priceRoundTripCents : null,
      estimated_duration_minutes: durationMinutes,
      notes,
    })
    .eq('id', routeId)
    .eq('transporter_id', transporterId)
    .select('id')

  if (error || !data?.length) return { error: copy.generic }

  revalidatePath('/mi-perfil-transporte/rutas')
  return { success: true }
}

export async function toggleTransporterRouteStatus(
  routeId: string,
  currentStatus: 'active' | 'inactive',
): Promise<RouteActionResult> {
  const copy = transportCopy.routes.errors
  if (!UUID_RE.test(routeId)) return { error: copy.notFound }

  const { supabase, transporterId } = await getAuthenticatedTransporter()

  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'

  const { data, error } = await supabase
    .from('transporter_routes')
    .update({ status: newStatus })
    .eq('id', routeId)
    .eq('transporter_id', transporterId)
    .select('id')

  if (error || !data?.length) return { error: copy.generic }

  revalidatePath('/mi-perfil-transporte/rutas')
}

// ── Payout account ────────────────────────────────────────────────────────
// Calco de saveGuidePayoutAccount (mi-perfil-guia/actions.ts) — mismas
// validaciones, mismo patrón wompi_bank_id vía listPayoutBanks(), mismo
// upsert por PK (transporter_id).

const VALID_ACCOUNT_TYPES = new Set(['ahorros', 'corriente'])
const VALID_HOLDER_ID_TYPES = new Set(['CC', 'CE', 'NIT'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACCOUNT_NUMBER_RE = /^(?!0+$)\d+$/
const HOLDER_ID_NUMBER_RE = /^[\d-]{5,20}$/

type PayoutActionResult = { error: string } | { success: true }

export async function saveTransporterPayoutAccount(formData: FormData): Promise<PayoutActionResult> {
  const { supabase, transporterId } = await getAuthenticatedTransporter()

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

  const { error } = await supabase.from('transporter_payout_accounts').upsert(
    {
      transporter_id: transporterId,
      bank_name: bankName,
      wompi_bank_id: wompiBankId,
      account_type: accountType,
      account_number: accountNumber,
      holder_id_type: holderIdType,
      holder_id_number: holderIdNumber,
      holder_name: holderName,
      holder_email: holderEmail,
    },
    { onConflict: 'transporter_id' },
  )

  if (error) return { error: 'No se pudo guardar la cuenta de pagos. Intenta de nuevo.' }

  revalidatePath('/mi-perfil-transporte/editar')
  return { success: true }
}
