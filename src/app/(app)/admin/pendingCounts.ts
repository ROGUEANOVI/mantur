import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// A 'pending' provider_payouts row older than this is considered stuck (no
// automatic retry exists yet — see 20260830200000_create_provider_payouts_ledger.sql).
// 'failed' rows are always stuck regardless of age. Shared by the dashboard's
// attention-queue count and /admin/pagos-proveedores' listing, which must
// agree on the same definition of "stuck".
export const STUCK_PAYOUT_HOURS = 48

export type SidebarPendingCounts = {
  negocios: number
  solicitudes: number
  // Total across both unresolved refund statuses — used for the sidebar/
  // mobile-menu badge, which just needs a single number.
  reembolsos: number
  // Split out so the dashboard attention card can link to whichever status
  // actually has something in it (a 'processing' refund — e.g. a same-day
  // void awaiting Wompi's webhook confirmation — is unresolved too, but
  // /admin/reembolsos filters by exactly one status per tab, so a single
  // hardcoded '?status=pending' link would 404-empty a genuinely pending
  // 'processing' request).
  reembolsosPending: number
  reembolsosProcessing: number
}

// cache() memoizes per request, so the admin layout and the dashboard page
// can both call this in the same render without doubling the round trips.
export const getSidebarPendingCounts = cache(async (): Promise<SidebarPendingCounts> => {
  const admin = createAdminClient()

  const [{ count: negocios }, { count: solicitudes }, { count: reembolsosPending }, { count: reembolsosProcessing }] =
    await Promise.all([
      admin.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('role_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('refund_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('refund_requests').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
    ])

  return {
    negocios: negocios ?? 0,
    solicitudes: solicitudes ?? 0,
    reembolsos: (reembolsosPending ?? 0) + (reembolsosProcessing ?? 0),
    reembolsosPending: reembolsosPending ?? 0,
    reembolsosProcessing: reembolsosProcessing ?? 0,
  }
})
