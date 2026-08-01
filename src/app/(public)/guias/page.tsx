import Link from 'next/link'
import { Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'

type GuideRow = {
  id: string
  specialties: string[]
  languages: string[]
  bio: string | null
  profiles: { full_name: string | null } | null
  guide_tours: { id: string }[]
}

export default async function GuiasPage() {
  const admin = createAdminClient()

  const { data } = await admin
    .from('tourist_guides')
    .select('id, specialties, languages, bio, profiles(full_name), guide_tours(id)')
    .eq('is_available', true)
    .order('created_at', { ascending: true })

  const guides = (data ?? []) as unknown as GuideRow[]
  const copy = guidesCopy.publicPage

  return (
    <main className="min-h-screen bg-background pb-10">
      <section className="relative overflow-hidden bg-linear-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
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
            {guides.map((g) => {
              const name = g.profiles?.full_name ?? 'Guía'
              const tourCount = g.guide_tours?.length ?? 0

              return (
                <div
                  key={g.id}
                  className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-foreground text-base leading-snug">{name}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tourCount}&nbsp;{copy.tours}
                      </p>
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

                  <Link
                    href={`/guias/${g.id}`}
                    className="inline-flex items-center justify-center w-full rounded-xl border border-primary text-primary text-sm font-semibold min-h-11 hover:bg-primary/10 transition-colors"
                  >
                    {copy.viewProfile}
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
