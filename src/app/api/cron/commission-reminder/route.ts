import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAdminEmails } from '@/lib/adminNotifications'
import { sendCommissionReminderEmail, type CommissionReminderGroup } from '@/lib/email/commissionEmails'

// Vercel Cron (see vercel.json) hits this once a week (Monday 9am). Purely
// informational — an internal nudge for the admin/founder to go collect
// commission manually (WhatsApp/transferencia), same as they already do.
// Never emails providers directly: that's a deliberate scope decision, not
// an oversight — see the commission-tracking design docs.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET is not configured; rejecting cron invocation')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    console.warn('Cron commission-reminder: invalid or missing bearer token')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: commissionsData, error: commissionsError } = await admin
    .from('provider_commissions')
    .select('recipient_type, recipient_id, commission_amount_cents')
    .eq('status', 'pending')

  if (commissionsError) {
    console.error('Failed to query pending provider commissions', commissionsError)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  const commissions = (commissionsData ?? []) as { recipient_type: 'business' | 'guide' | 'transporter'; recipient_id: string; commission_amount_cents: number }[]

  if (commissions.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: 'nothing pending' })
  }

  const businessIds = [...new Set(commissions.filter((c) => c.recipient_type === 'business').map((c) => c.recipient_id))]
  const guideIds = [...new Set(commissions.filter((c) => c.recipient_type === 'guide').map((c) => c.recipient_id))]
  const transporterIds = [...new Set(commissions.filter((c) => c.recipient_type === 'transporter').map((c) => c.recipient_id))]

  const [{ data: businesses }, { data: guides }, { data: transporters }] = await Promise.all([
    businessIds.length
      ? admin.from('businesses').select('id, name').in('id', businessIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    guideIds.length
      ? admin.from('tourist_guides').select('id, profiles!profile_id(full_name)').in('id', guideIds)
      : Promise.resolve({ data: [] as { id: string; profiles: { full_name: string | null } | null }[] }),
    transporterIds.length
      ? admin.from('transporters').select('id, profiles!profile_id(full_name)').in('id', transporterIds)
      : Promise.resolve({ data: [] as { id: string; profiles: { full_name: string | null } | null }[] }),
  ])

  const guideRows = (guides ?? []) as unknown as { id: string; profiles: { full_name: string | null } | null }[]
  const transporterRows = (transporters ?? []) as unknown as { id: string; profiles: { full_name: string | null } | null }[]

  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]))
  const guideNameById = new Map(guideRows.map((g) => [g.id, g.profiles?.full_name ?? '—']))
  const transporterNameById = new Map(transporterRows.map((t) => [t.id, t.profiles?.full_name ?? '—']))

  function recipientName(c: (typeof commissions)[number]): string {
    if (c.recipient_type === 'business') return businessNameById.get(c.recipient_id) ?? '—'
    if (c.recipient_type === 'guide') return guideNameById.get(c.recipient_id) ?? '—'
    return transporterNameById.get(c.recipient_id) ?? '—'
  }

  const groupsByKey = new Map<string, CommissionReminderGroup>()
  for (const c of commissions) {
    const key = `${c.recipient_type}:${c.recipient_id}`
    const existing = groupsByKey.get(key)
    if (existing) {
      existing.subtotalCents += c.commission_amount_cents
      existing.count += 1
    } else {
      groupsByKey.set(key, {
        recipientName: recipientName(c),
        recipientType: c.recipient_type,
        subtotalCents: c.commission_amount_cents,
        count: 1,
      })
    }
  }

  const groups = [...groupsByKey.values()]
  const totalCents = commissions.reduce((sum, c) => sum + c.commission_amount_cents, 0)

  const adminEmails = await resolveAdminEmails(admin)

  await Promise.all(adminEmails.map((email) => sendCommissionReminderEmail(email, groups, totalCents)))

  return NextResponse.json({ ok: true, sent: true, groups: groups.length, totalCents, emailsSent: adminEmails.length })
}
