import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { packagesCopy } from '@/lib/copy/packages'
import { breadcrumbsCopy } from '@/lib/copy/breadcrumbs'
import type { PricingUnit } from '@/lib/services/attributeConfig'
import { resolvePackageItemLabel, type PackageIncludedItemRow } from '@/lib/packages/labels'
import MediaGallery from '@/components/shared/MediaGallery'
import DetailSplitLayout from '@/components/shared/DetailSplitLayout'
import ExpandableText from '@/components/shared/ExpandableText'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import RatingSummary from '@/components/shared/RatingSummary'
import ReviewsList from '@/components/shared/ReviewsList'
import PackagePrereservaForm from '@/components/paquetes/PackagePrereservaForm'
import PackageWhatsappCta from '@/components/paquetes/PackageWhatsappCta'
import { packagePriceParts, packagePriceText } from '@/lib/packages/price'
import PackageDetailSections from '@/components/paquetes/PackageDetailSections'
import TrackView from '@/components/analytics/TrackView'
import type { PackageContentFields, PriceTier } from '@/lib/packages/content'
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
    .select('slug, name, summary, description, base_price, pricing_unit, images')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!data) return {}

  const title = data.name
  const description = buildMetaDescription(
    packagePriceText(data.base_price, data.pricing_unit),
    data.summary ?? data.description ?? 'Descubre este paquete en Manaure Balcón del Cesar.',
  )
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

// Search/link-preview snippet: "Desde $X por persona. <first sentence>",
// capped near Google's ~155-char display limit. The free-text description
// is long and emoji-heavy, so only its first meaningful line is used.
function buildMetaDescription(priceText: string, description: string): string {
  const firstLine =
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  const text = `${priceText}. ${firstLine}`
  return text.length > 155 ? `${text.slice(0, 152).trimEnd()}...` : text
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
} & PackageContentFields

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
    .select(
      'id, slug, name, description, base_price, pricing_unit, capacity, images, videos, ' +
        'summary, itinerary, includes, what_to_bring, duration_label, meeting_point, difficulty, min_people, ' +
        'payment_info, cancellation_policy',
    )
    .eq('slug', slug)
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const pkg = pkgRow as unknown as PackageDetail
  const copy = packagesCopy.detail
  const price = packagePriceParts(pkg.base_price, pkg.pricing_unit)

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

  // Public-select for active packages (package_price_tiers_select).
  const { data: tiersData } = await supabase
    .from('package_price_tiers')
    .select('min_people, max_people, amount, amount_basis')
    .eq('package_id', pkg.id)
    .order('min_people', { ascending: true })
  const tiers = (tiersData ?? []) as PriceTier[]

  // Once the admin fills the structured fields, they replace the old
  // free-text description on the page (which repeated the same info).
  const hasStructuredContent = pkg.includes.length > 0 || pkg.itinerary.length > 0

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
    description: pkg.summary ?? pkg.description ?? undefined,
    image: [pkg.images?.[0] ?? `${APP_URL}/opengraph-image`],
    url: `${APP_URL}/paquetes/${pkg.slug}`,
    provider: {
      '@type': 'TravelAgency',
      name: 'ManTur',
      url: APP_URL,
    },
    ...(pkg.itinerary.length > 0 && {
      itinerary: {
        '@type': 'ItemList',
        itemListElement: pkg.itinerary.map((step, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: { '@type': 'TouristAttraction', name: step },
        })),
      },
    }),
    // One offer per published group price, falling back to the "desde"
    // base price when no tiers are set.
    offers:
      tiers.length > 0
        ? tiers.map((tier) => ({
            '@type': 'Offer',
            price: String(tier.amount),
            priceCurrency: 'COP',
            availability: 'https://schema.org/InStock',
            eligibleQuantity: {
              '@type': 'QuantitativeValue',
              minValue: tier.min_people,
              ...(tier.max_people !== null && { maxValue: tier.max_people }),
              unitText: tier.amount_basis === 'per_group' ? 'grupo' : 'persona',
            },
          }))
        : {
            '@type': 'Offer',
            price: String(pkg.base_price),
            priceCurrency: 'COP',
            availability: 'https://schema.org/InStock',
          },
  }

  return (
    <main className="min-h-screen bg-background pb-28 lg:pb-10">
      {/* pb-28 below lg so the sticky WhatsApp bar never covers the last
          content block. */}
      <script {...jsonLdScriptProps(packageJsonLd)} />
      <TrackView
        event="view_item"
        dedupeKey={pkg.slug}
        params={{ paquete_id: pkg.slug, paquete_nombre: pkg.name, value: Number(pkg.base_price), currency: 'COP' }}
      />
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
                  {/* No "Aún no tiene reseñas" on a sales page: an empty
                      rating reads as negative social proof. */}
                  {reviews.length > 0 && (
                    <RatingSummary
                      avgRating={avgRating}
                      count={reviews.length}
                      noReviewsText=""
                      reviewCountText={packagesCopy.reviews.reviewCount}
                    />
                  )}
                </div>
                {pkg.summary && <p className="mt-3 text-base leading-relaxed text-foreground/80">{pkg.summary}</p>}
                {pkg.description && !hasStructuredContent && (
                  <ExpandableText text={pkg.description} clampLines={8} className="mt-4" />
                )}
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
              <p className="text-sm text-muted-foreground">
                {price.from} <span className="text-2xl font-extrabold text-accent tabular-nums">{price.amount}</span>
                {price.unit && <span> {price.unit}</span>}
              </p>
              {pkg.capacity != null && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm">
                    {copy.capacity}: {pkg.capacity}&nbsp;{copy.people}
                  </span>
                </div>
              )}
            </div>

            {/* WhatsApp is the primary contact for every visitor, signed in
                or not — closed sales are registered manually from the admin
                panel. The in-app pre-reserva stays below as a secondary path
                for tourists who prefer it. */}
            <div className="pt-1">
              <PackageWhatsappCta
                packageName={pkg.name}
                slug={pkg.slug}
                price={price}
                capacity={pkg.capacity}
                basePrice={Number(pkg.base_price)}
                pricingUnit={pkg.pricing_unit}
              />
            </div>

            <div className="pt-4">
              <PackageDetailSections
                content={pkg}
                tiers={tiers}
                providerItems={
                  includedItems.length > 0 ? (
                    <ul className="space-y-1.5">
                      {includedItems.map((item) => {
                        const itemRating = itemRatingsById.get(item.id)
                        return (
                          <li key={item.id} className="text-sm text-foreground flex items-baseline gap-1.5">
                            <span className="text-primary">•</span>
                            <span className="flex-1">
                              {item.label}
                              {item.quantity > 1 && <span className="text-muted-foreground"> ×{item.quantity}</span>}
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
                  ) : undefined
                }
              />
            </div>

            {reviews.length > 0 && (
              <section className="pt-2">
                <ReviewsList reviews={reviews} />
              </section>
            )}

            {bookingAccess !== 'other_role' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{copy.prereservaDivider}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <PackagePrereservaForm
                  packageId={pkg.id}
                  packageSlug={pkg.slug}
                  price={Number(pkg.base_price)}
                  capacity={pkg.capacity}
                  pricingUnit={pkg.pricing_unit}
                  access={bookingAccess}
                />
              </div>
            )}
          </Reveal>
        </DetailSplitLayout>
      </div>
    </main>
  )
}
