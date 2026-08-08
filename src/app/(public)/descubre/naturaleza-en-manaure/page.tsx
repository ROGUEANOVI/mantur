import type { Metadata } from 'next'
import Link from 'next/link'
import { Droplets, Waves, Eye, TreePine, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'
import { descubreCopy } from '@/lib/copy/descubre'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'

const APP_URL = 'https://mantur.co'
const PAGE_URL = `${APP_URL}/descubre/naturaleza-en-manaure`

export const metadata: Metadata = {
  title: 'Cascadas, ríos y miradores en Manaure',
  description:
    'Cascadas, ríos y miradores de la Serranía del Perijá en Manaure Balcón del Cesar, con fotos y ubicación de cada sitio.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'Cascadas, ríos y miradores en Manaure | ManTur',
    description: 'Los sitios naturales de Manaure Balcón del Cesar, con fotos y ubicación.',
    url: PAGE_URL,
  },
}

const NATURE_TYPES = ['waterfall', 'river', 'viewpoint'] as const
type NatureType = (typeof NATURE_TYPES)[number]

const TYPE_ICONS: Record<NatureType, React.ElementType> = {
  waterfall: Droplets,
  river: Waves,
  viewpoint: Eye,
}

type PlaceRow = {
  id: string
  slug: string
  name: string
  description: string | null
  type: string
}

export default async function NaturalezaPage() {
  const copy = descubreCopy.naturaleza
  const typeLabels = businessesCopy.places.types

  const supabase = await createClient()
  const { data } = await supabase
    .from('places')
    .select('id, slug, name, description, type')
    .in('type', NATURE_TYPES)
    .order('name')

  const places = (data ?? []) as PlaceRow[]

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: copy.title,
    description: metadata.description,
    inLanguage: 'es-CO',
    url: PAGE_URL,
    publisher: { '@type': 'Organization', name: 'ManTur', url: APP_URL },
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <script {...jsonLdScriptProps(articleJsonLd)} />
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs
          items={[
            { label: breadcrumbsCopy.home, href: '/' },
            { label: breadcrumbsCopy.discover, href: '/descubre' },
            { label: copy.title },
          ]}
        />

        <section className="px-4 mt-2">
          <h1 className="text-2xl font-bold text-foreground leading-tight">{copy.title}</h1>
          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">{copy.intro}</p>
        </section>

        <section className="px-4 mt-6">
          {places.length === 0 ? (
            <div className="rounded-2xl border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">{copy.empty}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {places.map((place) => {
                const Icon = TYPE_ICONS[place.type as NatureType] ?? TreePine
                return (
                  <Link
                    key={place.id}
                    href={`/lugares/${place.slug}`}
                    className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Icon className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full mb-1">
                        {typeLabels[place.type] ?? typeLabels.other}
                      </span>
                      <p className="text-sm font-semibold text-foreground leading-snug">{place.name}</p>
                      {place.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {place.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 mt-2.5" aria-hidden="true" />
                  </Link>
                )
              })}
            </div>
          )}
          <Link
            href="/lugares"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {copy.viewAllLabel}
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  )
}
