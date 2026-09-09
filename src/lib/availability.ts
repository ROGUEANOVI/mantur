import type { createAdminClient } from '@/lib/supabase/admin'

const DAYS_AHEAD = 90

// Projects an item's effective availability over the next DAYS_AHEAD days,
// combining three sources with the same 3-step resolution as
// is_item_available() (20260920000000_add_item_availability_and_transporter_routes.sql):
// a per-date row on the item itself wins outright (either direction); else a
// per-date row on the parent provider wins; else the parent's weekly
// recurring pattern; else available. Used by public detail pages to grey
// out/block dates in BlockedDatesPicker *before* the tourist submits —
// createServicePrereserva/createGuideTourPrereserva still re-check
// server-side via the SQL function itself, this is purely a read for
// display.
export async function getBlockedDates(
  admin: ReturnType<typeof createAdminClient>,
  itemType: string,
  itemId: string,
  parentType: string,
  parentId: string,
): Promise<string[]> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const endDate = new Date(`${today}T00:00:00Z`)
  endDate.setUTCDate(endDate.getUTCDate() + DAYS_AHEAD)
  const endDateStr = endDate.toISOString().slice(0, 10)

  const [itemRows, parentRows, weeklyRows] = await Promise.all([
    admin
      .from('provider_availability')
      .select('date, status')
      .eq('provider_type', itemType)
      .eq('provider_id', itemId)
      .gte('date', today)
      .lte('date', endDateStr),
    admin
      .from('provider_availability')
      .select('date, status')
      .eq('provider_type', parentType)
      .eq('provider_id', parentId)
      .gte('date', today)
      .lte('date', endDateStr),
    admin
      .from('provider_weekly_availability')
      .select('weekday, status')
      .eq('provider_type', parentType)
      .eq('provider_id', parentId),
  ])

  const itemOverrides = new Map<string, string>(
    (itemRows.data ?? []).map((r) => [r.date as string, r.status as string]),
  )
  const parentOverrides = new Map<string, string>(
    (parentRows.data ?? []).map((r) => [r.date as string, r.status as string]),
  )
  const weeklyUnavailable = new Set<number>(
    (weeklyRows.data ?? [])
      .filter((r) => r.status === 'unavailable')
      .map((r) => r.weekday as number),
  )

  const blocked: string[] = []
  for (
    const d = new Date(`${today}T00:00:00Z`);
    d <= endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dateStr = d.toISOString().slice(0, 10)

    const itemStatus = itemOverrides.get(dateStr)
    if (itemStatus === 'unavailable') {
      blocked.push(dateStr)
      continue
    }

    const parentStatus = parentOverrides.get(dateStr)
    if (parentStatus) {
      if (parentStatus === 'unavailable') blocked.push(dateStr)
      continue
    }

    if (weeklyUnavailable.has(d.getUTCDay())) blocked.push(dateStr)
  }

  return blocked
}
