'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import { bookingRateLimit, checkRateLimit } from '@/lib/rate-limit'

type BookingResult = { error: string } | void

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

export async function createBooking(formData: FormData): Promise<BookingResult> {
  const { supabase, userId } = await getAuthenticatedTourist()

  const allowed = await checkRateLimit(bookingRateLimit, userId)
  if (!allowed) return { error: bookingsCopy.errors.rateLimited }

  const serviceId = formData.get('service_id') as string
  if (!UUID_RE.test(serviceId)) return { error: bookingsCopy.errors.notFound }

  // Read service from DB — price and business_id are NEVER taken from FormData.
  // Filtering by status='active' ensures tourists can't book inactive services.
  const { data: service } = await supabase
    .from('services')
    .select('id, base_price, capacity, status, business_id, service_types(slug, pricing_unit)')
    .eq('id', serviceId)
    .eq('status', 'active')
    .single<{
      id: string
      base_price: number
      capacity: number | null
      status: string
      business_id: string
      service_types: { slug: string; pricing_unit: 'per_person' | 'per_night' | 'fixed' } | null
    }>()

  if (!service || !service.service_types) return { error: bookingsCopy.errors.unavailable }

  const rawQuantity = formData.get('quantity') as string
  const quantity = parseInt(rawQuantity, 10)
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: bookingsCopy.errors.invalidQuantity }
  }
  if (service.capacity !== null && quantity > service.capacity) {
    return { error: bookingsCopy.errors.capacityExceeded }
  }

  const bookingDate = formData.get('booking_date') as string
  // Use Bogotá timezone (UTC-5) so same-day bookings aren't rejected after 7 pm UTC.
  // The DB CHECK (booking_date >= CURRENT_DATE) is the authoritative server-side guard.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < today) {
    return { error: bookingsCopy.errors.invalidDate }
  }

  const pricingUnit = service.service_types.pricing_unit

  // Total is calculated server-side only — clients cannot influence the price.
  // 'fixed' services are priced as a whole regardless of headcount/nights; the
  // stored quantity is forced to 1 so it stays a meaningful "units purchased"
  // value (the capacity check above still ran against the real submitted
  // quantity, e.g. attendee count for an event rental).
  const totalAmount = pricingUnit === 'fixed' ? Number(service.base_price) : Number(service.base_price) * quantity
  const storedQuantity = pricingUnit === 'fixed' ? 1 : quantity
  const amountInCents = Math.round(totalAmount * 100)

  const admin = createAdminClient()

  // Commission rate is read via service_role RPC (EXECUTE revoked from PUBLIC).
  // Keyed by the service's own type slug, so admin can set a different
  // commission % per service type via /admin/comisiones.
  const { data: commissionRate, error: rateError } = await admin.rpc('get_commission_rate', {
    p_service_type: service.service_types.slug,
  })
  if (rateError || commissionRate === null) return { error: bookingsCopy.errors.generic }

  const commissionAmountCents = Math.round((amountInCents * Number(commissionRate)) / 100)

  // booking/transaction status are 'confirmed'/'paid' because payment is
  // simulated for the MVP. When Wompi is integrated: pass 'pending_payment'/
  // 'pending' instead and redirect to the payment link rather than to
  // confirmation. Both inserts run inside one Postgres transaction via this
  // RPC, so a transactions-insert failure automatically rolls back the
  // booking too — no manual cleanup needed.
  const { data: bookingId, error: rpcError } = await admin.rpc('create_booking_with_transaction', {
    p_tourist_id: userId,
    p_service_id: serviceId,
    p_business_id: service.business_id,
    p_quantity: storedQuantity,
    p_booking_date: bookingDate,
    p_total_amount: totalAmount,
    p_booking_status: 'confirmed',
    p_amount_in_cents: amountInCents,
    p_currency: 'COP',
    p_commission_rate: commissionRate,
    p_commission_amount_cents: commissionAmountCents,
    p_transaction_status: 'paid',
  })

  if (rpcError || !bookingId) return { error: bookingsCopy.errors.generic }

  revalidatePath('/mis-reservas')
  redirect(`/reservas/${bookingId}/confirmacion`)
}

export async function createGuideTourBooking(formData: FormData): Promise<BookingResult> {
  const { supabase, userId } = await getAuthenticatedTourist()

  const allowed = await checkRateLimit(bookingRateLimit, userId)
  if (!allowed) return { error: bookingsCopy.errors.rateLimited }

  const guideTourId = formData.get('guide_tour_id') as string
  if (!UUID_RE.test(guideTourId)) return { error: bookingsCopy.errors.notFound }

  const { data: tour } = await supabase
    .from('guide_tours')
    .select('id, price, capacity, status, guide_id')
    .eq('id', guideTourId)
    .eq('status', 'active')
    .single()

  if (!tour) return { error: bookingsCopy.errors.unavailable }

  const rawPeople = formData.get('people_count') as string
  const peopleCount = parseInt(rawPeople, 10)
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    return { error: bookingsCopy.errors.invalidQuantity }
  }
  if (tour.capacity !== null && peopleCount > tour.capacity) {
    return { error: bookingsCopy.errors.capacityExceeded }
  }

  const bookingDate = formData.get('booking_date') as string
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < today) {
    return { error: bookingsCopy.errors.invalidDate }
  }

  const totalAmount = Number(tour.price) * peopleCount
  const amountInCents = Math.round(totalAmount * 100)

  const admin = createAdminClient()

  const { data: commissionRate, error: rateError } = await admin.rpc('get_commission_rate', {
    p_service_type: 'guide_tour',
  })
  if (rateError || commissionRate === null) return { error: bookingsCopy.errors.generic }

  const commissionAmountCents = Math.round((amountInCents * Number(commissionRate)) / 100)

  const rawNotes = (formData.get('notes') as string | null)?.trim() || null

  const { data: bookingId, error: rpcError } = await admin.rpc('create_booking_with_transaction', {
    p_tourist_id: userId,
    p_guide_tour_id: guideTourId,
    p_guide_id: tour.guide_id,
    p_quantity: peopleCount,
    p_booking_date: bookingDate,
    p_total_amount: totalAmount,
    p_booking_status: 'confirmed',
    p_notes: rawNotes,
    p_amount_in_cents: amountInCents,
    p_currency: 'COP',
    p_commission_rate: commissionRate,
    p_commission_amount_cents: commissionAmountCents,
    p_transaction_status: 'paid',
  })

  if (rpcError || !bookingId) return { error: bookingsCopy.errors.generic }

  revalidatePath('/mis-reservas')
  redirect(`/reservas/${bookingId}/confirmacion`)
}
