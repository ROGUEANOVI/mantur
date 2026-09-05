'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingsCopy } from '@/lib/copy/bookings'
import { bookingRateLimit, checkRateLimit } from '@/lib/rate-limit'
import { buildWompiCheckoutUrl } from '@/lib/wompi/checkout'
import { sendPackagePrereservaRequestedEmail } from '@/lib/email/bookingEmails'

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

// Resolves every profile with role='admin' to their auth email — there's
// currently no dedicated "admin recipients" table, just the role column.
// Never throws: an email delivery problem must not break the tourist's own
// booking flow, same reasoning as notifyBusinessOfBooking in the Wompi
// webhook.
async function notifyAdminsOfPackagePrereserva(
  admin: ReturnType<typeof createAdminClient>,
  params: { packageName: string; touristId: string; bookingDate: string; quantity: number; notes: string | null },
): Promise<void> {
  try {
    const { data: adminProfiles, error: adminProfilesError } = await admin.from('profiles').select('id').eq('role', 'admin')
    if (adminProfilesError) {
      console.error('Failed to look up admin profiles for package prereserva notification', adminProfilesError)
      return
    }
    if (!adminProfiles?.length) return

    const { data: touristProfile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', params.touristId)
      .single<{ full_name: string | null }>()

    const adminEmails = (
      await Promise.all(
        adminProfiles.map(async ({ id }) => {
          const { data } = await admin.auth.admin.getUserById(id)
          return data.user?.email ?? null
        }),
      )
    ).filter((email): email is string => !!email)

    await Promise.all(
      adminEmails.map((email) =>
        sendPackagePrereservaRequestedEmail(email, {
          packageName: params.packageName,
          touristName: touristProfile?.full_name ?? 'Un turista',
          bookingDate: params.bookingDate,
          quantity: params.quantity,
          notes: params.notes,
        }),
      ),
    )
  } catch (error) {
    console.error('Unexpected error while notifying admins of a new package prereserva', error)
  }
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

  // Booking/transaction start as 'pending_payment'/'pending' — the Wompi
  // webhook (src/app/api/webhooks/wompi/route.ts), not this redirect, is
  // what confirms payment and flips them to 'confirmed'/'paid'. Both
  // inserts run inside one Postgres transaction via this RPC, so a
  // transactions-insert failure automatically rolls back the booking too —
  // no manual cleanup needed.
  const { data: bookingId, error: rpcError } = await admin.rpc('create_booking_with_transaction', {
    p_tourist_id: userId,
    p_service_id: serviceId,
    p_business_id: service.business_id,
    p_quantity: storedQuantity,
    p_booking_date: bookingDate,
    p_total_amount: totalAmount,
    p_booking_status: 'pending_payment',
    p_amount_in_cents: amountInCents,
    p_currency: 'COP',
    p_commission_rate: commissionRate,
    p_commission_amount_cents: commissionAmountCents,
    p_transaction_status: 'pending',
  })

  if (rpcError || !bookingId) return { error: bookingsCopy.errors.generic }

  revalidatePath('/mis-reservas')
  redirect(buildWompiCheckoutUrl({ bookingId, amountInCents, currency: 'COP' }))
}

// Packages are ManTur's own operator inventory with vetted providers, so
// unlike services/guide tours (WhatsApp-only since the manual-ops pivot,
// PR #110) they keep a real in-app pre-reserva flow (§7.0 of
// docs/wompi-alegra-integration-plan.md): this only creates the booking
// row in 'pending_availability' — no charge, no transactions row, no
// Wompi redirect. An admin confirms availability with each package_item's
// provider from /admin/paquetes/solicitudes before any money is involved.
export async function createPackagePrereserva(formData: FormData): Promise<BookingResult> {
  const { supabase, userId } = await getAuthenticatedTourist()

  const allowed = await checkRateLimit(bookingRateLimit, userId)
  if (!allowed) return { error: bookingsCopy.errors.rateLimited }

  const packageId = formData.get('package_id') as string
  if (!UUID_RE.test(packageId)) return { error: bookingsCopy.errors.packageNotFound }

  // Price and capacity are NEVER taken from FormData — read from DB.
  // packages_select RLS already filters to is_active = true.
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, base_price, pricing_unit, capacity')
    .eq('id', packageId)
    .single<{
      id: string
      name: string
      base_price: number
      pricing_unit: 'per_person' | 'per_night' | 'fixed'
      capacity: number | null
    }>()

  if (!pkg) return { error: bookingsCopy.errors.packageNotFound }

  const rawQuantity = formData.get('quantity') as string
  const quantity = parseInt(rawQuantity, 10)
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: bookingsCopy.errors.invalidQuantity }
  }
  if (pkg.capacity !== null && quantity > pkg.capacity) {
    return { error: bookingsCopy.errors.capacityExceeded }
  }

  const bookingDate = formData.get('booking_date') as string
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || bookingDate < today) {
    return { error: bookingsCopy.errors.invalidDate }
  }

  // Same per_person/per_night/fixed convention as createBooking() above.
  const totalAmount =
    pkg.pricing_unit === 'fixed' ? Number(pkg.base_price) : Number(pkg.base_price) * quantity
  const storedQuantity = pkg.pricing_unit === 'fixed' ? 1 : quantity

  const rawNotes = (formData.get('notes') as string | null)?.trim() || null

  const admin = createAdminClient()

  const { data: bookingId, error: rpcError } = await admin.rpc('create_package_prereserva', {
    p_tourist_id: userId,
    p_package_id: packageId,
    p_quantity: storedQuantity,
    p_booking_date: bookingDate,
    p_total_amount: totalAmount,
    p_notes: rawNotes,
  })

  if (rpcError || !bookingId) return { error: bookingsCopy.errors.generic }

  await notifyAdminsOfPackagePrereserva(admin, {
    packageName: pkg.name,
    touristId: userId,
    bookingDate,
    quantity: storedQuantity,
    notes: rawNotes,
  })

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
    p_booking_status: 'pending_payment',
    p_notes: rawNotes,
    p_amount_in_cents: amountInCents,
    p_currency: 'COP',
    p_commission_rate: commissionRate,
    p_commission_amount_cents: commissionAmountCents,
    p_transaction_status: 'pending',
  })

  if (rpcError || !bookingId) return { error: bookingsCopy.errors.generic }

  revalidatePath('/mis-reservas')
  redirect(buildWompiCheckoutUrl({ bookingId, amountInCents, currency: 'COP' }))
}
