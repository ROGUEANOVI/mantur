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

export default async function NegociosPage() {
  const supabase = await createClient()

  // Explicit filters mirror the public RLS condition — authenticated owners
  // and admins would otherwise see their own non-public listings here too.
  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id, name, description, type, images, address')
    .eq('verified', true)
    .eq('status', 'active')
    .order('name')

  if (error) throw new Error(error.message)

  const copy = businessesCopy.businesses

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero */}
      <section className="px-4 py-8 bg-gradient-to-br from-primary/10 to-accent/10">
        <h1 className="text-2xl font-bold text-foreground">{copy.pageTitle}</h1>
        <p className="mt-1 text-base text-muted-foreground">{copy.pageSubtitle}</p>
      </section>

      {/* Business grid */}
      <section className="px-4 mt-6">
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
      {/* Image area */}
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
            <Store
              className="size-12 text-primary/60"
              aria-hidden="true"
              strokeWidth={1.5}
            />
          </div>
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Type badge */}
        <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-xs font-medium px-2.5 py-1 rounded-full">
          {typeLabel}
        </span>

        {/* Business name on top of image */}
        <p className="absolute bottom-3 left-3 right-3 text-white font-semibold text-base leading-tight line-clamp-1">
          {business.name}
        </p>
      </div>

      {/* Card footer */}
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
            'hover:bg-primary/90 transition-colors'
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
      <Store
        className="size-12 text-muted-foreground/40"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
