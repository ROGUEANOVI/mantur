import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = 'https://mantur.co'

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/negocios', priority: 0.9, changeFrequency: 'daily' },
  { path: '/lugares', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/guias', priority: 0.8, changeFrequency: 'daily' },
  { path: '/transportistas', priority: 0.6, changeFrequency: 'daily' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient()

  const [businesses, places, guides] = await Promise.all([
    supabase.from('businesses').select('id, updated_at').eq('verified', true).eq('status', 'active'),
    supabase.from('places').select('id, updated_at'),
    supabase.from('tourist_guides').select('id, updated_at'),
  ])

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${APP_URL}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }))

  const businessEntries: MetadataRoute.Sitemap = (businesses.data ?? []).map((b) => ({
    url: `${APP_URL}/negocios/${b.id}`,
    lastModified: new Date(b.updated_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const placeEntries: MetadataRoute.Sitemap = (places.data ?? []).map((p) => ({
    url: `${APP_URL}/lugares/${p.id}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const guideEntries: MetadataRoute.Sitemap = (guides.data ?? []).map((g) => ({
    url: `${APP_URL}/guias/${g.id}`,
    lastModified: new Date(g.updated_at),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticEntries, ...businessEntries, ...placeEntries, ...guideEntries]
}
