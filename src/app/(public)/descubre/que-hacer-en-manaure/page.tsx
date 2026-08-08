import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { descubreCopy } from '@/lib/copy/descubre'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'

const APP_URL = 'https://mantur.co'
const PAGE_URL = `${APP_URL}/descubre/que-hacer-en-manaure`

export const metadata: Metadata = {
  title: 'Qué hacer en Manaure Balcón del Cesar',
  description:
    'Guía de orientación para visitar Manaure Balcón del Cesar: naturaleza en la Serranía del Perijá, dónde comer, guías locales y transporte.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'Qué hacer en Manaure Balcón del Cesar | ManTur',
    description: 'Naturaleza, gastronomía, guías locales y transporte en Manaure Balcón del Cesar.',
    url: PAGE_URL,
  },
}

export default function QueHacerPage() {
  const copy = descubreCopy.queHacer

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
          {copy.sections.map((s) => (
            <div key={s.linkHref} className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">{s.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              <Link
                href={s.linkHref}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {s.linkLabel}
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
