import type { Metadata } from 'next'
import Link from 'next/link'
import { Store, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'
import { descubreCopy } from '@/lib/copy/descubre'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'

const APP_URL = 'https://mantur.co'
const PAGE_URL = `${APP_URL}/descubre/donde-comer-en-manaure`

export const metadata: Metadata = {
  title: 'Dónde comer y descansar en Manaure',
  description:
    'Restaurantes, balnearios, fincas y estaderos verificados de Manaure Balcón del Cesar, agrupados por tipo.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'Dónde comer y descansar en Manaure | ManTur',
    description: 'Negocios verificados de Manaure Balcón del Cesar, agrupados por tipo.',
    url: PAGE_URL,
  },
}

const TYPE_ORDER = ['resort', 'restaurant', 'farm', 'eatery', 'other'] as const

type BusinessRow = {
  id: string
  slug: string
  name: string
  description: string | null
  type: string
}

export default async function DondeComerPage() {
  const copy = descubreCopy.dondeComer
  const typeLabels = businessesCopy.businesses.types

  const supabase = await createClient()
  const { data } = await supabase
    .from('businesses')
    .select('id, slug, name, description, type')
    .eq('verified', true)
    .eq('status', 'active')
    .order('name')

  const businesses = (data ?? []) as BusinessRow[]
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: typeLabels[type] ?? typeLabels.other,
    items: businesses.filter((b) => b.type === type),
  })).filter((g) => g.items.length > 0)

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
          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">{copy.empty}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.type}>
                  <h2 className="text-base font-semibold text-foreground mb-3">{group.label}</h2>
                  <div className="space-y-3">
                    {group.items.map((b) => (
                      <Link
                        key={b.id}
                        href={`/negocios/${b.slug}`}
                        className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Store className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground leading-snug">{b.name}</p>
                          {b.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {b.description}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 mt-2.5" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/negocios"
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
