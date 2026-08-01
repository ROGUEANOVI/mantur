import Link from 'next/link'
import { Car } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'

type TransporterRow = {
  id: string
  vehicle_type: string
  license_plate: string
  phone: string
  bio: string | null
  profiles: { full_name: string | null } | null
}

export default async function TransportistasPage() {
  const supabase = await createClient()

  // RLS SELECT policy (is_available = true OR ...) gates this for unauthenticated callers.
  const { data } = await supabase
    .from('transporters')
    .select('id, vehicle_type, license_plate, phone, bio, profiles!profile_id(full_name)')
    .eq('is_available', true)
    .order('created_at', { ascending: true })

  const transporters = (data ?? []) as unknown as TransporterRow[]
  const copy = transportCopy.publicPage

  return (
    <main className="min-h-screen bg-background pb-10">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
        {/* Mountain silhouette */}
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.13]"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,60 L0,40 L150,15 L300,35 L450,5 L600,30 L750,10 L900,28 L1050,8 L1200,22 L1200,60 Z"
            fill="white"
          />
        </svg>
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-8 text-center">
          <Car
            className="mx-auto mb-3 size-10 text-white/80"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
          <p className="mt-2 text-sm text-white/70">{copy.pageSubtitle}</p>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {transporters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Car className="size-12 text-muted-foreground/40" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-base text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transporters.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border bg-card shadow-sm p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Car className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {t.profiles?.full_name ?? 'Transportador'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {copy.vehicleTypes[t.vehicle_type] ?? t.vehicle_type} · {t.license_plate}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-0.5 text-xs font-semibold shrink-0">
                    {copy.available}
                  </span>
                </div>

                {t.bio && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{t.bio}</p>
                )}

                <Link
                  href="/transporte/solicitar"
                  className="inline-flex items-center justify-center w-full rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] px-4 hover:bg-primary/90 transition-colors"
                >
                  {copy.requestRide}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
