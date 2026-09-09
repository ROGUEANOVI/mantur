import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import AvailabilityCalendar from '@/components/shared/AvailabilityCalendar'
import { setServiceAvailability } from '../../../../actions'

export default async function ServiceAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>
}) {
  const { id, serviceId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: service } = await supabase
    .from('services')
    .select('id, name, business_id, businesses!inner(owner_id)')
    .eq('id', serviceId)
    .eq('business_id', id)
    .eq('businesses.owner_id', user!.id)
    .maybeSingle<{ id: string; name: string; business_id: string }>()

  if (!service) notFound()

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const { data: rows } = await supabase
    .from('provider_availability')
    .select('date')
    .eq('provider_type', 'service')
    .eq('provider_id', service.id)
    .eq('status', 'unavailable')
    .gte('date', today)

  const unavailableDates = (rows ?? []).map((r) => r.date as string)
  const copy = miNegocioCopy.serviceAvailability

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href={`/mi-negocio/${id}/servicios`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToServices}
        </Link>

        <div>
          <h1 className="text-xl font-bold text-foreground">{service.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{copy.subtitle}</p>
        </div>

        <AvailabilityCalendar
          providerType="service"
          providerId={service.id}
          action={setServiceAvailability}
          unavailableDates={unavailableDates}
          copy={copy}
        />
      </div>
    </main>
  )
}
