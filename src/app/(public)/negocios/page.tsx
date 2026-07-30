import Link from 'next/link'
import { Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'

type BusinessRow = {
  id: string
  name: string
  description: string | null
  type: string
  images: string[] | null
  address: string | null
}

const VALID_TYPES = ['resort', 'restaurant', 'farm', 'eatery', 'other'] as const
type BusinessType = (typeof VALID_TYPES)[number]

export default async function NegociosPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type: rawType } = await searchParams
  const typeFilter: BusinessType | null =
    VALID_TYPES.includes(rawType as BusinessType) ? (rawType as BusinessType) : null

  const supabase = await createClient()

  let query = supabase
    .from('businesses')
    .select('id, name, description, type, images, address')
    .eq('verified', true)
    .eq('status', 'active')
    .order('name')

  if (typeFilter) query = query.eq('type', typeFilter)

  const { data: businesses, error } = await query

  if (error) throw new Error(error.message)

  const copy = businessesCopy.businesses

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero */}
      <section className="px-4 py-8 bg-gradient-to-br from-emerald-600 to-teal-600">
        <h1 className="text-2xl font-bold text-white">{copy.pageTitle}</h1>
        <p className="mt-1 text-base text-white/80">{copy.pageSubtitle}</p>
      </section>

      {/* Type filter pills */}
      <section className="px-4 py-4 flex gap-2 overflow-x-auto scrollbar-none">
        <Link
          href="/negocios"
          className={cn(
            'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
            !typeFilter
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          Todos
        </Link>
        {VALID_TYPES.map((t) => (
          <Link
            key={t}
            href={`/negocios?type=${t}`}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              typeFilter === t
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {copy.types[t]}
          </Link>
        ))}
      </section>

      {/* Business grid */}
      <section className="px-4 mt-2">
        {!businesses || businesses.length === 0 ? (
          <EmptyState message={copy.empty} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(businesses as BusinessRow[]).map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function BusinessCard({ business }: { business: BusinessRow }) {
  const copy = businessesCopy.businesses
  const imageUrl = business.images?.[0]
  const typeLabel = copy.types[business.type] ?? copy.types.other

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-card">
      <div className="relative aspect-[4/3]">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label={business.name}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Store className="size-12 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-xs font-medium px-2.5 py-1 rounded-full">
          {typeLabel}
        </span>
        <p className="absolute bottom-3 left-3 right-3 text-white font-semibold text-base leading-tight line-clamp-1">
          {business.name}
        </p>
      </div>

      <div className="p-4">
        {business.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {business.description}
          </p>
        )}
        <Link
          href={`/negocios/${business.id}`}
          className={cn(
            'flex items-center justify-center w-full min-h-[44px]',
            'rounded-xl bg-primary text-primary-foreground',
            'text-sm font-medium px-4 py-2.5',
            'hover:bg-primary/90 transition-colors',
          )}
        >
          {copy.viewDetail}
        </Link>
      </div>
    </div>
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
