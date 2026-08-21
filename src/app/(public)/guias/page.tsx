import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import Reveal from '@/components/shared/Reveal'
import Avatar from '@/components/shared/Avatar'
import SearchInput from '@/components/shared/SearchInput'
import HeroControlCard from '@/components/shared/HeroControlCard'
import FilterPillsRail from '@/components/shared/FilterPillsRail'
import IllustratedHero from '@/components/shared/IllustratedHero'

export const metadata: Metadata = {
  title: 'Guías Turísticos',
  description: 'Conoce Manaure Balcón del Cesar de la mano de guías locales expertos. Reserva tours de ecoturismo, historia y gastronomía local.',
  alternates: { canonical: 'https://mantur.co/guias' },
  openGraph: {
    title: 'Guías turísticos locales en Manaure | ManTur',
    description: 'Conoce Manaure con guías locales expertos. Tours de ecoturismo, historia y gastronomía.',
    url: 'https://mantur.co/guias',
  },
}

type GuideRow = {
  id: string
  slug: string
  specialties: string[]
  languages: string[]
  bio: string | null
  profiles: { full_name: string | null; avatar_url: string | null } | null
  guide_tours: { id: string }[]
}

const SPECIALTY_ENTRIES = Object.entries(
  roleRequestsCopy.form.touristGuide.specialtyOptions,
) as [string, string][]

export default async function GuiasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; specialty?: string }>
}) {
  const { q: rawQ, specialty: rawSpecialty } = await searchParams
  const search = rawQ?.trim().slice(0, 100) ?? ''
  const specialty =
    SPECIALTY_ENTRIES.find(([slug]) => slug === rawSpecialty)?.[0] ?? null

  const admin = createAdminClient()

  // !inner is required to filter on the joined profiles.full_name column,
  // same pattern /transportistas and /negocios use for their own joins.
  const selectClause = search
    ? 'id, slug, specialties, languages, bio, profiles!profile_id!inner(full_name, avatar_url), guide_tours(id)'
    : 'id, slug, specialties, languages, bio, profiles!profile_id(full_name, avatar_url), guide_tours(id)'

  let guidesQuery = admin
    .from('tourist_guides')
    .select(selectClause)
    .eq('is_available', true)
    .order('created_at', { ascending: true })

  if (search) guidesQuery = guidesQuery.filter('profiles.full_name', 'ilike', `%${search}%`)
  if (specialty) guidesQuery = guidesQuery.contains('specialties', [specialty])

  const { data } = await guidesQuery

  const guides = (data ?? []) as unknown as GuideRow[]
  const copy = guidesCopy.publicPage

  const baseParams: Record<string, string> = {}
  if (search) baseParams.q = search
  function withSpecialty(slug: string | null) {
    const params = new URLSearchParams(baseParams)
    if (slug) params.set('specialty', slug)
    const qs = params.toString()
    return qs ? `/guias?${qs}` : '/guias'
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <IllustratedHero
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        className="bg-linear-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]"
        textClassName="text-white"
        panelClassName="bg-[#0a2b1e]"
        stat={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            {guides.length} {guides.length === 1 ? copy.availableNowLabelSingular : copy.availableNowLabel}
          </span>
        }
        illustration={
          <svg
            aria-hidden="true"
            className="absolute inset-0 size-full"
            viewBox="0 0 100 100"
            fill="none"
            stroke="white"
          >
            <circle cx="50" cy="50" r="40" strokeWidth="1.5" opacity="0.5" />
            <circle cx="30" cy="35" r="4" fill="#e8a020" stroke="none" />
            <circle cx="66" cy="30" r="4" fill="#e8a020" stroke="none" />
            <circle cx="58" cy="68" r="4" fill="#e8a020" stroke="none" />
            <path d="M30,35 L66,30 L58,68 Z" strokeWidth="1.2" strokeDasharray="1 6" opacity="0.7" />
          </svg>
        }
      />
      <div className="hero-weave-edge" />

      <HeroControlCard>
        <Suspense fallback={<div className="h-10 w-full rounded-xl bg-muted animate-pulse" />}>
          <SearchInput placeholder="Buscar guía..." />
        </Suspense>
        <div className="mt-3">
          <FilterPillsRail
            items={[
              { key: 'all', label: 'Todos', href: withSpecialty(null) },
              ...SPECIALTY_ENTRIES.map(([slug, label]) => ({
                key: slug,
                label,
                href: withSpecialty(slug),
              })),
            ]}
            activeKey={specialty ?? 'all'}
          />
        </div>
      </HeroControlCard>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {guides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Compass className="size-12 text-muted-foreground/40" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-base text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {guides.map((g, i) => {
              const name = g.profiles?.full_name ?? 'Guía'
              const tourCount = g.guide_tours?.length ?? 0

              return (
                <Reveal key={g.id} delay={Math.min(i, 8) * 60}>
                <Link
                  href={`/guias/${g.slug}`}
                  className="block h-full rounded-2xl border border-border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={name} avatarUrl={g.profiles?.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <h2 className="font-semibold text-foreground text-base leading-snug">{name}</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {tourCount}&nbsp;{copy.tours}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2.5 py-0.5 text-xs font-semibold">
                      {copy.available}
                    </span>
                  </div>

                  {g.bio && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {g.bio}
                    </p>
                  )}

                  {g.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {g.specialties.slice(0, 3).map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                        >
                          {roleRequestsCopy.form.touristGuide.specialtyOptions[s as keyof typeof roleRequestsCopy.form.touristGuide.specialtyOptions] ?? s}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
                </Reveal>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
