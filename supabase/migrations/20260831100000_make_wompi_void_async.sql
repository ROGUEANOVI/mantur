-- =============================================================
-- Migration: 20260831100000_make_wompi_void_async
--
-- Fixes a real gap in the automatic same-day refund void, caught by an
-- actual sandbox end-to-end test: Wompi's POST /transactions/{id}/void does
-- NOT synchronously flip the transaction to VOIDED in its own response —
-- the response we observed still showed `data.status: "APPROVED"` (the
-- pre-void status, unchanged), with the real VOIDED confirmation arriving
-- later via the normal transaction.updated webhook, exactly like the
-- original payment confirmation. Our code previously treated "response
-- doesn't show VOIDED" as an immediate failure and reverted the claim —
-- correct given what it could observe, but it never gave the async
-- confirmation a chance to land.
--
-- This migration:
--   1. Adds a 'processing' status to refund_requests — distinct from
--      'pending' (not yet claimed for a void attempt) and 'processed'
--      (confirmed done) — representing "void requested, awaiting Wompi's
--      webhook confirmation".
--   2. Updates claim_refund_request_for_void() to move pending -> processing
--      (was: pending -> processed, optimistically).
--   3. Updates revert_refund_request_void_claim() to match (processing ->
--      pending on a synchronous failure).
--   4. Updates cascade_refund_to_booking() to also flip the refund_requests
--      row itself to 'processed' (previously only touched
--      transactions/bookings, relying on the optimistic claim having
--      already set 'processed' — no longer true now that the claim sets
--      'processing'), and to return whether it actually applied (so a
--      caller can avoid sending a duplicate "processed" notification).
--   5. Adds confirm_refund_request_void_by_wompi_reference() — called from
--      the webhook route when it receives a VOIDED transaction.updated event
--      for a transaction already 'paid' (the existing
--      apply_wompi_webhook_transaction_update only ever transitions
--      pending -> paid/failed/voided, so it correctly no-ops for this case;
--      this is the missing paid -> voided confirmation path).
--   6. Widens mark_refund_request_processed()'s guard from status='pending'
--      to status IN ('pending', 'processing') so an admin can still force a
--      manual resolution if Wompi's webhook confirmation never arrives.
--   7. rejectRefundRequest (application code, updated alongside this
--      migration) gets the same widened guard.
--
-- SECURITY REVIEW FINDING (fixed here, not in a follow-up migration, since
-- this migration was never applied before the fix): an admin rejecting a
-- 'processing' row (the void request is already in flight at Wompi, and may
-- succeed) previously left transactions.status='paid'/bookings.status=
-- 'confirmed' permanently wrong once Wompi's own VOIDED confirmation
-- arrived — confirm_refund_request_void_by_wompi_reference()'s guard
-- required refund_requests.status='processing', which a 'rejected' row no
-- longer satisfies, so the actual money movement (Wompi really did void the
-- charge) was silently never reflected in our own ledger. Money-state
-- (transactions/bookings) must be authoritative from Wompi's own signal
-- regardless of what an admin already did to the refund_requests bookkeeping
-- row, so confirm_refund_request_void_by_wompi_reference() below now keys
-- its reconciliation purely on transactions.status = 'paid' (Wompi's VOIDED
-- event is always true regardless of our internal bookkeeping) and reports
-- a `bookkeeping_mismatch` flag when refund_requests was already resolved by
-- a human decision, so the webhook route can log it for follow-up instead of
-- silently dropping it or sending a contradicting "processed" email.
--
-- Depends on:
--   20260831000000_create_refund_engine
-- =============================================================

ALTER TABLE public.refund_requests DROP CONSTRAINT refund_requests_status_check;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_status_check
  CHECK (status IN ('pending', 'processing', 'processed', 'rejected'));

