-- =============================================================
-- Migration: 20260902000000_add_provider_payout_webhook_confirmation
--
-- Closes the "reserved for that future payouts-webhook confirmation" gap
-- flagged in provider_payouts.status's own column comment
-- (20260830200000_create_provider_payouts_ledger.sql): a payout that
-- reaches 'sent' (Wompi's Payouts API accepted the request) has never had a
-- way to learn whether Wompi's async bank transfer actually succeeded or
-- later got rejected. Wompi's own Payouts dashboard has a separate "URL de
-- Eventos" webhook subscription for exactly this (distinct product/secret
-- from the checkout transaction.updated webhook), received at
-- src/app/api/webhooks/wompi-payouts/route.ts.
--
-- 1. A partial unique index on provider_payouts.wompi_payout_id — the
--    webhook route needs to look up a payout row by Wompi's own id (the
--    value stored there by mark_provider_payout_result() when the payout
--    was originally sent), and this makes that lookup unambiguous. Partial
--    (WHERE wompi_payout_id IS NOT NULL) because the column is NULL for
--    every row that hasn't been sent yet.
--
-- 2. confirm_provider_payout_from_webhook() — called by the new webhook
--    route once it verifies the event's checksum. Mirrors the idempotency
--    pattern used everywhere else in this ledger
--    (apply_wompi_webhook_transaction_update, mark_provider_payout_result):
--    only transitions a row OUT OF 'sent', so a retried/duplicate webhook
--    delivery, or an event referencing an unknown/already-resolved payout,
--    is a silent no-op (0 rows updated), not an error.
--
-- Known accepted gap (documented, not solved here — same posture
-- 20260830200000's header comment used before 20260901000000 closed its own
-- flagged gap): if Wompi's async event somehow arrives before
-- mark_provider_payout_result() finishes writing status='sent' for that
-- same row (a race not expected in practice, since Wompi only fires this
-- event after our own POST /payouts call already returned), the event is
-- silently dropped rather than retried. Wompi's own webhook retry policy
-- (documented for the checkout product; assumed to apply here too) would
-- redeliver it, but that redelivery still requires status to have reached
-- 'sent' by the time it arrives.
--
-- Depends on:
--   20260830200000_create_provider_payouts_ledger (provider_payouts,
--     mark_provider_payout_result)
--   20260901000000_add_provider_payout_manual_resolution ('sending' status)
-- =============================================================

-- ------------------------------------------------------------
-- 1. Partial unique index on wompi_payout_id
-- ------------------------------------------------------------
CREATE UNIQUE INDEX provider_payouts_wompi_payout_id_key
  ON public.provider_payouts (wompi_payout_id)
  WHERE wompi_payout_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. confirm_provider_payout_from_webhook()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_provider_payout_from_webhook(
  p_wompi_payout_id text,
  p_status           text,
  p_error_message    text DEFAULT NULL
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'confirm_provider_payout_from_webhook only accepts paid/failed, got: %', p_status;
  END IF;

  RETURN QUERY
    UPDATE public.provider_payouts
    SET status = p_status,
        error_message = COALESCE(p_error_message, provider_payouts.error_message)
    WHERE wompi_payout_id = p_wompi_payout_id
      AND status = 'sent'
    RETURNING provider_payouts.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_provider_payout_from_webhook(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_provider_payout_from_webhook(text, text, text) TO service_role;
