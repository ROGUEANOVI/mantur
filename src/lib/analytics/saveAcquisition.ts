import type { createAdminClient } from '@/lib/supabase/admin'
import type { parseAcquisition } from '@/lib/analytics/attribution'

// Stores where a booking came from (bookings.acquisition_source/campaign).
// Never throws and never fails the booking: losing the channel of one sale
// is acceptable, losing the sale is not. Skipped when there's nothing to
// store (direct visit, admin left it blank).
export async function saveAcquisition(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  acquisition: ReturnType<typeof parseAcquisition>,
): Promise<void> {
  if (!acquisition.acquisition_source && !acquisition.acquisition_campaign) return
  try {
    const { error } = await admin.from('bookings').update(acquisition).eq('id', bookingId)
    if (error) console.error('saveAcquisition: update failed', { bookingId, error })
  } catch (err) {
    console.error('saveAcquisition: unexpected error', { bookingId, err })
  }
}
