'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import {
  sendPackagePrereservaConfirmedEmail,
  sendPackagePrereservaCancelledEmail,
  sendPackageBookingPaidEmail,
} from '@/lib/email/bookingEmails'
import { enqueueAndSendProviderPayout } from '@/lib/wompi/payouts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Only 'business'/'guide' are actually producible by a package_item today
// (transport is excluded from packages entirely — see Fase 1's schema
// comment in 20260903000000_create_packages.sql) — 'transporter' isn't in
// this allowlist since nothing in this queue can ever legitimately submit it.
const PROVIDER_TYPES = new Set(['business', 'guide'])

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

type BookingWithNames = {
  id: string
  package_id: string | null
  tourist_id: string
  booking_date: string
  packages: { name: string } | null
  profiles: { full_name: string | null } | null
}

async function loadBookingWithNames(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
): Promise<BookingWithNames | null> {
  const { data } = await admin
    .from('bookings')
    .select('id, package_id, tourist_id, booking_date, packages(name), profiles!tourist_id(full_name)')
    .eq('id', bookingId)
    .single()

  return (data as unknown as BookingWithNames) ?? null
}

async function getTouristEmail(
  admin: ReturnType<typeof createAdminClient>,
  touristId: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(touristId)
  return data.user?.email ?? null
}

// Confirms (providerType, providerId) actually belongs to a package_item of
// this booking's own package — an admin is trusted, but a toggle should
// still only be able to write availability for a provider genuinely part of
// the request in front of them, not an arbitrary id typed into devtools.
async function isProviderInBookingPackage(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  providerType: string,
  providerId: string,
): Promise<boolean> {
  const { data: booking } = await admin.from('bookings').select('package_id').eq('id', bookingId).single()
  if (!booking?.package_id) return false

  const { data: items } = await admin
    .from('package_items')
    .select('service_id, guide_tour_id, services(business_id), guide_tours(guide_id)')
    .eq('package_id', booking.package_id)

  return ((items ?? []) as unknown as {
    services: { business_id: string } | null
    guide_tours: { guide_id: string } | null
  }[]).some((item) =>
    providerType === 'business'
      ? item.services?.business_id === providerId
      : item.guide_tours?.guide_id === providerId,
  )
}

// Upserts a provider_availability row. Absence of a row means "available" by
// default (§7.0), so this is the only write the admin queue needs — a
// single toggle per package_item that records the opposite of whatever the
// UI is currently showing (defaulting to 'available' when no row exists yet).
export async function setProviderAvailability(formData: FormData): Promise<{ error: string } | void> {
  const { admin, adminId } = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.solicitudes.errors

  const bookingId = formData.get('bookingId') as string
  const providerType = formData.get('providerType') as string
  const providerId = formData.get('providerId') as string
  const date = formData.get('date') as string
  const status = formData.get('status') as string
  const notes = (formData.get('notes') as string | null)?.trim() || null

  if (!UUID_RE.test(bookingId) || !UUID_RE.test(providerId)) return { error: copy.notFound }
  if (!PROVIDER_TYPES.has(providerType)) return { error: copy.generic }
  if (status !== 'available' && status !== 'unavailable') return { error: copy.generic }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: copy.generic }

  if (!(await isProviderInBookingPackage(admin, bookingId, providerType, providerId))) {
    return { error: copy.notFound }
  }

  const { error } = await admin
    .from('provider_availability')
    .upsert(
      {
        provider_type: providerType,
        provider_id: providerId,
        date,
        status,
        source: 'admin_manual',
        notes,
        resolved_by: adminId,
      },
      { onConflict: 'provider_type,provider_id,date' },
    )

  if (error) return { error: copy.generic }

  revalidatePath('/admin/paquetes/solicitudes')
}

export async function confirmPackagePrereserva(formData: FormData): Promise<{ error: string } | void> {
  const { admin } = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.solicitudes.errors

  const bookingId = formData.get('bookingId') as string
  if (!UUID_RE.test(bookingId)) return { error: copy.notFound }

  const booking = await loadBookingWithNames(admin, bookingId)
  if (!booking || !booking.package_id) return { error: copy.notFound }

  const { error: rpcError } = await admin.rpc('confirm_package_prereserva', { p_booking_id: bookingId })

  if (rpcError) {
    if (rpcError.message === 'provider_unavailable') return { error: copy.providerUnavailable }
    if (rpcError.message === 'invalid_booking_state') return { error: copy.invalidBookingState }
    return { error: copy.generic }
  }

  const email = await getTouristEmail(admin, booking.tourist_id)
  if (email) {
    await sendPackagePrereservaConfirmedEmail(email, {
      packageName: booking.packages?.name ?? '',
      touristName: booking.profiles?.full_name ?? 'turista',
      bookingDate: booking.booking_date,
      bookingId: booking.id,
    })
  }

  revalidatePath('/admin/paquetes/solicitudes')
}