-- ------------------------------------------------------------
-- claim_refund_request_for_void(): pending -> processing (was -> processed)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_refund_request_for_void(p_refund_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.refund_requests
  SET status = 'processing',
      refund_method = 'void',
      processed_by = NULL
  WHERE id = p_refund_request_id
    AND status = 'pending'
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_refund_request_for_void(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_refund_request_for_void(uuid) TO service_role;

-- ------------------------------------------------------------
-- revert_refund_request_void_claim(): processing -> pending (was
-- processed -> pending) — only ever undoes our own optimistic claim, never
-- a manual admin action, same guard reasoning as before.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_refund_request_void_claim(p_refund_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.refund_requests
  SET status = 'pending',
      refund_method = NULL
  WHERE id = p_refund_request_id
    AND status = 'processing'
    AND refund_method = 'void'
    AND processed_by IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revert_refund_request_void_claim(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revert_refund_request_void_claim(uuid) TO service_role;

-- ------------------------------------------------------------
-- cascade_refund_to_booking(): now also finalizes refund_requests itself
-- (processing -> processed) since the claim step no longer does. Called
-- either from the synchronous path (Wompi's void response DID already
-- report VOIDED — some payment rails may confirm inline) or from
-- confirm_refund_request_void_by_wompi_reference() below (the async path).
-- Returns whether the transactions row actually flipped paid -> voided —
-- false means this was a no-op (already voided by a concurrent caller),
-- which callers use to avoid sending a duplicate "processed" notification.
-- Return type changed from void to boolean, so the prior definition must be
-- dropped first (Postgres cannot CREATE OR REPLACE across a signature change).
-- ------------------------------------------------------------
DROP FUNCTION public.cascade_refund_to_booking(uuid);

CREATE FUNCTION public.cascade_refund_to_booking(p_refund_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking_id     uuid;
  v_voided_tx_id   uuid;
BEGIN
  SELECT booking_id INTO v_booking_id
  FROM public.refund_requests
  WHERE id = p_refund_request_id;

  IF v_booking_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.transactions
  SET status = 'voided'
  WHERE booking_id = v_booking_id
    AND status = 'paid'
  RETURNING id INTO v_voided_tx_id;

  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE id = v_booking_id
    AND status = 'confirmed';

  UPDATE public.refund_requests
  SET status = 'processed'
  WHERE id = p_refund_request_id
    AND status = 'processing';

  RETURN v_voided_tx_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cascade_refund_to_booking(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cascade_refund_to_booking(uuid) TO service_role;

-- ------------------------------------------------------------
-- confirm_refund_request_void_by_wompi_reference(): the missing async
-- confirmation path. Called from the webhook route on every VOIDED
-- transaction.updated event. Resolves the refund_requests row via the
-- transaction's wompi_reference (not a refund_request_id directly — the
-- webhook only knows Wompi's own transaction id).
--
-- Deliberately keys the reconciliation on `t.status = 'paid'` ALONE, not on
-- refund_requests.status — Wompi confirming VOIDED is a fact about money
-- that already moved, and must be reflected in transactions/bookings
-- regardless of what an admin already did to the refund_requests bookkeeping
-- row in the meantime (e.g. rejected it while the void was still in flight
-- at Wompi). `t.status = 'paid'` is itself the idempotency guard: a second
-- delivery of the same event, or one arriving after the synchronous fast
-- path in requestRefund() already cascaded, finds the transaction already
-- 'voided' and safely no-ops (confirmed: false).
--
-- `bookkeeping_mismatch` is true when refund_requests.status was anything
-- other than 'processing' at the moment Wompi's confirmation landed (most
-- likely 'rejected' — an admin acted on the row while the void was still in
-- flight). The money side (transactions/bookings) is still corrected in
-- that case; the webhook route logs the mismatch for manual follow-up and
-- skips the "refund processed" email so it doesn't contradict whatever the
-- admin's own action already told the tourist.
--
-- Every output column is qualified through an alias (`rr.`) so none can
-- collide with the RETURNS TABLE OUT variables of the same name (see
-- 20260830210000_fix_ambiguous_column_wompi_webhook_rpc.sql for the bug this
-- pattern avoids).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_refund_request_void_by_wompi_reference(p_wompi_transaction_id text)
RETURNS TABLE (
  confirmed            boolean,
  refund_request_id    uuid,
  requested_by         uuid,
  refund_amount_cents  bigint,
  bookkeeping_mismatch boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund_request_id uuid;
  v_prior_status       text;
BEGIN
  SELECT rr.id, rr.status INTO v_refund_request_id, v_prior_status
  FROM public.refund_requests rr
  JOIN public.transactions t ON t.id = rr.transaction_id
  WHERE t.wompi_reference = p_wompi_transaction_id
    AND t.status = 'paid';

  IF v_refund_request_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::bigint, false;
    RETURN;
  END IF;

  PERFORM public.cascade_refund_to_booking(v_refund_request_id);

  RETURN QUERY
    SELECT true, rr.id, rr.requested_by, rr.refund_amount_cents, (v_prior_status <> 'processing')
    FROM public.refund_requests rr
    WHERE rr.id = v_refund_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_refund_request_void_by_wompi_reference(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.confirm_refund_request_void_by_wompi_reference(text) TO service_role;

-- ------------------------------------------------------------
-- mark_refund_request_processed(): widen the guard so an admin can force a
-- manual resolution on a 'processing' row too (Wompi's webhook confirmation
-- never arriving is a real, expected edge case — this is the same
-- fallback-to-manual pattern already used for the non-void-eligible cases).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_refund_request_processed(
  p_refund_request_id uuid,
  p_method            text,
  p_processed_by      uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  IF p_method NOT IN ('void', 'manual') THEN
    RAISE EXCEPTION 'unknown refund method: %', p_method;
  END IF;

  UPDATE public.refund_requests
  SET status = 'processed',
      refund_method = p_method,
      processed_by = p_processed_by
  WHERE id = p_refund_request_id
    AND status IN ('pending', 'processing')
  RETURNING booking_id INTO v_booking_id;

  IF v_booking_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.transactions
  SET status = 'voided'
  WHERE booking_id = v_booking_id
    AND status = 'paid';

  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE id = v_booking_id
    AND status = 'confirmed';

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_refund_request_processed(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_refund_request_processed(uuid, text, uuid) TO service_role;
