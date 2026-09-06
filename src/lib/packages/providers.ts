import type { createAdminClient } from '@/lib/supabase/admin'

export type PackageProvider = { recipientType: 'business' | 'guide'; recipientId: string; amountCents: number }

// Shared by payoutPackageProviders() (admin/paquetes/solicitudes/actions.ts,
// money) and packageProviderNotifications.ts (email) so the package_items
// join and per-provider dedup/sum live in exactly one place — pulled out of
// actions.ts itself to avoid a circular import (actions.ts -> this file ->
// actions.ts) since the email side also needs it. package_items has no
// constraint preventing two rows from the same provider in one package
// (e.g. "desayuno" + "almuerzo" from the same negocio) — the
// UNIQUE(transaction_id, recipient_type, recipient_id) on provider_payouts
// would otherwise silently drop a second enqueue attempt, so amounts are
// grouped and summed here, before either caller acts on the result: at most
// one payout call AND one email per unique provider.
export async function resolvePackageProviders(
  admin: ReturnType<typeof createAdminClient>,
  packageId: string,
): Promise<PackageProvider[]> {
  const { data: items } = await admin
    .from('package_items')
    .select('internal_cost_cents, services(business_id), guide_tours(guide_id)')
    .eq('package_id', packageId)

  const amountByProvider = new Map<string, PackageProvider>()

  for (const item of (items ?? []) as unknown as {
    internal_cost_cents: number
    services: { business_id: string } | null
    guide_tours: { guide_id: string } | null
  }[]) {
    const recipientType = item.services ? 'business' : 'guide'
    const recipientId = item.services ? item.services.business_id : item.guide_tours?.guide_id
    if (!recipientId) continue

    const key = `${recipientType}:${recipientId}`
    const existing = amountByProvider.get(key)
    amountByProvider.set(key, {
      recipientType,
      recipientId,
      amountCents: (existing?.amountCents ?? 0) + item.internal_cost_cents,
    })
  }

  return [...amountByProvider.values()]
}
