import type { Metadata } from 'next'
import { legalCopy } from '@/lib/copy/legal'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import Reveal from '@/components/shared/Reveal'

const APP_URL = 'https://mantur.co'
const PAGE_URL = `${APP_URL}/terminos-y-condiciones`

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description:
    'Términos y condiciones de uso de ManTur, el mercado turístico de Manaure Balcón del Cesar.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'Términos y condiciones | ManTur',
    description: 'Términos y condiciones de uso de ManTur.',
    url: PAGE_URL,
  },
}

export default function TermsPage() {
  const copy = legalCopy.terms

  const pageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: copy.title,
    description: metadata.description,
    inLanguage: 'es-CO',
    url: PAGE_URL,
    publisher: { '@type': 'Organization', name: 'ManTur', url: APP_URL },
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <script {...jsonLdScriptProps(pageJsonLd)} />
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs
          items={[
            { label: breadcrumbsCopy.home, href: '/' },
            { label: breadcrumbsCopy.terms },
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
      </div>
    </main>
  )
}
