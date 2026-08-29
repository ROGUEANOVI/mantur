-- =============================================================
-- Migration: 20260830100000_create_wompi_webhook_rpc
--
-- Step 2 of the Wompi payment integration (see
-- docs/wompi-alegra-integration-plan.md, §4.3). Adds
-- apply_wompi_webhook_transaction_update() — called exclusively by
-- src/app/api/webhooks/wompi/route.ts after it has independently verified
-- the event's X-Event-Checksum. This RPC is the only place that turns a
-- verified Wompi event into a bookings/transactions status change, so both
-- tables move together atomically and the update is naturally idempotent
-- against Wompi's own retry policy (up to 3 deliveries over 24h for the
-- same event) and safe under concurrent delivery of the same event.
--
-- Depends on:
--   20260730200000_create_bookings_transactions (bookings, transactions)
--   20260830000000_create_booking_transaction_rpc_and_payout_accounts
--     (this is the RPC that first inserts bookings/transactions with
--     status 'pending_payment'/'pending' once step 2's checkout redirect
--     is live — this migration is what resolves that pending state)
-- =============================================================

CREATE OR REPLACE FUNCTION public.apply_wompi_webhook_transaction_update(
  p_booking_id            uuid,
  p_wompi_transaction_id  text,
  p_wompi_status          text,
  p_wompi_amount_in_cents bigint,
  p_wompi_currency        text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transaction_status text;
  v_booking_status     text;
  v_updated_id         uuid;
BEGIN
  -- Wompi's transaction statuses, mapped to our own internal vocabulary.
  -- PENDING maps to a same-value no-op update below — it still lets us
  -- record wompi_reference the first time a PENDING event arrives, ahead
  -- of the terminal event that will actually flip the status.
  v_transaction_status := CASE p_wompi_status
    WHEN 'APPROVED' THEN 'paid'
    WHEN 'DECLINED' THEN 'failed'
    WHEN 'ERROR'    THEN 'failed'
    WHEN 'VOIDED'   THEN 'voided'
    WHEN 'PENDING'  THEN 'pending'
    ELSE NULL
  END;

  IF v_transaction_status IS NULL THEN
    RAISE EXCEPTION 'unknown wompi transaction status: %', p_wompi_status;
  END IF;

  v_booking_status := CASE v_transaction_status
    WHEN 'paid'   THEN 'confirmed'
    WHEN 'failed' THEN 'cancelled'
    WHEN 'voided' THEN 'cancelled'
    ELSE NULL -- 'pending': booking stays 'pending_payment', nothing to change yet
  END;

  -- The `AND status = 'pending'` guard is what makes this idempotent: once
  -- a terminal status (paid/failed/voided) has been applied, this WHERE
  -- clause can never match again for the same booking, so a retried or
  -- duplicated webhook delivery is a safe no-op (0 rows updated) instead of
  -- re-applying — or worse, overwriting — a later, more authoritative event.
  --
  -- The `AND amount_in_cents = ... AND currency = ...` guard closes a
  -- separate gap: Wompi's checksum only covers the fields listed in that
  -- event's own signature.properties (per Wompi's docs, typically
  -- transaction.id/status/amount_in_cents — NOT transaction.reference).
  -- A validly-signed event for a *different, smaller* real transaction
  -- could otherwise have its reference edited to point at an unrelated,
  -- larger booking and still pass checksum verification. Requiring the
  -- webhook's own amount/currency to match what was actually stored for
  -- this booking at creation time means such a mismatched event is a safe
  -- no-op instead of confirming payment for the wrong amount.
  UPDATE public.transactions
  SET wompi_reference = p_wompi_transaction_id,
      status = v_transaction_status
  WHERE booking_id = p_booking_id
    AND status = 'pending'
    AND amount_in_cents = p_wompi_amount_in_cents
    AND currency = p_wompi_currency
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_booking_status IS NOT NULL THEN
    UPDATE public.bookings
    SET status = v_booking_status
    WHERE id = p_booking_id;
  END IF;

  RETURN true;
END;
$$;

-- Same defense-in-depth posture as get_commission_rate() and
-- create_booking_with_transaction(): only service_role (i.e. the webhook
-- Route Handler via createAdminClient()) may call this.
REVOKE EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text) TO service_role;
