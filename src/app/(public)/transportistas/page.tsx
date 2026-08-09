import type { Metadata } from 'next'
import { Car } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import TransporterCardWithModal from '@/components/transporte/TransporterCardWithModal'
import Reveal from '@/components/shared/Reveal'

export const metadata: Metadata = {
  title: 'Transportadores',
  description: 'Encuentra mototaxi y transporte local en Manaure Balcón del Cesar. Solicita un traslado con conductores locales de confianza.',
  alternates: { canonical: 'https://mantur.co/transportistas' },
  openGraph: {
    title: 'Transportadores en Manaure | ManTur',
    description: 'Encuentra mototaxi y transporte local en Manaure. Solicita un traslado con conductores locales.',
    url: 'https://mantur.co/transportistas',
  },
}

type TransporterRow = {
  id: string
  vehicle_type: string
  license_plate: string
  phone: string
  bio: string | null
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

export default async function TransportistasPage() {
  // Admin client bypasses RLS so profiles(full_name) resolves for all transporters
  // regardless of the visitor's authentication state.
  const admin = createAdminClient()
  const supabase = await createClient()

  const [{ data }, { data: { user } }] = await Promise.all([
    admin
      .from('transporters')
      .select('id, vehicle_type, license_plate, phone, bio, profiles(full_name, avatar_url)')
      .eq('is_available', true)
      .order('created_at', { ascending: true }),
    supabase.auth.getUser(),
  ])

  // Three-state access, matching the guide-booking pattern: a tourist gets
  // the request modal, a guest gets a login redirect, and any other
  // authenticated role (admin, transporter, etc.) never sees the button.
  let access: 'tourist' | 'guest' | 'other_role' = 'guest'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    access = profile?.role === 'tourist' ? 'tourist' : 'other_role'
  }

  const transporters = (data ?? []) as unknown as TransporterRow[]
  const copy = transportCopy.publicPage

  return (
    <main className="min-h-screen bg-background pb-10">
      <section className="relative overflow-hidden bg-linear-to-tr from-accent via-accent to-[#d6960f]">
        <div className="pointer-events-none absolute -bottom-10 -left-10 size-56 rounded-full bg-white/20 blur-2xl" />
        {/* Winding road — a route through the mountains, not the generic skyline */}
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.16]"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,38 C150,10 200,55 350,32 S550,8 700,34 S900,55 1050,26 S1150,12 1200,30"
            fill="none"
            stroke="#0a2b1e"
            strokeWidth="4"
            strokeDasharray="2 14"
            strokeLinecap="round"
          />
        </svg>
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-8 text-center">
          <Car
            className="mx-auto mb-3 size-10 text-[#0a2b1e]/80"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-[#0a2b1e]">{copy.pageTitle}</h1>
          <p className="mt-2 text-sm text-[#0a2b1e]/70">{copy.pageSubtitle}</p>
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
            {transporters.map((t, i) => (
              <Reveal key={t.id} delay={Math.min(i, 8) * 60}>
                <TransporterCardWithModal
                  transporter={{
                    vehicle_type: t.vehicle_type,
                    license_plate: t.license_plate,
                    phone: t.phone,
                    bio: t.bio,
                    full_name: t.profiles?.full_name ?? null,
                    avatar_url: t.profiles?.avatar_url ?? null,
                  }}
                  access={access}
                />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
