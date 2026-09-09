import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import RouteForm from '@/components/transporte/RouteForm'
import { updateTransporterRoute } from '../../../actions'

export default async function EditTransporterRoutePage({
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
    .select(
      'id, origin, destination, allows_one_way, allows_round_trip, price_one_way_cents, price_round_trip_cents, estimated_duration_minutes, notes',
    )
    .eq('id', routeId)
    .eq('transporter_id', transporter.id)
    .maybeSingle()

  if (!route) notFound()

  const copy = transportCopy.routes
  const action = updateTransporterRoute.bind(null, routeId)

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/mi-perfil-transporte/rutas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.title}
        </Link>

        <h1 className="text-xl font-bold text-foreground">{copy.editTitle}</h1>

        <RouteForm action={action} initialValues={route} />
      </div>
    </main>
  )
}
