import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { bookingsCopy } from '@/lib/copy/bookings'
import { businessesCopy } from '@/lib/copy/businesses'
import { PRICING_UNIT_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import WhatsappButton from '@/components/shared/WhatsappButton'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ServiceWithBusiness = {
  id: string
  name: string
  base_price: number
  capacity: number | null
  status: string
  business_id: string
  businesses: { name: string } | null
  service_types: { pricing_unit: PricingUnit } | null
}

export default async function NuevaReservaPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>
}) {
  const { service: serviceId } = await searchParams

  if (!serviceId || !UUID_RE.test(serviceId)) {
    redirect('/negocios')
  }

  const supabase = await createClient()

  const { data: serviceRow, error } = await supabase
    .from('services')
    .select('id, name, base_price, capacity, status, business_id, businesses(name), service_types(pricing_unit)')
    .eq('id', serviceId)
    .eq('status', 'active')
    .single()

  if (error || !serviceRow) notFound()

  const service = serviceRow as unknown as ServiceWithBusiness
  const businessName = service.businesses?.name ?? ''
  const pricingUnit = service.service_types?.pricing_unit ?? 'per_person'

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        {/* Back link */}
        <Link
          href="/negocios"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline mb-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {businessesCopy.detail.back}
        </Link>

        {/* Page header */}
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            {bookingsCopy.form.title}
          </h1>
          {businessName && (
            <p className="text-sm text-muted-foreground">{businessName}</p>
          )}
        </div>

        {/* Price callout */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-4 mb-5">
          <p className="text-sm text-muted-foreground">
            {PRICING_UNIT_LABELS[pricingUnit]}
          </p>
          <p className="text-xl font-semibold text-primary mt-0.5">
            ${Number(service.base_price).toLocaleString('es-CO')} COP
          </p>
          <p className="text-sm font-semibold text-foreground mt-1 line-clamp-1">
            {service.name}
          </p>
        </div>

        {/* Direct in-platform booking is disabled during ManTur's manual-
            operation validation phase (2026-09-02 business decision) —
            gated here too, not just at the links pointing to this page, so
            this URL can't be used to bypass the WhatsApp-only flow even if
            bookmarked or guessed. BookingForm and createBooking are
            untouched and can be wired back in later. */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <WhatsappButton
            message={`Hola, quiero más información sobre "${service.name}"${businessName ? ` de ${businessName}` : ''}.`}
            label={businessesCopy.services.contactWhatsapp}
          />
        </div>
      </div>
    </main>
  )
}
