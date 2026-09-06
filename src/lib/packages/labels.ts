// Shared "what is this package_item" label builder — used by the public
// package detail page (the "Qué incluye" list) and by /mis-reservas (the
// per-item rows on PackageLeaveReviewForm). Pulled out of
// src/app/(public)/paquetes/[slug]/page.tsx so both call sites stay in sync
// instead of duplicating the same join/label logic.

export type PackageIncludedItemRow = {
  id: string
  quantity_included: number
  services: { name: string; businesses: { name: string } | null } | null
  guide_tours: { name: string; tourist_guides: { profiles: { full_name: string | null } | null } | null } | null
}

export function resolvePackageItemLabel(row: PackageIncludedItemRow): string {
  return row.services
    ? `${row.services.name} — ${row.services.businesses?.name ?? ''}`
    : `${row.guide_tours?.name ?? ''} — ${row.guide_tours?.tourist_guides?.profiles?.full_name ?? ''}`
}
