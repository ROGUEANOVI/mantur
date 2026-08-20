/**
 * Two-column split for detail pages: the gallery (plus whatever the caller
 * bundles into that slot — typically name + description) stays sticky on
 * `lg:` while the rest of the info (contact details, price, services, a
 * booking CTA, ...) scrolls past it with the page. Below `lg:` it's just
 * document order — no grid classes apply, so mobile/tablet stay stacked.
 *
 * The sticky `top` offset is pinned to `PublicNav`'s rendered height
 * (`header` in src/components/layout/PublicNav.tsx, measured at 57px —
 * keep this in sync if that header's height ever changes). `position:
 * sticky` doesn't just kick in once scrolled past that offset — if the
 * offset is *larger* than the column's natural (unscrolled) position, the
 * browser pushes the column down to it immediately, even at scroll 0. Since
 * the non-sticky info column has no such push, a too-large offset here
 * (this used to be `top-24`/96px, well past the header's 57px) desynced the
 * two columns' starting position before any scrolling ever happened.
 */
export default function DetailSplitLayout({
  gallery,
  children,
}: {
  gallery: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:items-start">
      <div className="lg:sticky lg:top-14 lg:self-start">{gallery}</div>
      <div className="mt-4 lg:mt-0">{children}</div>
    </div>
  )
}
