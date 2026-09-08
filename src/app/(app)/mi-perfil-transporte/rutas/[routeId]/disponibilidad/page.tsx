import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import AvailabilityCalendar from '@/components/shared/AvailabilityCalendar'
import { setTransporterRouteAvailability } from '../../../actions'

export default async function TransporterRouteAvailabilityPage({
  params,
}: {
  params: Promise<{ routeId: string }>
}) {
  const { routeId } = await params
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

  if (profile?.role !== 'transporter') redirect('/')

  const { data: transporter } = await supabase
    .from('transporters')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!transporter) redirect('/')

  const { data: route } = await supabase
    .from('transporter_routes')
    .select('id, origin, destination')
    .eq('id', routeId)
    .eq('transporter_id', transporter.id)
    .maybeSingle()

  if (!route) notFound()

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const { data: rows } = await supabase
    .from('provider_availability')
    .select('date')
    .eq('provider_type', 'transporter_route')
    .eq('provider_id', route.id)
    .eq('status', 'unavailable')
    .gte('date', today)

  const unavailableDates = (rows ?? []).map((r) => r.date as string)
  const copy = transportCopy.routeAvailability

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/mi-perfil-transporte/rutas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToRoutes}
        </Link>

        <div>
          <h1 className="text-xl font-bold text-foreground">
            {route.origin} → {route.destination}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{copy.subtitle}</p>
        </div>

        <AvailabilityCalendar
          providerType="transporter_route"
          providerId={route.id}
          action={setTransporterRouteAvailability}
          unavailableDates={unavailableDates}
          copy={copy}
        />
      </div>
    </main>
  )
}
