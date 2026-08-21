import Link from 'next/link'
import { Car, MapPin, Calendar, Users, Phone, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import { acceptTransportRequest, markCompleted } from '@/app/(app)/mi-perfil-transporte/actions'
import AvailabilityToggle from '@/components/transporte/AvailabilityToggle'
import { cn } from '@/lib/utils'

type Transporter = {
  id: string
  vehicle_type: string
  license_plate: string
  phone: string
  bio: string | null
  is_available: boolean
  verification_status: string
  profiles: { full_name: string | null } | null
}

type RequestRow = {
  id: string
  origin: string
  destination: string
  requested_datetime: string
  people_count: number
  notes: string | null
  status: string
  profiles: { full_name: string | null } | null
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function MiPerfilTransportePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Step 1: get the transporter profile (need its id for subsequent queries)
  const { data: transporterData } = await supabase
    .from('transporters')
    .select('id, vehicle_type, license_plate, phone, bio, is_available, verification_status, profiles!profile_id(full_name)')
    .eq('profile_id', user!.id)
    .single()

  const transporter = transporterData as unknown as Transporter | null
  if (!transporter) return null

  // Step 2: pending requests + own accepted requests in parallel
  const [pendingResult, myActiveResult] = await Promise.all([
    supabase
      .from('transport_requests')
      .select('id, origin, destination, requested_datetime, people_count, notes, profiles!tourist_id(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('transport_requests')
      .select('id, origin, destination, requested_datetime, people_count, notes, status, profiles!tourist_id(full_name)')
      .eq('transporter_id', transporter.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: true }),
  ])

  const pending = (pendingResult.data ?? []) as unknown as RequestRow[]
  const myActive = (myActiveResult.data ?? []) as unknown as RequestRow[]

  const copy = transportCopy.transporterPanel

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        {/* Profile card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <h1 className="text-xl font-bold text-foreground mb-4">{copy.pageTitle}</h1>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {copy.profileCard.availabilityLabel}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    transporter.is_available ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {transporter.is_available ? 'Sí' : 'No'}
                </span>
                <AvailabilityToggle isAvailable={transporter.is_available} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="flex items-center gap-2 text-sm">
                <Car
                  className="size-4 text-muted-foreground shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs text-muted-foreground">{copy.profileCard.licenseLabel}</p>
                  <p className="font-medium text-foreground">{transporter.license_plate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone
                  className="size-4 text-muted-foreground shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs text-muted-foreground">{copy.profileCard.phoneLabel}</p>
                  <p className="font-medium text-foreground">{transporter.phone}</p>
                </div>
              </div>
            </div>

            {transporter.bio && (
              <p className="text-sm text-muted-foreground border-t border-border pt-3">
                {transporter.bio}
              </p>
            )}

            <Link
              href="/mi-perfil-transporte/editar"
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline border-t border-border pt-3"
            >
              <FileText className="size-3.5" aria-hidden="true" />
              {copy.profileCard.editDocuments}
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                {transportCopy.editProfile.statusLabels[transporter.verification_status] ?? transporter.verification_status}
              </span>
            </Link>
          </div>
        </div>

        {/* My accepted requests */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">
            {copy.activeRequests.title}
          </h2>
          {myActive.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {copy.activeRequests.empty}
            </p>
          ) : (
            <div className="space-y-3">
              {myActive.map((req) => (
                <div
                  key={req.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-4"
                >
                  <RouteHeader origin={req.origin} destination={req.destination} />
                  <ReqMeta
                    datetime={req.requested_datetime}
                    people={req.people_count}
                    tourist={req.profiles?.full_name}
                  />
                  <form action={markCompleted} className="mt-3">
                    <input type="hidden" name="requestId" value={req.id} />
                    <button
                      type="submit"
                      className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      {copy.activeRequests.complete}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending requests queue */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">
            {copy.pendingRequests.title}
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {copy.pendingRequests.empty}
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((req) => (
                <div
                  key={req.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-4"
                >
                  <RouteHeader origin={req.origin} destination={req.destination} />
                  <ReqMeta
                    datetime={req.requested_datetime}
                    people={req.people_count}
                    tourist={req.profiles?.full_name}
                  />
                  {req.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      &ldquo;{req.notes}&rdquo;
                    </p>
                  )}
                  <form action={acceptTransportRequest} className="mt-3">
                    <input type="hidden" name="requestId" value={req.id} />
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-10 px-4 hover:bg-primary/90 transition-colors"
                    >
                      {copy.pendingRequests.accept}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function RouteHeader({ origin, destination }: { origin: string; destination: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-2">
      <span className="truncate">{origin}</span>
      <MapPin className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="truncate">{destination}</span>
    </div>
  )
}

function ReqMeta({
  datetime,
  people,
  tourist,
}: {
  datetime: string
  people: number
  tourist: string | null | undefined
}) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Calendar className="size-3.5" aria-hidden="true" />
        {formatDatetime(datetime)}
      </span>
      <span className="flex items-center gap-1">
        <Users className="size-3.5" aria-hidden="true" />
        {people}&nbsp;{transportCopy.myTrips.people}
      </span>
      {tourist && <span className="text-foreground font-medium">{tourist}</span>}
    </div>
  )
}
