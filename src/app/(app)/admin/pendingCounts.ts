import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

export type SidebarPendingCounts = {
  negocios: number
  solicitudes: number
  reembolsos: number
}

// cache() memoizes per request, so the admin layout and the dashboard page
// can both call this in the same render without doubling the round trips.
export const getSidebarPendingCounts = cache(async (): Promise<SidebarPendingCounts> => {
  const admin = createAdminClient()

  const [{ count: negocios }, { count: solicitudes }, { count: reembolsos }] = await Promise.all([
    admin.from('businesses').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('role_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin
      .from('refund_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']),
  ])

  return {
    negocios: negocios ?? 0,
    solicitudes: solicitudes ?? 0,
    reembolsos: reembolsos ?? 0,
  }
})
