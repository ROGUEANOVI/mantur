import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, Clock, Users, ChevronLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy, businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import { ToggleServiceButton } from '@/components/mi-negocio/ToggleServiceButton'

type Service = {
  id: string
  name: string
  description: string | null
  base_price: string | number
  capacity: number | null
  attributes: Record<string, unknown>
  status: string
  service_types: { name: string } | null
}

export default async function ServiciosPage({
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
    .select('id, name, status')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) notFound()

  const { data: services } = await supabase
    .from('services')
    .select('id, name, description, base_price, capacity, attributes, status, service_types(name)')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })

  const copy = miNegocioCopy.services
  const list = (services ?? []) as unknown as Service[]

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/mi-negocio/${id}`}
          className={cn(
            'inline-flex items-center gap-1.5 mb-5',
            'text-sm font-medium text-primary min-h-11 py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {business.name}
        </Link>

        {business.status === 'inactive' && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
            <p className="text-sm text-amber-800 leading-relaxed dark:text-amber-400">
              Este negocio está inactivo. Los servicios no son visibles para los turistas hasta que reactives el negocio.
            </p>
          </div>
        )}

        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <Link
            href={`/mi-negocio/${id}/servicios/nueva`}
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
            {list.map((svc) => (
              <li key={svc.id}>
                <ServiceCard service={svc} businessId={id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function ServiceCard({ service: svc, businessId }: { service: Service; businessId: string }) {
  const copy = miNegocioCopy.services
  const svcCopy = businessesCopy.services
  const isActive = svc.status === 'active'
  const durationMinutes = svc.attributes?.duration_minutes as number | undefined

  const badgeClass = isActive
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'

  const badgeLabel = isActive ? copy.statusActive : copy.statusInactive

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground leading-snug line-clamp-1 text-base">
            {svc.name}
          </h2>
          {svc.service_types?.name && (
            <p className="text-xs text-muted-foreground mt-0.5">{svc.service_types.name}</p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
            badgeClass,
          )}
        >
          {badgeLabel}
        </span>
      </div>

      {svc.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {svc.description}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-base font-semibold text-accent">
          ${Number(svc.base_price).toLocaleString('es-CO')} COP
        </p>
        {durationMinutes != null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {durationMinutes}&nbsp;{svcCopy.minutes}
          </span>
        )}
        {svc.capacity != null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden="true" />
            {svc.capacity}&nbsp;{svcCopy.people}
          </span>
        )}
      </div>

      <div className="pt-1 flex items-center justify-between gap-3">
        <ToggleServiceButton
          serviceId={svc.id}
          currentStatus={svc.status as 'active' | 'inactive'}
        />
        <Link
          href={`/mi-negocio/${businessId}/servicios/${svc.id}/editar`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-11 py-2"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {miNegocioCopy.services.editButton}
        </Link>
      </div>
    </div>
  )
}
