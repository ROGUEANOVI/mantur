-- =============================================================
-- Migration: 20260913000000_add_provider_payout_sending_orphan_reset
--
-- Closes the last manual-only piece of provider_payouts reconciliation: a
-- row can get claimed into 'sending' (claim_provider_payout_for_send) and
-- then orphaned there forever if the process crashes between claiming it
-- and calling sendProviderPayout()/mark_provider_payout_result — no
-- existing path could ever reclaim a 'sending' row automatically
-- (claim_provider_payout_for_send only matches 'pending'/'failed', by
-- design, so a live in-flight Wompi call can never be double-claimed).
-- Until now this required a human to notice and use
-- mark_provider_payout_resolved_manually() in /admin/pagos-proveedores.
--
-- Safe to automate: sendProviderPayout()'s idempotency-key is the
-- provider_payouts.id itself (see src/lib/wompi/payouts.ts), so resetting
-- an orphaned row back to 'failed' and letting the normal retry path claim
-- it again can never cause Wompi to execute the same payout twice — this
-- is the exact same guarantee retryProviderPayout() and the reconciliation
-- cron already rely on for 'pending'/'failed' rows.
--
-- p_orphan_minutes defaults to 10 to match the existing SENDING_ORPHAN_MINUTES
-- constant (src/app/(app)/admin/pendingCounts.ts, also mirrored in
-- mark_provider_payout_resolved_manually's own 10-minute floor,
-- 20260901000000_add_provider_payout_manual_resolution.sql) — the daily
-- reconciliation cron (src/app/api/cron/reconcile-payouts/route.ts) calls
-- this explicitly with that same constant so there is one source of truth
-- on the TypeScript side.
--
-- Depends on:
--   20260830200000_create_provider_payouts_ledger (provider_payouts)
--   20260901000000_add_provider_payout_manual_resolution ('sending' status)
-- =============================================================

CREATE OR REPLACE FUNCTION public.reset_stale_sending_provider_payouts(p_orphan_minutes integer DEFAULT 10)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    UPDATE public.provider_payouts
    SET status = 'failed',
        error_message = 'orphaned sending row automatically reset by the daily reconciliation cron'
    WHERE status = 'sending'
      AND updated_at < now() - (p_orphan_minutes || ' minutes')::interval
    RETURNING provider_payouts.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_stale_sending_provider_payouts(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_stale_sending_provider_payouts(integer) TO service_role;
