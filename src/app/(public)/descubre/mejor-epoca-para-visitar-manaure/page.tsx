import type { Metadata } from 'next'
import { descubreCopy } from '@/lib/copy/descubre'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import Reveal from '@/components/shared/Reveal'

const APP_URL = 'https://mantur.co'
const PAGE_URL = `${APP_URL}/descubre/mejor-epoca-para-visitar-manaure`

export const metadata: Metadata = {
  title: 'Mejor época para visitar Manaure',
  description:
    'Cuándo visitar Manaure Balcón del Cesar: Semana Santa, las fiestas patronales de la Virgen del Carmen en julio, y la temporada de vacaciones de diciembre.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'Mejor época para visitar Manaure | ManTur',
    description: 'Las fechas con más actividad en Manaure Balcón del Cesar: Semana Santa, julio y diciembre.',
    url: PAGE_URL,
  },
}

export default function MejorEpocaPage() {
  const copy = descubreCopy.mejorEpoca

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

        <section className="px-4 mt-6 space-y-3">
          {copy.sections.map((s, i) => (
            <Reveal key={s.title} delay={i * 60}>
              <div className="rounded-2xl border border-border bg-card p-4">
                <h2 className="text-base font-semibold text-foreground">{s.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </section>

        <section className="px-4 mt-4">
          <Reveal delay={copy.sections.length * 60} className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <p className="text-sm text-foreground/80 leading-relaxed">{copy.tip}</p>
          </Reveal>
        </section>
      </div>
    </main>
  )
}
