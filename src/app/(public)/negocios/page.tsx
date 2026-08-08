import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { Store, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'

export const metadata: Metadata = {
  title: 'Negocios',
  description: 'Explora restaurantes, balnearios, fincas y más en Manaure Balcón del Cesar. Reserva experiencias únicas con negocios locales.',
  alternates: { canonical: 'https://mantur.co/negocios' },
  openGraph: {
    title: 'Negocios locales en Manaure | ManTur',
    description: 'Explora restaurantes, balnearios, fincas y más en Manaure Balcón del Cesar.',
    url: 'https://mantur.co/negocios',
  },
}
import { cn } from '@/lib/utils'
import SearchInput from '@/components/shared/SearchInput'
import Reveal from '@/components/shared/Reveal'
import PaginationNav from '@/components/shared/PaginationNav'

const PAGE_SIZE = 12

type CategoryLink = {
  business_categories: { name: string; slug: string } | null
}

type BusinessRow = {
  id: string
  slug: string
  name: string
  description: string | null
  images: string[] | null
  address: string | null
  business_category_links: CategoryLink[]
}

type CategoryRow = { id: string; slug: string; name: string }

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>
}) {
  const { type: rawType, q: rawQ, page: rawPage } = await searchParams

  const search = rawQ?.trim().slice(0, 100) ?? ''
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  // Fetch active categories — drives filter pills and slug→id lookup
  const { data: categoriesData } = await supabase
    .from('business_categories')
    .select('id, slug, name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const categories = (categoriesData ?? []) as CategoryRow[]
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]))

  const activeCategory = rawType ? (categoryBySlug.get(rawType) ?? null) : null

  // Use !inner join when filtering by category so only matching businesses are returned
  const selectClause = activeCategory
    ? 'id, slug, name, description, images, address, business_category_links!inner(business_categories(name, slug))'
    : 'id, slug, name, description, images, address, business_category_links(business_categories(name, slug))'

  let query = supabase
    .from('businesses')
    .select(selectClause, { count: 'exact' })
    .eq('verified', true)
    .eq('status', 'active')

  if (activeCategory) query = query.eq('business_category_links.category_id', activeCategory.id)
  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: businesses, count, error } = await query
    .order('name')
    .range(from, to)

  if (error) throw new Error(error.message)

  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const copy = businessesCopy.businesses

  // Build base params for pagination (exclude page)
  const baseParams: Record<string, string> = {}
  if (activeCategory) baseParams.type = activeCategory.slug
  if (search) baseParams.q = search

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero + search + pills — zona oscura unificada */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
        {/* Town/building silhouette */}
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.13]"
          viewBox="0 0 1200 80"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,80 L0,55 L60,55 L60,40 L80,40 L80,30 L100,30 L100,40 L130,40 L130,55
               L200,55 L200,35 L215,35 L215,20 L230,20 L230,35 L260,35 L260,55
               L320,55 L320,45 L345,45 L345,55 L400,55 L400,38 L420,38 L420,25 L440,25 L440,38 L470,38 L470,55
               L540,55 L540,42 L560,42 L560,55 L600,55 L600,30 L618,30 L618,18 L636,18 L636,30 L660,30 L660,55
               L720,55 L720,45 L750,45 L750,55 L800,55 L800,35 L820,35 L820,22 L840,22 L840,35 L870,35 L870,55
               L930,55 L930,42 L950,42 L950,55 L1000,55 L1000,40 L1020,40 L1020,28 L1045,28 L1045,40 L1070,40 L1070,55
               L1140,55 L1140,45 L1165,45 L1165,55 L1200,55 L1200,80 Z"
            fill="white"
          />
        </svg>
        {/* Título y buscador */}
        <div className="relative max-w-2xl mx-auto px-4 pt-10 pb-5 text-center space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
            <p className="mt-1 text-sm text-white/70">{copy.pageSubtitle}</p>
          </div>
          <Suspense fallback={<div className="h-10 w-full rounded-xl bg-white/20 animate-pulse" />}>
            <SearchInput placeholder="Buscar negocio..." dark />
          </Suspense>
        </div>

        {/* Pills de tipo — driven by business_categories table */}
        <div className="border-t border-white/10 py-3">
          <div className="flex flex-wrap justify-center gap-2 px-4 max-w-4xl mx-auto">
            <Link
              href={search ? `/negocios?q=${encodeURIComponent(search)}` : '/negocios'}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-all active:scale-95 whitespace-nowrap',
                !activeCategory
                  ? 'border-white bg-white text-primary'
                  : 'border-white/30 bg-white/10 text-white hover:bg-white/20',
              )}
            >
              Todos
            </Link>
            {categories.map((cat) => {
              const href = search
                ? `/negocios?type=${cat.slug}&q=${encodeURIComponent(search)}`
                : `/negocios?type=${cat.slug}`
              return (
                <Link
                  key={cat.slug}
                  href={href}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-medium transition-all active:scale-95 whitespace-nowrap',
                    activeCategory?.slug === cat.slug
                      ? 'border-white bg-white text-primary'
                      : 'border-white/30 bg-white/10 text-white hover:bg-white/20',
                  )}
                >
                  {cat.name}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto w-full">
        <div className="mt-4 px-4">
        {/* Results count */}
        {/* Business grid */}
          {!businesses || businesses.length === 0 ? (
            <EmptyState message={search ? `Sin resultados para "${search}"` : copy.empty} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(businesses as unknown as BusinessRow[]).map((business, i) => (
                  <Reveal key={business.id} delay={Math.min(i, 8) * 50}>
                    <BusinessCard business={business} />
                  </Reveal>
                ))}
              </div>
              <PaginationNav
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                baseParams={baseParams}
                basePath="/negocios"
              />
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function BusinessCard({ business }: { business: BusinessRow }) {
  const imageUrl = business.images?.[0]
  const categoryNames = business.business_category_links
    .map((l) => l.business_categories?.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 2)

  return (
    <Link
      href={`/negocios/${business.slug}`}
      className="group h-full rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all
                 flex items-center gap-3 p-3 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0"
    >
      {/* Image — compact square on mobile, wide top image on sm+ */}
      <div className="relative size-24 rounded-xl overflow-hidden shrink-0 sm:size-auto sm:rounded-none sm:aspect-[4/3]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={business.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 96px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Store className="size-8 sm:size-12 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-0.5 sm:p-4 sm:flex sm:flex-col sm:gap-1.5">
        {categoryNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1 sm:mb-0">
            {categoryNames.map((name) => (
              <span key={name} className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {name}
              </span>
            ))}
          </div>
        )}
        <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug line-clamp-1">
          {business.name}
        </h3>
        {business.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 sm:line-clamp-3 leading-relaxed mt-0.5 sm:mt-0">
            {business.description}
          </p>
        )}
        {business.address && (
          <div className="flex items-center gap-1 mt-1.5 sm:mt-auto sm:pt-2">
            <MapPin className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted-foreground line-clamp-1">{business.address}</span>
          </div>
        )}
      </div>
    </Link>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <Store className="size-12 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
