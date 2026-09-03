import Link from 'next/link'
import { ChevronLeft, CalendarClock, Banknote } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import PackageSolicitudCard from '@/components/admin/PackageSolicitudCard'

const copy = adminCopy.paquetes.solicitudes

type BookingRow = {
  id: string
  booking_date: string
  quantity: number
  total_amount: number
  notes: string | null
  status: string
  package_id: string
  tourist_id: string
  packages: { name: string } | null
  profiles: { full_name: string | null } | null
}

type PackageItemRow = {
  id: string
  service_id: string | null
  guide_tour_id: string | null
  services: { name: string; business_id: string; businesses: { name: string } | null } | null
  guide_tours: {
    name: string
    guide_id: string
    tourist_guides: { profiles: { full_name: string | null } | null } | null
  } | null
}

async function loadAvailabilityItems(
  admin: ReturnType<typeof createAdminClient>,
  packageId: string,
  bookingDate: string,
) {
  const { data: itemsData } = await admin
    .from('package_items')
    .select(
      'id, service_id, guide_tour_id, services(name, business_id, businesses(name)), guide_tours(name, guide_id, tourist_guides(profiles!profile_id(full_name)))',
    )
    .eq('package_id', packageId)
    .order('created_at', { ascending: true })

  const rows = (itemsData ?? []) as unknown as PackageItemRow[]

  const resolved = rows.map((row) => {
    const providerType: 'business' | 'guide' = row.services ? 'business' : 'guide'
    const providerId = row.services ? row.services.business_id : (row.guide_tours?.guide_id ?? '')
    const label = row.services
      ? `${row.services.name} — ${row.services.businesses?.name ?? ''}`
      : `${row.guide_tours?.name ?? ''} — ${row.guide_tours?.tourist_guides?.profiles?.full_name ?? ''}`
    return { id: row.id, label, providerType, providerId }
  })

  // Batch-check provider_availability for every resolved provider on this
  // booking's date — absence of a row means available by default (§7.0), so
  // only the rows that exist (and are 'unavailable') flip a toggle's state.
  const unavailableSet = new Set<string>()
  if (resolved.length > 0) {
    const { data: availabilityRows } = await admin
      .from('provider_availability')
      .select('provider_type, provider_id')
      .eq('date', bookingDate)
      .eq('status', 'unavailable')
      .in('provider_id', resolved.map((r) => r.providerId))

    for (const row of availabilityRows ?? []) {
      unavailableSet.add(`${row.provider_type}:${row.provider_id}`)
    }
  }

  return resolved.map((item) => ({
    ...item,
    isUnavailable: unavailableSet.has(`${item.providerType}:${item.providerId}`),
  }))
}

export default async function AdminPaquetesSolicitudesPage() {
  const admin = createAdminClient()

  const { data } = await admin
    .from('bookings')
    .select(
      'id, booking_date, quantity, total_amount, notes, status, package_id, tourist_id, packages(name), profiles!tourist_id(full_name)',
    )
    .not('package_id', 'is', null)
    .in('status', ['pending_availability', 'pending_payment'])
    .order('created_at', { ascending: true })

  const bookings = (data ?? []) as unknown as BookingRow[]

  const pendingAvailability = bookings.filter((b) => b.status === 'pending_availability')
  const pendingPayment = bookings.filter((b) => b.status === 'pending_payment')

  const touristIds = [...new Set(bookings.map((b) => b.tourist_id))]
  const phoneByTourist = new Map<string, string | null>()
  if (touristIds.length > 0) {
    const { data: contactRows } = await admin
      .from('profile_contact_details')
      .select('profile_id, phone')
      .in('profile_id', touristIds)
    for (const row of contactRows ?? []) {
      phoneByTourist.set(row.profile_id, row.phone)
    }
  }

  const availabilityItemsByBooking = new Map<string, Awaited<ReturnType<typeof loadAvailabilityItems>>>()
  for (const booking of pendingAvailability) {
    availabilityItemsByBooking.set(
      booking.id,
      await loadAvailabilityItems(admin, booking.package_id, booking.booking_date),
    )
  }

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <Link
            href="/admin/paquetes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {adminCopy.paquetes.form.backToList}
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-1.5">
            <CalendarClock className="size-4 text-primary" aria-hidden="true" />
            {copy.pendingAvailabilityTitle}
          </h2>
          {pendingAvailability.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.emptyAvailability}</p>
          ) : (
            <div className="space-y-3">
              {pendingAvailability.map((b) => (
                <PackageSolicitudCard
                  key={b.id}
                  bookingId={b.id}
                  packageName={b.packages?.name ?? ''}
                  touristName={b.profiles?.full_name ?? '—'}
                  touristPhone={phoneByTourist.get(b.tourist_id) ?? null}
                  bookingDate={b.booking_date}
                  quantity={b.quantity}
                  totalAmount={Number(b.total_amount)}
                  notes={b.notes}
                  items={availabilityItemsByBooking.get(b.id) ?? []}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-1.5">
            <Banknote className="size-4 text-primary" aria-hidden="true" />
            {copy.pendingPaymentTitle}
          </h2>
          {pendingPayment.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.emptyPayment}</p>
          ) : (
            <div className="space-y-3">
              {pendingPayment.map((b) => (
                <PackageSolicitudCard
                  key={b.id}
                  bookingId={b.id}
                  packageName={b.packages?.name ?? ''}
                  touristName={b.profiles?.full_name ?? '—'}
                  touristPhone={phoneByTourist.get(b.tourist_id) ?? null}
                  bookingDate={b.booking_date}
                  quantity={b.quantity}
                  totalAmount={Number(b.total_amount)}
                  notes={b.notes}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
