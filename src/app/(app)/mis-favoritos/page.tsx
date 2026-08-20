import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import BusinessCard, { type BusinessCardRow } from '@/components/shared/BusinessCard'
import PlaceCard, { type PlaceCardRow } from '@/components/shared/PlaceCard'
import { favoritesCopy } from '@/lib/copy/favorites'

export const metadata: Metadata = {
  title: favoritesCopy.page.pageTitle,
}

export default async function MisFavoritosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const copy = favoritesCopy.page

  // The (app) route group layout already redirects guests to /login before
  // this renders — user is only null here in the instant between that check
  // and this one, which Next.js won't actually reach.
  if (!user) return null

  const { data: favoriteRows } = await supabase
    .from('favorites')
    .select('entity_type, entity_id')
    .eq('user_id', user.id)

  const businessIds = (favoriteRows ?? [])
    .filter((f) => f.entity_type === 'business')
    .map((f) => f.entity_id)
  const placeIds = (favoriteRows ?? [])
    .filter((f) => f.entity_type === 'place')
    .map((f) => f.entity_id)

  let businessRows: BusinessCardRow[] = []
  if (businessIds.length > 0) {
    const { data } = await supabase
      .from('businesses')
      .select(
        'id, slug, name, description, images, address, business_category_links(business_categories(name, slug))',
      )
      .in('id', businessIds)
      .eq('verified', true)
      .eq('status', 'active')
    businessRows = (data ?? []) as unknown as BusinessCardRow[]
  }

  let placeRows: PlaceCardRow[] = []
  if (placeIds.length > 0) {
    const { data } = await supabase
      .from('places')
      .select('id, slug, name, description, type, images')
      .in('id', placeIds)
    placeRows = (data ?? []) as PlaceCardRow[]
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{copy.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.pageSubtitle}</p>
        </div>

        <section className="mb-10">
          <h2 className="text-base font-semibold text-foreground mb-3">{copy.businessesTitle}</h2>
          {businessRows.length === 0 ? (
            <EmptyState message={copy.emptyBusinesses} ctaLabel={copy.exploreBusinesses} ctaHref="/negocios" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {businessRows.map((business) => (
                <BusinessCard key={business.id} business={business} isFavorited isGuest={false} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">{copy.placesTitle}</h2>
          {placeRows.length === 0 ? (
            <EmptyState message={copy.emptyPlaces} ctaLabel={copy.explorePlaces} ctaHref="/lugares" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {placeRows.map((place) => (
                <PlaceCard key={place.id} place={place} isFavorited isGuest={false} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function EmptyState({
  message,
  ctaLabel,
  ctaHref,
}: {
  message: string
  ctaLabel: string
  ctaHref: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border py-10 text-center">
      <Heart className="size-10 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href={ctaHref} className="text-sm font-semibold text-primary hover:underline">
        {ctaLabel}
      </Link>
    </div>
  )
}
