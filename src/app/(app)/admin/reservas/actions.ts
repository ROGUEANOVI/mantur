'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { bookingsCopy } from '@/lib/copy/bookings'
import { adminCopy } from '@/lib/copy/admin'
import { getBlockedDates } from '@/lib/availability'
import {
  notifyBusinessOfServicePrereserva,
  notifyGuideOfTourPrereserva,
} from '@/app/(app)/reservas/actions'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const copy = adminCopy.reservas

type BookingResult = { error: string } | { success: true }

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
  return createAdminClient()
}

// Validates the admin-picked touristId against profiles rather than trusting
// the client — same posture as every other admin action reading FormData
// ids (see createManualServiceBooking/createManualGuideTourBooking below).
async function validateTourist(
  admin: ReturnType<typeof createAdminClient>,
  touristId: string,
): Promise<boolean> {
  if (!UUID_RE.test(touristId)) return false
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('id', touristId)
    .eq('role', 'tourist')
    .single()
  return data != null
}

export type TouristSearchResult = { id: string; full_name: string | null; phone: string | null }

// No search/typeahead over profiles exists elsewhere in the app — profiles
// carries no email column (email lives only in auth.users) and phone lives
// in profile_contact_details (moved out in
// 20260814000000_move_profiles_phone_to_contact_details.sql), so this
// merges two lookups: by name on profiles, by digits on
// profile_contact_details. Good enough to disambiguate tourists in a small
// town without needing an email search.
export async function searchTourists(query: string): Promise<TouristSearchResult[]> {
  const admin = await getAuthenticatedAdmin()

  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const byName = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'tourist')
    .ilike('full_name', `%${trimmed}%`)
    .limit(10)

  const digits = trimmed.replace(/\D/g, '')
  const byPhone =
    digits.length >= 3
      ? await admin
          .from('profile_contact_details')
          .select('profile_id, phone, profiles!inner(id, full_name, role)')
          .eq('profiles.role', 'tourist')
          .ilike('phone', `%${digits}%`)
          .limit(10)
      : { data: [] }

  const results = new Map<string, TouristSearchResult>()
  for (const row of byName.data ?? []) {
    results.set(row.id, { id: row.id, full_name: row.full_name, phone: null })
  }
  for (const row of (byPhone.data ?? []) as unknown as {
    profile_id: string
    phone: string
    profiles: { id: string; full_name: string | null }
  }[]) {
    const existing = results.get(row.profile_id)
    results.set(row.profile_id, {
      id: row.profile_id,
      full_name: existing?.full_name ?? row.profiles.full_name,
      phone: row.phone,
    })
  }

  // Backfill phone for name-matched results so every row can display it.
  const missingPhoneIds = [...results.values()].filter((r) => r.phone === null).map((r) => r.id)
  if (missingPhoneIds.length > 0) {
    const { data: contactRows } = await admin
      .from('profile_contact_details')
      .select('profile_id, phone')
      .in('profile_id', missingPhoneIds)
    for (const row of contactRows ?? []) {
      const existing = results.get(row.profile_id)
      if (existing) existing.phone = row.phone
    }
  }

  return [...results.values()].slice(0, 10)
}

export async function getItemBlockedDates(
  itemType: 'service' | 'guide_tour',
  itemId: string,
): Promise<string[]> {
  const admin = await getAuthenticatedAdmin()
  if (!UUID_RE.test(itemId)) return []

  if (itemType === 'service') {
    const { data: service } = await admin
      .from('services')
      .select('business_id')
      .eq('id', itemId)
      .single<{ business_id: string }>()
    if (!service) return []
    return getBlockedDates(admin, 'service', itemId, 'business', service.business_id)
  }

  const { data: tour } = await admin
    .from('guide_tours')
    .select('guide_id')
    .eq('id', itemId)
    .single<{ guide_id: string }>()
  if (!tour) return []
  return getBlockedDates(admin, 'guide_tour', itemId, 'guide', tour.guide_id)
}

