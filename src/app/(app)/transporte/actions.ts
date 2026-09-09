'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transportCopy } from '@/lib/copy/transport'
import { transportRequestRateLimit, transporterReviewRateLimit, checkRateLimit } from '@/lib/rate-limit'

type ActionResult = { error: string } | void
type ReviewResult = { error: string } | { success: true }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthenticatedTourist() {
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

  if (profile?.role !== 'tourist') redirect('/')

  return { supabase, userId: user.id }
}

const VALID_TRIP_TYPES = new Set(['one_way', 'round_trip'])

export async function createTransportRequest(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedTourist()

  const allowed = await checkRateLimit(transportRequestRateLimit, userId)
  if (!allowed) return { error: transportCopy.errors.rateLimited }

  const copy = transportCopy.errors

  const tripType = (formData.get('trip_type') as string | null) || 'one_way'
  if (!VALID_TRIP_TYPES.has(tripType)) return { error: copy.missingFields }

  // A route is optional — a tourist can still request a free-text ride with
  // no transporter chosen yet, same as before this field existed. When a
  // route IS chosen, its own origin/destination/modalities are the source
  // of truth server-side (never trust a client-editable origin/destination
  // alongside a routeId — the whole point of picking a published route is
  // that its details are fixed).
  const routeId = (formData.get('transporter_route_id') as string | null)?.trim() || null
  let origin = (formData.get('origin') as string)?.trim()
  let destination = (formData.get('destination') as string)?.trim()

  if (routeId) {
    if (!UUID_RE.test(routeId)) return { error: copy.missingFields }

    const { data: route } = await supabase
      .from('transporter_routes')
      .select('origin, destination, allows_one_way, allows_round_trip')
      .eq('id', routeId)
      .eq('status', 'active')
      .single<{ origin: string; destination: string; allows_one_way: boolean; allows_round_trip: boolean }>()

    if (!route) return { error: copy.requestNotFound }

    const modalityAllowed = tripType === 'round_trip' ? route.allows_round_trip : route.allows_one_way
    if (!modalityAllowed) return { error: copy.missingFields }

    origin = route.origin
    destination = route.destination
  }

  const rawDatetime = (formData.get('requested_datetime') as string)?.trim()
  const rawPeople = formData.get('people_count') as string
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!origin || !destination || !rawDatetime) return { error: copy.missingFields }

  const requestedDatetime = new Date(rawDatetime)
  if (isNaN(requestedDatetime.getTime()) || requestedDatetime <= new Date()) {
    return { error: copy.invalidDatetime }
  }

  const peopleCount = parseInt(rawPeople, 10)
  if (!Number.isInteger(peopleCount) || peopleCount < 1 || peopleCount > 20) {
    return { error: copy.missingFields }
  }

  const { error } = await supabase.from('transport_requests').insert({
    tourist_id: userId,
    origin,
    destination,
    requested_datetime: requestedDatetime.toISOString(),
    people_count: peopleCount,
    notes,
    transporter_route_id: routeId,
    trip_type: tripType,
  })

  if (error) return { error: copy.generic }

  revalidatePath('/mis-viajes')
  redirect('/mis-viajes')
}

export async function cancelTransportRequest(formData: FormData): Promise<void> {
  const { supabase } = await getAuthenticatedTourist()

  const requestId = formData.get('requestId') as string
  if (!UUID_RE.test(requestId)) redirect('/mis-viajes')

  await supabase
    .from('transport_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('status', 'pending')

  revalidatePath('/mis-viajes')
}

// Extends the review system to transporters (see
// 20260918000000_create_transporter_reviews.sql). Deliberately gated on
// transport_requests.status = 'completed', not on bookings — transport
// payment (createTransportBooking in reservas/actions.ts) is dormant, so
// no transport_requests row ever gets a paid bookings.status='confirmed'
// counterpart today. completed is the real, live signal a ride happened,
// set by markCompleted() in mi-perfil-transporte/actions.ts regardless of
// how the ride was paid for.
export async function createTransporterReview(formData: FormData): Promise<ReviewResult> {
  const { userId } = await getAuthenticatedTourist()

  const allowed = await checkRateLimit(transporterReviewRateLimit, userId)
  if (!allowed) return { error: transportCopy.review.errors.rateLimited }

  const transportRequestId = formData.get('transport_request_id') as string
  if (!UUID_RE.test(transportRequestId)) return { error: transportCopy.review.errors.notEligible }

  const ratingRaw = Number(formData.get('rating'))
  if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    return { error: transportCopy.review.errors.invalidRating }
  }

  const comment = (formData.get('comment') as string | null)?.trim().slice(0, 500) || null

  const admin = createAdminClient()

  const { data: request } = await admin
    .from('transport_requests')
    .select('id, tourist_id, transporter_id, status')
    .eq('id', transportRequestId)
    .single()

  if (!request || request.tourist_id !== userId || !request.transporter_id) {
    return { error: transportCopy.review.errors.notEligible }
  }
  if (request.status !== 'completed') return { error: transportCopy.review.errors.notEligible }

  const { error: insertError } = await admin.from('transporter_reviews').insert({
    transporter_id: request.transporter_id,
    transport_request_id: transportRequestId,
    tourist_id: userId,
    rating: ratingRaw,
    comment,
  })

  if (insertError) {
    // 23505 = unique_violation on transporter_reviews.transport_request_id
    // — this ride already has a review.
    if (insertError.code === '23505') return { error: transportCopy.review.errors.alreadyReviewed }
    return { error: transportCopy.review.errors.generic }
  }

  revalidatePath('/mis-viajes')
  return { success: true }
}
