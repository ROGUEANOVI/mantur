import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = 'https://mantur.co'

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/negocios', priority: 0.9, changeFrequency: 'daily' },
  { path: '/lugares', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/paquetes', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/guias', priority: 0.8, changeFrequency: 'daily' },
  { path: '/transportistas', priority: 0.6, changeFrequency: 'daily' },
  { path: '/descubre', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/descubre/que-hacer-en-manaure', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/descubre/naturaleza-en-manaure', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/descubre/donde-comer-en-manaure', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/descubre/como-llegar-a-manaure', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/descubre/mejor-epoca-para-visitar-manaure', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/acerca-de-nosotros', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/terminos-y-condiciones', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/politica-de-privacidad', priority: 0.3, changeFrequency: 'monthly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient()

  const [businesses, places, guides, packages] = await Promise.all([
    supabase.from('businesses').select('slug, updated_at').eq('verified', true).eq('status', 'active'),
    supabase.from('places').select('slug, updated_at'),
    supabase.from('tourist_guides').select('slug, updated_at'),
    supabase.from('packages').select('slug, updated_at').eq('is_active', true),
  ])

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${APP_URL}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }))

  const businessEntries: MetadataRoute.Sitemap = (businesses.data ?? []).map((b) => ({
    url: `${APP_URL}/negocios/${b.slug}`,
    lastModified: new Date(b.updated_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const placeEntries: MetadataRoute.Sitemap = (places.data ?? []).map((p) => ({
    url: `${APP_URL}/lugares/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const guideEntries: MetadataRoute.Sitemap = (guides.data ?? []).map((g) => ({
    url: `${APP_URL}/guias/${g.slug}`,
    lastModified: new Date(g.updated_at),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const packageEntries: MetadataRoute.Sitemap = (packages.data ?? []).map((p) => ({
    url: `${APP_URL}/paquetes/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticEntries, ...businessEntries, ...placeEntries, ...guideEntries, ...packageEntries]
}
