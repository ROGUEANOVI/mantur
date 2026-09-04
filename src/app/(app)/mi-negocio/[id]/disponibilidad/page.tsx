import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import AvailabilityCalendar from '@/components/shared/AvailabilityCalendar'
import { setBusinessAvailability } from '../../actions'

export default async function BusinessAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) notFound()

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const { data: rows } = await supabase
    .from('provider_availability')
    .select('date')
    .eq('provider_type', 'business')
    .eq('provider_id', business.id)
    .eq('status', 'unavailable')
    .gte('date', today)

  const unavailableDates = (rows ?? []).map((r) => r.date as string)
  const copy = miNegocioCopy.availability

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href={`/mi-negocio/${business.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToBusiness}
        </Link>

        <div>
          <h1 className="text-xl font-bold text-foreground">{copy.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{copy.subtitle}</p>
        </div>

        <AvailabilityCalendar
          providerType="business"
          providerId={business.id}
          action={setBusinessAvailability}
          unavailableDates={unavailableDates}
          copy={copy}
        />
      </div>
    </main>
  )
}
