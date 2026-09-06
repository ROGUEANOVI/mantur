import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { packagesCopy } from '@/lib/copy/packages'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import { PRICING_UNIT_LABELS, type PricingUnit } from '@/lib/services/attributeConfig'
import { resolvePackageItemLabel, type PackageIncludedItemRow } from '@/lib/packages/labels'
import MediaGallery from '@/components/shared/MediaGallery'
import DetailSplitLayout from '@/components/shared/DetailSplitLayout'
import ExpandableText from '@/components/shared/ExpandableText'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import RatingSummary from '@/components/shared/RatingSummary'
import ReviewsList from '@/components/shared/ReviewsList'
import PackagePrereservaForm from '@/components/paquetes/PackagePrereservaForm'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'
import Reveal from '@/components/shared/Reveal'

const APP_URL = 'https://mantur.co'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const { data } = await createAdminClient()
    .from('packages')
    .select('slug, name, description, images')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!data) return {}

  const title = data.name
  const description = data.description ?? `Descubre este paquete en Manaure Balcón del Cesar.`
  const image = (data.images as string[] | null)?.[0]
  const url = `${APP_URL}/paquetes/${data.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

type PackageDetail = {
  id: string
  slug: string
  name: string
  description: string | null
  base_price: string | number
  pricing_unit: PricingUnit
  capacity: number | null
  images: string[] | null
  videos: string[] | null
}

// Public-safe columns only — package_items has no public SELECT RLS policy
// (it holds internal_cost_cents, the negotiated cost ManTur pays each
// provider, which must never reach a tourist), so this reads it through
// createAdminClient() with an explicit column list rather than the
// RLS-respecting client. Never add internal_cost_cents to this select.
type IncludedItemRow = PackageIncludedItemRow

export default async function PaqueteDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: pkgRow, error } = await supabase
    .from('packages')
    .select('id, slug, name, description, base_price, pricing_unit, capacity, images, videos')
    .eq('slug', slug)
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const pkg = pkgRow as PackageDetail
  const copy = packagesCopy.detail

  // Packages keep a real in-app pre-reserva flow (unlike services/guide
  // tours, WhatsApp-only since the manual-ops pivot) — same tourist/guest/
  // other_role access gate already used for guide tour bookings
  // (guias/[slug]/page.tsx).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let bookingAccess: 'tourist' | 'guest' | 'other_role' = 'guest'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    bookingAccess = profile?.role === 'tourist' ? 'tourist' : 'other_role'
  }

  const { data: itemsData } = await createAdminClient()
    .from('package_items')
    .select(
      'id, quantity_included, services(name, businesses(name)), guide_tours(name, tourist_guides(profiles!profile_id(full_name)))',
    )
    .eq('package_id', pkg.id)
    .order('created_at', { ascending: true })

  const includedItems = ((itemsData ?? []) as unknown as IncludedItemRow[]).map((row) => ({
    id: row.id,
    label: resolvePackageItemLabel(row),
    quantity: row.quantity_included,
  }))

  const itemIds = includedItems.map((item) => item.id)

  // Both tables are public-select (see 20260916000000_create_package_reviews.sql)
  // — read via the RLS-respecting client, not the admin one, unlike
  // package_items itself above.
  const { data: reviewsData } = await supabase
    .from('package_reviews')
    .select('rating, comment, created_at')
    .eq('package_id', pkg.id)
    .order('created_at', { ascending: false })

  const reviews = (reviewsData ?? []) as { rating: number; comment: string | null; created_at: string }[]
  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null

  const itemRatingsById = new Map<string, { sum: number; count: number }>()
  if (itemIds.length > 0) {
    const { data: itemReviewsData } = await supabase
      .from('package_item_reviews')
      .select('package_item_id, rating')
      .in('package_item_id', itemIds)

    for (const row of (itemReviewsData ?? []) as { package_item_id: string; rating: number }[]) {
      const entry = itemRatingsById.get(row.package_item_id) ?? { sum: 0, count: 0 }
      entry.sum += row.rating
      entry.count += 1
      itemRatingsById.set(row.package_item_id, entry)
    }
  }

  const packageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: pkg.name,
    description: pkg.description ?? undefined,
    image: [pkg.images?.[0] ?? `${APP_URL}/opengraph-image`],
    provider: {
      '@type': 'Organization',
      name: 'ManTur',
    },
    offers: {
      '@type': 'Offer',
      price: String(pkg.base_price),
      priceCurrency: 'COP',
      availability: 'https://schema.org/InStock',
    },
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <script {...jsonLdScriptProps(packageJsonLd)} />
      <div className="max-w-5xl mx-auto px-4">
        <DetailSplitLayout
          gallery={
            <>
              <Breadcrumbs
                items={[
                  { label: breadcrumbsCopy.home, href: '/' },
                  { label: breadcrumbsCopy.packages, href: '/paquetes' },
                  { label: pkg.name },
                ]}
              />

              <MediaGallery images={pkg.images ?? []} videos={pkg.videos ?? []} name={pkg.name} />

              <div className="mt-4">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-2xl font-bold text-foreground leading-tight">{pkg.name}</h1>
                  <RatingSummary
                    avgRating={avgRating}
                    count={reviews.length}
                    noReviewsText={packagesCopy.reviews.noReviewsYet}
                    reviewCountText={packagesCopy.reviews.reviewCount}
                  />
                </div>
                {pkg.description && <ExpandableText text={pkg.description} className="mt-4" />}
              </div>
            </>
          }
        >
          {/* Invisible spacer matching the breadcrumb's height, same trick
              used on the other detail pages so this column starts level
              with the mosaic instead of the breadcrumb. */}
          <div className="invisible" aria-hidden="true">
            <Breadcrumbs
              items={[
                { label: breadcrumbsCopy.home, href: '/' },
                { label: breadcrumbsCopy.packages, href: '/paquetes' },
                { label: pkg.name },
              ]}
            />
          </div>

          <Reveal className="space-y-3">
            <div className="space-y-2">
              {pkg.capacity != null && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm">
                    {copy.capacity}: {pkg.capacity}&nbsp;{copy.people}
                  </span>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {PRICING_UNIT_LABELS[pkg.pricing_unit]}:{' '}
                <span className="text-base font-semibold text-accent">
                  ${Number(pkg.base_price).toLocaleString('es-CO')} COP
                </span>
              </p>
            </div>

            <section className="pt-2">
              <h2 className="text-base font-semibold text-foreground mb-2">{copy.includedTitle}</h2>
              {includedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{copy.includedEmpty}</p>
              ) : (
                <ul className="space-y-1.5">
                  {includedItems.map((item) => {
                    const itemRating = itemRatingsById.get(item.id)
                    return (
                      <li key={item.id} className="text-sm text-foreground flex items-baseline gap-1.5">
                        <span className="text-primary">•</span>
                        <span className="flex-1">
                          {item.label}
                          {item.quantity > 1 && (
                            <span className="text-muted-foreground"> ×{item.quantity}</span>
                          )}
                        </span>
                        {itemRating && (
                          <RatingSummary
                            avgRating={itemRating.sum / itemRating.count}
                            count={itemRating.count}
                            noReviewsText=""
                            reviewCountText={packagesCopy.reviews.itemReviewCount}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {reviews.length > 0 && (
              <section className="pt-2">
                <ReviewsList reviews={reviews} />
              </section>
            )}

            <div className="pt-2">
              <PackagePrereservaForm
                packageId={pkg.id}
                price={Number(pkg.base_price)}
                capacity={pkg.capacity}
                pricingUnit={pkg.pricing_unit}
                access={bookingAccess}
              />
            </div>
          </Reveal>
        </DetailSplitLayout>
      </div>
    </main>
  )
}
