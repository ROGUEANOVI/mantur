import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import Reveal from '@/components/shared/Reveal'
import Avatar from '@/components/shared/Avatar'

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

export default async function GuiasPage() {
  const admin = createAdminClient()

  const { data } = await admin
    .from('tourist_guides')
    .select('id, slug, specialties, languages, bio, profiles(full_name, avatar_url), guide_tours(id)')
    .eq('is_available', true)
    .order('created_at', { ascending: true })

  const guides = (data ?? []) as unknown as GuideRow[]
  const copy = guidesCopy.publicPage

  return (
    <main className="min-h-screen bg-background pb-10">
      <section className="relative overflow-hidden bg-linear-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
        {/* Compass rose — same motif as /solicitar-rol's tourist_guide step,
            so the hero already speaks the language of "local knowledge". */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -bottom-6 w-48 opacity-[0.12]"
          viewBox="0 0 100 100"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        >
          <circle cx="50" cy="50" r="40" />
          <circle cx="50" cy="50" r="28" />
          <line x1="50" y1="10" x2="50" y2="20" />
          <line x1="50" y1="80" x2="50" y2="90" />
          <line x1="10" y1="50" x2="20" y2="50" />
          <line x1="80" y1="50" x2="90" y2="50" />
          <polygon points="50,26 54,44 50,48 46,44" fill="white" stroke="none" opacity="0.6" />
          <polygon points="50,72 46,54 50,50 54,54" fill="white" stroke="none" opacity="0.3" />
        </svg>
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-8 text-center">
          <Compass
            className="mx-auto mb-3 size-10 text-white/80"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
          <p className="mt-2 text-sm text-white/70">{copy.pageSubtitle}</p>
        </div>
      </section>

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
