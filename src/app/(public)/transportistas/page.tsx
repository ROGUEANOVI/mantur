import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Car } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import TransporterCardWithModal from '@/components/transporte/TransporterCardWithModal'
import Reveal from '@/components/shared/Reveal'
import SearchInput from '@/components/shared/SearchInput'
import HeroControlCard from '@/components/shared/HeroControlCard'
import FilterPillsRail from '@/components/shared/FilterPillsRail'
import IllustratedHero from '@/components/shared/IllustratedHero'

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
  is_available: boolean
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

export default async function TransportistasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q: rawQ, status: rawStatus } = await searchParams
  const search = rawQ?.trim().slice(0, 100) ?? ''
  const showAll = rawStatus === 'all'

  // Admin client bypasses RLS so profiles(full_name) resolves for all transporters
  // regardless of the visitor's authentication state.
  const admin = createAdminClient()
  const supabase = await createClient()

  // !inner is required to filter on a joined column (profiles.full_name);
  // same pattern /negocios uses for business_category_links.
  const selectClause = search
    ? 'id, vehicle_type, license_plate, phone, bio, is_available, profiles!inner(full_name, avatar_url)'
    : 'id, vehicle_type, license_plate, phone, bio, is_available, profiles(full_name, avatar_url)'

  let transportersQuery = admin
    .from('transporters')
    .select(selectClause)
    .order('created_at', { ascending: true })

  if (!showAll) transportersQuery = transportersQuery.eq('is_available', true)
  if (search) transportersQuery = transportersQuery.filter('profiles.full_name', 'ilike', `%${search}%`)

  const [{ data }, { data: { user } }] = await Promise.all([
    transportersQuery,
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

  // When showing everyone, count only the available ones for the stat pill;
  // when the list is already filtered to available-only, its length IS that count.
  const availableCount = showAll
    ? transporters.filter((t) => t.is_available).length
    : transporters.length

  const baseParams: Record<string, string> = {}
  if (search) baseParams.q = search
  function withStatus(status: 'available' | 'all') {
    const params = new URLSearchParams(baseParams)
    if (status === 'all') params.set('status', 'all')
    const qs = params.toString()
    return qs ? `/transportistas?${qs}` : '/transportistas'
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <IllustratedHero
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        className="bg-accent"
        textClassName="text-[#0a2b1e]"
        panelClassName="bg-[#0a2b1e]"
        stat={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0a2b1e]/10 px-3 py-1 text-xs font-bold text-[#0a2b1e]">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            {availableCount} {availableCount === 1 ? copy.availableNowLabelSingular : copy.availableNowLabel}
          </span>
        }
        illustration={
          <svg
            className="absolute inset-0 size-full"
            viewBox="0 0 800 200"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <path
              d="M40,175 C220,175 240,90 400,90 S620,20 760,20"
              fill="none"
              stroke="#0e7a54"
              strokeWidth="3.5"
              strokeDasharray="1 14"
              strokeLinecap="round"
            />
            <circle cx="40" cy="175" r="6" fill="#e8a020" />
            <circle cx="400" cy="90" r="6" fill="#e8a020" />
            <Car x={730} y={-2} width={32} height={32} stroke="#e8a020" strokeWidth={1.6} />
          </svg>
        }
      />
      <div className="hero-weave-edge" />

      <HeroControlCard>
        <Suspense fallback={<div className="h-10 w-full rounded-xl bg-muted animate-pulse" />}>
          <SearchInput placeholder="Buscar transportador..." />
        </Suspense>
        <div className="mt-3">
          <FilterPillsRail
            items={[
              { key: 'available', label: copy.filterAvailable, href: withStatus('available') },
              { key: 'all', label: copy.filterAll, href: withStatus('all') },
            ]}
            activeKey={showAll ? 'all' : 'available'}
          />
        </div>
      </HeroControlCard>

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
