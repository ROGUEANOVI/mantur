'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingsCopy } from '@/lib/copy/bookings'

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

  const experienceId = formData.get('experience_id') as string
  if (!UUID_RE.test(experienceId)) return { error: bookingsCopy.errors.notFound }

  // Read experience from DB — price and business_id are NEVER taken from FormData.
  // Filtering by status='active' ensures tourists can't book inactive experiences.
  const { data: exp } = await supabase
    .from('experiences')
    .select('id, price, capacity, status, business_id')
    .eq('id', experienceId)
    .eq('status', 'active')
    .single()

  if (!exp) return { error: bookingsCopy.errors.experienceUnavailable }

  const rawPeople = formData.get('people_count') as string
  const peopleCount = parseInt(rawPeople, 10)
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    return { error: bookingsCopy.errors.invalidPeople }
  }
  if (exp.capacity !== null && peopleCount > exp.capacity) {
    return { error: bookingsCopy.errors.capacityExceeded }
  }

  const bookingDate = formData.get('booking_date') as string
  // Use Bogotá timezone (UTC-5) so same-day bookings aren't rejected after 7 pm UTC.
  // The DB CHECK (booking_date >= CURRENT_DATE) is the authoritative server-side guard.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < today) {
    return { error: bookingsCopy.errors.invalidDate }
  }

  // Total is calculated server-side only — clients cannot influence the price.
  const totalAmount = Number(exp.price) * peopleCount
  const amountInCents = Math.round(totalAmount * 100)

  const admin = createAdminClient()

  // Commission rate is read via service_role RPC (EXECUTE revoked from PUBLIC).
  const { data: commissionRate, error: rateError } = await admin.rpc('get_commission_rate', {
    p_service_type: 'experience',
  })
  if (rateError || commissionRate === null) return { error: bookingsCopy.errors.generic }

  const commissionAmountCents = Math.round((amountInCents * Number(commissionRate)) / 100)

  // booking status is 'confirmed' because payment is simulated for the MVP.
  // When Wompi is integrated: change to 'pending_payment' and redirect to the payment link.
  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      experience_id: experienceId,
      tourist_id: userId,
      business_id: exp.business_id,
      people_count: peopleCount,
      booking_date: bookingDate,
      total_amount: totalAmount,
      status: 'confirmed',
    })
    .select('id')
    .single()

  if (bookingError || !booking) return { error: bookingsCopy.errors.generic }

  const { error: txError } = await admin.from('transactions').insert({
    booking_id: booking.id,
    status: 'paid',
    amount_in_cents: amountInCents,
    currency: 'COP',
    commission_rate: commissionRate,
    commission_amount_cents: commissionAmountCents,
  })

  if (txError) {
    // Rollback the booking if the transaction record fails to keep them in sync.
    await admin.from('bookings').delete().eq('id', booking.id)
    return { error: bookingsCopy.errors.generic }
  }

  revalidatePath('/mis-reservas')
  redirect(`/reservas/${booking.id}/confirmacion`)
}

export async function createGuideTourBooking(formData: FormData): Promise<BookingResult> {
  const { supabase, userId } = await getAuthenticatedTourist()

  const guideTourId = formData.get('guide_tour_id') as string
  if (!UUID_RE.test(guideTourId)) return { error: bookingsCopy.errors.notFound }

  const { data: tour } = await supabase
    .from('guide_tours')
    .select('id, price, capacity, status, guide_id')
    .eq('id', guideTourId)
    .eq('status', 'active')
    .single()

  if (!tour) return { error: bookingsCopy.errors.experienceUnavailable }

  const rawPeople = formData.get('people_count') as string
  const peopleCount = parseInt(rawPeople, 10)
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    return { error: bookingsCopy.errors.invalidPeople }
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

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      guide_tour_id: guideTourId,
      guide_id: tour.guide_id,
      tourist_id: userId,
      people_count: peopleCount,
      booking_date: bookingDate,
      total_amount: totalAmount,
      status: 'confirmed',
      notes: rawNotes,
    })
    .select('id')
    .single()

  if (bookingError || !booking) return { error: bookingsCopy.errors.generic }

  const { error: txError } = await admin.from('transactions').insert({
    booking_id: booking.id,
    status: 'paid',
    amount_in_cents: amountInCents,
    currency: 'COP',
    commission_rate: commissionRate,
    commission_amount_cents: commissionAmountCents,
  })

  if (txError) {
    await admin.from('bookings').delete().eq('id', booking.id)
    return { error: bookingsCopy.errors.generic }
  }

  revalidatePath('/mis-reservas')
  redirect(`/reservas/${booking.id}/confirmacion`)
}
