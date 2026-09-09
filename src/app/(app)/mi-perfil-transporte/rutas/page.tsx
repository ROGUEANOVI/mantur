import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Clock, ChevronLeft, Pencil, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import { cn } from '@/lib/utils'
import ToggleRouteButton from '@/components/transporte/ToggleRouteButton'

type Route = {
  id: string
  origin: string
  destination: string
  allows_one_way: boolean
  allows_round_trip: boolean
  price_one_way_cents: number | null
  price_round_trip_cents: number | null
  estimated_duration_minutes: number | null
  status: 'active' | 'inactive'
}

export default async function TransporterRoutesPage() {
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

  const { data: routes } = await supabase
    .from('transporter_routes')
    .select(
      'id, origin, destination, allows_one_way, allows_round_trip, price_one_way_cents, price_round_trip_cents, estimated_duration_minutes, status',
    )
    .eq('transporter_id', transporter.id)
    .order('created_at', { ascending: false })

  const copy = transportCopy.routes
  const list = (routes ?? []) as Route[]

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href="/mi-perfil-transporte"
          className="inline-flex items-center gap-1.5 mb-5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToPanel}
        </Link>

        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <Link
            href="/mi-perfil-transporte/rutas/nueva"
            className="inline-flex items-center gap-1.5 shrink-0 rounded-xl bg-primary text-primary-foreground text-sm font-medium px-3 min-h-11 hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" aria-hidden="true" />
            {copy.addButton}
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {list.map((route) => (
              <li key={route.id}>
                <RouteCard route={route} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function RouteCard({ route }: { route: Route }) {
  const copy = transportCopy.routes
  const isActive = route.status === 'active'

  const badgeClass = isActive
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-foreground leading-snug line-clamp-1 text-base">
          {route.origin} → {route.destination}
        </h2>
        <span
          className={cn(
            'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
            badgeClass,
          )}
        >
          {isActive ? copy.statusActive : copy.statusInactive}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        {route.allows_one_way && (
          <span className="text-accent font-semibold">
            {copy.form.allowOneWay}
            {route.price_one_way_cents != null && (
              <>: ${(route.price_one_way_cents / 100).toLocaleString('es-CO')} COP</>
            )}
          </span>
        )}
        {route.allows_round_trip && (
          <span className="text-accent font-semibold">
            {copy.form.allowRoundTrip}
            {route.price_round_trip_cents != null && (
              <>: ${(route.price_round_trip_cents / 100).toLocaleString('es-CO')} COP</>
            )}
          </span>
        )}
      </div>

      {route.estimated_duration_minutes != null && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {route.estimated_duration_minutes}&nbsp;min
        </span>
      )}

      <div className="pt-1 flex items-center justify-between gap-3">
        <ToggleRouteButton routeId={route.id} currentStatus={route.status} />
        <div className="flex items-center gap-3">
          <Link
            href={`/mi-perfil-transporte/rutas/${route.id}/disponibilidad`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-11 py-2"
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {copy.availabilityButton}
          </Link>
          <Link
            href={`/mi-perfil-transporte/rutas/${route.id}/editar`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-11 py-2"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {copy.editButton}
          </Link>
        </div>
      </div>
    </div>
  )
}