// Mirrors createServicePrereserva (src/app/(app)/reservas/actions.ts) —
// same validation, same RPC, same notification — but the tourist comes from
// an admin-picked id (validated against profiles) instead of the session,
// and there's no rate limit (low-volume admin usage) or redirect (the admin
// form stays on the page to register the next WhatsApp deal).
export async function createManualServiceBooking(formData: FormData): Promise<BookingResult> {
  const admin = await getAuthenticatedAdmin()

  const touristId = formData.get('tourist_id') as string
  if (!touristId) return { error: copy.errors.touristRequired }
  if (!(await validateTourist(admin, touristId))) return { error: copy.errors.touristNotFound }

  const serviceId = formData.get('service_id') as string
  if (!UUID_RE.test(serviceId)) return { error: copy.errors.itemRequired }

  const { data: service } = await admin
    .from('services')
    .select('id, name, base_price, capacity, status, business_id, service_types(slug, pricing_unit)')
    .eq('id', serviceId)
    .eq('status', 'active')
    .single<{
      id: string
      name: string
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
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < today) {
    return { error: bookingsCopy.errors.invalidDate }
  }

  const pricingUnit = service.service_types.pricing_unit
  const totalAmount = pricingUnit === 'fixed' ? Number(service.base_price) : Number(service.base_price) * quantity
  const storedQuantity = pricingUnit === 'fixed' ? 1 : quantity

  const rawNotes = (formData.get('notes') as string | null)?.trim() || null

  const { data: bookingId, error: rpcError } = await admin.rpc('create_service_prereserva', {
    p_tourist_id: touristId,
    p_service_id: serviceId,
    p_quantity: storedQuantity,
    p_booking_date: bookingDate,
    p_total_amount: totalAmount,
    p_notes: rawNotes,
  })

  if (rpcError || !bookingId) {
    if (rpcError?.message === 'date_unavailable') return { error: bookingsCopy.errors.unavailable }
    if (rpcError?.message === 'capacity_exceeded') return { error: bookingsCopy.errors.capacityExceeded }
    return { error: bookingsCopy.errors.generic }
  }

  await notifyBusinessOfServicePrereserva(admin, {
    businessId: service.business_id,
    serviceName: service.name,
    touristId,
    bookingDate,
    quantity: storedQuantity,
    notes: rawNotes,
  })

  return { success: true }
}

// Mirrors createGuideTourPrereserva — see createManualServiceBooking above
// for the rationale on how this differs from the tourist-facing action.
export async function createManualGuideTourBooking(formData: FormData): Promise<BookingResult> {
  const admin = await getAuthenticatedAdmin()

  const touristId = formData.get('tourist_id') as string
  if (!touristId) return { error: copy.errors.touristRequired }
  if (!(await validateTourist(admin, touristId))) return { error: copy.errors.touristNotFound }

  const guideTourId = formData.get('guide_tour_id') as string
  if (!UUID_RE.test(guideTourId)) return { error: copy.errors.itemRequired }

  const { data: tour } = await admin
    .from('guide_tours')
    .select('id, name, price, capacity, status, guide_id')
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
  const rawNotes = (formData.get('notes') as string | null)?.trim() || null

  const { data: bookingId, error: rpcError } = await admin.rpc('create_guide_tour_prereserva', {
    p_tourist_id: touristId,
    p_guide_tour_id: guideTourId,
    p_quantity: peopleCount,
    p_booking_date: bookingDate,
    p_total_amount: totalAmount,
    p_notes: rawNotes,
  })

  if (rpcError || !bookingId) {
    if (rpcError?.message === 'date_unavailable') return { error: bookingsCopy.errors.unavailable }
    if (rpcError?.message === 'capacity_exceeded') return { error: bookingsCopy.errors.capacityExceeded }
    return { error: bookingsCopy.errors.generic }
  }

  await notifyGuideOfTourPrereserva(admin, {
    guideId: tour.guide_id,
    tourName: tour.name,
    touristId,
    bookingDate,
    quantity: peopleCount,
    notes: rawNotes,
  })

  return { success: true }
}
