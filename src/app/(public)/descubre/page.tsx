import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass, TreePine, Utensils, Route, CalendarDays, ChevronRight } from 'lucide-react'
import { descubreCopy } from '@/lib/copy/descubre'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import Breadcrumbs from '@/components/shared/Breadcrumbs'

export const metadata: Metadata = {
  title: 'Guías de viaje',
  description: 'Guías de viaje para Manaure Balcón del Cesar: qué hacer, naturaleza, y dónde comer.',
  alternates: { canonical: 'https://mantur.co/descubre' },
  openGraph: {
    title: 'Guías de viaje a Manaure Balcón del Cesar | ManTur',
    description: 'Todo lo que necesitas saber antes de visitar Manaure Balcón del Cesar.',
    url: 'https://mantur.co/descubre',
  },
}

const GUIDES = [
  {
    href: '/descubre/que-hacer-en-manaure',
    icon: Compass,
    title: 'Qué hacer en Manaure Balcón del Cesar',
    description: 'Una guía de orientación: naturaleza, gastronomía, guías locales y transporte.',
  },
  {
    href: '/descubre/naturaleza-en-manaure',
    icon: TreePine,
    title: 'Cascadas, ríos y miradores',
    description: 'Los sitios naturales de la Serranía del Perijá documentados en ManTur.',
  },
  {
    href: '/descubre/donde-comer-en-manaure',
    icon: Utensils,
    title: 'Dónde comer y descansar',
    description: 'Restaurantes, balnearios, fincas y estaderos verificados de Manaure.',
  },
  {
    href: '/descubre/como-llegar-a-manaure',
    icon: Route,
    title: 'Cómo llegar a Manaure',
    description: 'Ruta desde Valledupar, tiempo de viaje y transporte público.',
  },
  {
    href: '/descubre/mejor-epoca-para-visitar-manaure',
    icon: CalendarDays,
    title: 'Mejor época para visitar',
    description: 'Semana Santa, las fiestas patronales de julio y la temporada de diciembre.',
  },
]

export default function DescubrePage() {
  const copy = descubreCopy.hub

  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs items={[{ label: breadcrumbsCopy.home, href: '/' }, { label: breadcrumbsCopy.discover }]} />

        <section className="px-4 mt-2">
          <h1 className="text-2xl font-bold text-foreground leading-tight">{copy.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.pageSubtitle}</p>
        </section>

        <section className="px-4 mt-6 space-y-3">
          {GUIDES.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:shadow-sm hover:border-primary/40 transition-all"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Icon className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 mt-2.5" aria-hidden="true" />
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