export async function cancelPackagePrereserva(formData: FormData): Promise<{ error: string } | void> {
  const { admin } = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.solicitudes.errors

  const bookingId = formData.get('bookingId') as string
  if (!UUID_RE.test(bookingId)) return { error: copy.notFound }

  const booking = await loadBookingWithNames(admin, bookingId)
  if (!booking || !booking.package_id) return { error: copy.notFound }

  const { data, error } = await admin
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId)
    .eq('status', 'pending_availability')
    .select('id')

  if (error) return { error: copy.generic }
  if (!data?.length) return { error: copy.invalidBookingState }

  const email = await getTouristEmail(admin, booking.tourist_id)
  if (email) {
    await sendPackagePrereservaCancelledEmail(email, {
      packageName: booking.packages?.name ?? '',
      touristName: booking.profiles?.full_name ?? 'turista',
      bookingDate: booking.booking_date,
    })
  }

  revalidatePath('/admin/paquetes/solicitudes')
}

// Fase 5: una fila de provider_payouts por cada proveedor ÚNICO de
// package_items del paquete, pagando la suma de sus internal_cost_cents —
// no un split de comisión (packages no usan commission_config; el margen de
// ManTur ya vive en base_price - Σinternal_cost_cents). package_items no
// tiene ninguna restricción que impida dos filas del mismo proveedor en un
// mismo paquete (ej. "desayuno" + "almuerzo" del mismo negocio) — la
// constraint UNIQUE(transaction_id, recipient_type, recipient_id) de
// provider_payouts encolaría la segunda como conflicto y la perdería en
// silencio si se llamara una vez por item, así que se agrupa y suma ANTES
// de encolar: como máximo una llamada por proveedor. Nunca falla la acción
// de "marcar pagada" — errores solo se loguean, misma postura que el envío
// de correo justo al lado (enqueueAndSendProviderPayout ya no lanza
// excepciones).
async function payoutPackageProviders(
  admin: ReturnType<typeof createAdminClient>,
  packageId: string,
  transactionId: string,
): Promise<void> {
  const { data: items } = await admin
    .from('package_items')
    .select('internal_cost_cents, services(business_id), guide_tours(guide_id)')
    .eq('package_id', packageId)

  const amountByProvider = new Map<string, { recipientType: 'business' | 'guide'; recipientId: string; amountCents: number }>()

  for (const item of (items ?? []) as unknown as {
    internal_cost_cents: number
    services: { business_id: string } | null
    guide_tours: { guide_id: string } | null
  }[]) {
    const recipientType = item.services ? 'business' : 'guide'
    const recipientId = item.services ? item.services.business_id : item.guide_tours?.guide_id
    if (!recipientId) continue

    const key = `${recipientType}:${recipientId}`
    const existing = amountByProvider.get(key)
    amountByProvider.set(key, {
      recipientType,
      recipientId,
      amountCents: (existing?.amountCents ?? 0) + item.internal_cost_cents,
    })
  }

  for (const provider of amountByProvider.values()) {
    await enqueueAndSendProviderPayout(admin, { transactionId, ...provider })
  }
}

export async function markPackageBookingPaid(formData: FormData): Promise<{ error: string } | void> {
  const { admin } = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.solicitudes.errors

  const bookingId = formData.get('bookingId') as string
  if (!UUID_RE.test(bookingId)) return { error: copy.notFound }

  const booking = await loadBookingWithNames(admin, bookingId)
  if (!booking || !booking.package_id) return { error: copy.notFound }

  const { error: rpcError } = await admin.rpc('mark_package_booking_paid', { p_booking_id: bookingId })

  if (rpcError) {
    if (rpcError.message === 'invalid_booking_state') return { error: copy.invalidBookingState }
    return { error: copy.generic }
  }

  const { data: transaction } = await admin
    .from('transactions')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (transaction?.id) {
    await payoutPackageProviders(admin, booking.package_id, transaction.id)
  } else {
    console.error('markPackageBookingPaid: no transaction found to pay providers out from', { bookingId })
  }

  const email = await getTouristEmail(admin, booking.tourist_id)
  if (email) {
    await sendPackageBookingPaidEmail(email, {
      packageName: booking.packages?.name ?? '',
      touristName: booking.profiles?.full_name ?? 'turista',
      bookingDate: booking.booking_date,
      bookingId: booking.id,
    })
  }

  revalidatePath('/admin/paquetes/solicitudes')
}
