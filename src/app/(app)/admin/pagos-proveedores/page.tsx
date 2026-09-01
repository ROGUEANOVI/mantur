import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { STUCK_PAYOUT_HOURS } from '../pendingCounts'
import { retryProviderPayout } from './actions'
import ResolvePayoutManuallyForm from './ResolvePayoutManuallyForm'

// Mirrors the 10-minute floor in mark_provider_payout_resolved_manually
// (supabase/migrations/20260901000000_add_provider_payout_manual_resolution.sql)
// — a live Wompi call completes or times out in seconds, so a 'sending' row
// younger than this is presumed still genuinely in flight. Kept in sync
// manually since one runs in Postgres and the other gates the button here.
const SENDING_ORPHAN_MINUTES = 10

type PayoutRow = {
  id: string
  transaction_id: string
  recipient_type: string
  recipient_id: string
  amount_cents: number
  status: string
  error_message: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
  resolver: { full_name: string | null } | null
}

type EnrichedPayoutRow = PayoutRow & {
  recipientName: string
  wompiReference: string | null
  canResolveManually: boolean
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCOP(cents: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function AdminPagosProveedoresPage() {
  const admin = createAdminClient()
  const copy = adminCopy.pagosProveedores
  const stuckPayoutCutoff = new Date(Date.now() - STUCK_PAYOUT_HOURS * 60 * 60 * 1000).toISOString()

  const sendingOrphanCutoff = new Date(Date.now() - SENDING_ORPHAN_MINUTES * 60 * 1000).toISOString()

  const { data: payoutRows } = await admin
    .from('provider_payouts')
    .select(
      'id, transaction_id, recipient_type, recipient_id, amount_cents, status, error_message, admin_notes, created_at, updated_at, resolver:profiles!resolved_by(full_name)',
    )
    // 'sending' is included so a row orphaned by a crash mid-retry (rare —
    // that status has no automatic timeout, see the migration comment on
    // claim_provider_payout_for_retry) stays visible and resolvable instead
    // of silently disappearing from this page.
    .in('status', ['failed', 'pending', 'sending'])
    .order('created_at', { ascending: true })

  // 'failed' and 'sending' are stuck at any age; 'pending' is only stuck
  // once it's sat unsent past STUCK_PAYOUT_HOURS — same definition the
  // dashboard's attention-queue count uses, so the two numbers never disagree.
  const stuck = ((payoutRows ?? []) as unknown as PayoutRow[]).filter(
    (p) => p.status === 'failed' || p.status === 'sending' || p.created_at < stuckPayoutCutoff,
  )

  // recipient_id is deliberately not a FK (recipient_type picks which table
  // it belongs to), so PostgREST can't embed the name in one query — resolve
  // business/guide names in two small batched lookups instead.
  const businessIds = stuck.filter((p) => p.recipient_type === 'business').map((p) => p.recipient_id)
  const guideIds = stuck.filter((p) => p.recipient_type === 'guide').map((p) => p.recipient_id)
  const transactionIds = stuck.map((p) => p.transaction_id)

  type GuideNameRow = { id: string; profiles: { full_name: string | null } | null }

  const [{ data: businesses }, { data: guides }, { data: transactions }] = await Promise.all([
    businessIds.length
      ? admin.from('businesses').select('id, name').in('id', businessIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    guideIds.length
      ? admin.from('tourist_guides').select('id, profiles!profile_id(full_name)').in('id', guideIds)
      : Promise.resolve({ data: [] as GuideNameRow[] }),
    transactionIds.length
      ? admin.from('transactions').select('id, wompi_reference').in('id', transactionIds)
      : Promise.resolve({ data: [] as { id: string; wompi_reference: string | null }[] }),
  ])

  const businessNameById = new Map((businesses ?? []).map((b) => [b.id, b.name]))
  const guideNameById = new Map(
    ((guides ?? []) as unknown as GuideNameRow[]).map((g) => [g.id, g.profiles?.full_name ?? copy.unknownRecipient]),
  )
  const wompiReferenceByTxId = new Map((transactions ?? []).map((t) => [t.id, t.wompi_reference]))

  const rows: EnrichedPayoutRow[] = stuck.map((p) => ({
    ...p,
    recipientName:
      (p.recipient_type === 'business' ? businessNameById.get(p.recipient_id) : guideNameById.get(p.recipient_id)) ??
      copy.unknownRecipient,
    wompiReference: wompiReferenceByTxId.get(p.transaction_id) ?? null,
    // Mirrors mark_provider_payout_resolved_manually's own WHERE exactly —
    // 'pending'/'failed' are always resolvable; 'sending' only once it's
    // provably not still a live in-flight Wompi call (see the constant's
    // comment). Rendering the button only when the RPC would actually
    // succeed keeps the UI honest instead of offering an action that fails.
    canResolveManually: p.status !== 'sending' || p.updated_at < sendingOrphanCutoff,
  }))

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm line-clamp-1">{row.recipientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {copy.recipientTypeLabels[row.recipient_type] ?? row.recipient_type}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-destructive shrink-0">
                    {copy.statusLabels[row.status] ?? row.status}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">{copy.amount}: </span>
                    {formatCOP(row.amount_cents)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">{copy.since}: </span>
                    {formatDatetime(row.created_at)}
                  </p>
                  {row.error_message && (
                    <p>
                      <span className="font-medium text-foreground">{copy.reason}: </span>
                      {row.error_message}
                    </p>
                  )}
                  {row.wompiReference && (
                    <p>
                      <span className="font-medium text-foreground">{copy.wompiReference}: </span>
                      {row.wompiReference}
                    </p>
                  )}
                  {row.admin_notes && (
                    <p>
                      <span className="font-medium text-foreground">
                        {copy.resolvedBy}
                        {row.resolver?.full_name ? ` (${row.resolver.full_name})` : ''}:{' '}
                      </span>
                      {row.admin_notes}
                    </p>
                  )}
                  <p className="pt-1 font-mono text-[11px] text-muted-foreground/70">
                    {copy.payoutId}: {row.id}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground/70">
                    {copy.transactionId}: {row.transaction_id}
                  </p>
                </div>

                {row.status === 'sending' && !row.canResolveManually && (
                  <p className="text-xs text-muted-foreground">{copy.sendingHint}</p>
                )}

                {(row.status !== 'sending' || row.canResolveManually) && (
                  <div className="flex gap-2 pt-1">
                    {row.status !== 'sending' && (
                      <form action={retryProviderPayout} className="flex-1">
                        <input type="hidden" name="payoutId" value={row.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-8.5 hover:bg-primary/90 transition-colors"
                        >
                          {copy.retry}
                        </button>
                      </form>
                    )}
                    {row.canResolveManually && (
                      <div className="flex-1">
                        <ResolvePayoutManuallyForm payoutId={row.id} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
