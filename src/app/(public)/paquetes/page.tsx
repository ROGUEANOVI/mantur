import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { packagesCopy } from '@/lib/copy/packages'
import SearchInput from '@/components/shared/SearchInput'
import PaginationNav from '@/components/shared/PaginationNav'
import Reveal from '@/components/shared/Reveal'
import HeroControlCard from '@/components/shared/HeroControlCard'
import AuroraHero from '@/components/shared/AuroraHero'
import PackageCard, { type PackageCardRow } from '@/components/shared/PackageCard'

export const metadata: Metadata = {
  title: 'Paquetes y tours',
  description: 'Paquetes turísticos completos organizados por ManTur en Manaure Balcón del Cesar.',
  alternates: { canonical: 'https://mantur.co/paquetes' },
  openGraph: {
    title: 'Paquetes y tours en Manaure | ManTur',
    description: 'Experiencias completas organizadas por ManTur en Manaure Balcón del Cesar.',
    url: 'https://mantur.co/paquetes',
  },
}

const PAGE_SIZE = 15

export default async function PaquetesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q: rawQ, page: rawPage } = await searchParams

  const search = rawQ?.trim().slice(0, 100) ?? ''
  const page = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  let query = supabase
    .from('packages')
    .select('id, slug, name, description, base_price, images', { count: 'exact' })

  if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)

  const { data: packages, count, error } = await query
    .order('name')
    .range(from, to)

  if (error) throw new Error(error.message)

  const packageRows = (packages ?? []) as PackageCardRow[]
  const totalCount = count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const copy = packagesCopy.publicPage

  const baseParams: Record<string, string> = {}
  if (search) baseParams.q = search

  return (
    <main className="min-h-screen bg-background pb-10">
      <AuroraHero>
        <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
        <p className="mt-1 text-sm text-white/85">{copy.pageSubtitle}</p>
      </AuroraHero>
      <div className="hero-weave-edge" />

      <HeroControlCard>
        <Suspense fallback={<div className="h-10 w-full rounded-xl bg-muted animate-pulse" />}>
          <SearchInput placeholder={copy.searchPlaceholder} />
        </Suspense>
      </HeroControlCard>

      <div className="max-w-5xl mx-auto w-full">
        <div className="mt-6 px-4">
          {packageRows.length === 0 ? (
            <EmptyState message={search ? `Sin resultados para "${search}"` : copy.empty} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {packageRows.map((pkg, i) => (
                  <Reveal key={pkg.id} delay={Math.min(i, 8) * 50}>
                    <PackageCard pkg={pkg} />
                  </Reveal>
                ))}
              </div>
              <PaginationNav
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                baseParams={baseParams}
                basePath="/paquetes"
              />
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <Package className="size-12 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
