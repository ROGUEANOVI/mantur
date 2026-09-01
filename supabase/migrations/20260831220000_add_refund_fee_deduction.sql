-- =============================================================
-- Migration: 20260831220000_add_refund_fee_deduction
--
-- Wompi retains its processing fee (2.65% + $700 COP + 19% IVA, see
-- 20260831210000_add_wompi_fee_tracking and estimateWompiFeeCents() in
-- src/lib/wompi/fees.ts) on any refund that is NOT an instant same-day
-- transaction void — the fee was already taken out of ManTur's settled
-- balance the moment the original charge cleared, and a manual bank-transfer
-- refund (refund_method='manual', the admin-initiated path) does not undo
-- that. Live-tested example against the actual merchant account: a $1,500
-- COP booking settled at $619.70 COP net (fee $880.30 COP) — proportionally
-- far larger than 2.65% because of the flat $700 COP component, which is why
-- this cannot be approximated as a flat percentage and must use the exact
-- per-transaction estimate already snapshotted in transactions.wompi_fee_cents.
--
-- Until now, refund_requests.refund_amount_cents was purely gross
-- (booking_amount_cents * refund_percentage), silently promising the tourist
-- their full policy-tier amount regardless of refund_method — for a manual
-- refund this overstates what ManTur can actually afford to send without
-- eating the fee itself.
--
-- Product decision (already made, not re-litigated here):
--   - refund_method = 'manual' -> deduct the tourist's own fee from what
--     they receive, floored at 0 (never negative).
--   - refund_method = 'void'   -> no deduction. A same-day pre-settlement
--     void is assumed fee-free by Wompi. This assumption is UNVERIFIED
--     against Wompi's real settlement report (flagged elsewhere, e.g.
--     docs/wompi-alegra-integration-plan.md) but is the agreed default
--     behavior until we can confirm it against an actual settled void.
--
-- Adds two nullable columns to refund_requests:
--   - wompi_fee_cents: a snapshot of transactions.wompi_fee_cents taken at
--     refund-request-insert time (application code populates this going
--     forward, same snapshot-at-request-time pattern already used for
--     refund_percentage/refund_amount_cents in 20260831000000). Nullable
--     because a transaction whose fee was never estimated (e.g. predates
--     20260831210000) has no snapshot to take.
--   - net_refund_amount_cents: what the tourist actually receives after any
--     fee deduction. Stays NULL until the row's status actually becomes
--     'processed' — the real refund_method (void vs manual) isn't known at
--     request-insert time, so there is nothing meaningful to compute yet.
--
-- Backfill is defensive: this project is early-stage and may have zero
-- refund_requests rows, but the UPDATEs must not error either way.
-- Already-'processed' historical rows backfill net = gross, since money that
-- has already been sent cannot be retroactively reconciled against a fee
-- snapshot that was never taken.
--
-- Depends on:
--   20260831000000_create_refund_engine
--   20260831100000_make_wompi_void_async
--   20260831210000_add_wompi_fee_tracking
-- =============================================================

ALTER TABLE public.refund_requests
  ADD COLUMN wompi_fee_cents        bigint CHECK (wompi_fee_cents >= 0),
  ADD COLUMN net_refund_amount_cents bigint CHECK (net_refund_amount_cents >= 0);

-- Backfill wompi_fee_cents for any existing rows from the transaction's own
-- fee snapshot (no-op if refund_requests is empty, which it may well be).
UPDATE public.refund_requests rr
SET wompi_fee_cents = t.wompi_fee_cents
FROM public.transactions t
WHERE t.id = rr.transaction_id AND rr.wompi_fee_cents IS NULL;

-- Already-processed rows: net = gross. The refund already happened under the
-- old gross-only behavior, so there is no fee to retroactively deduct from
-- money that has already left (or been kept in) the tourist's account.
UPDATE public.refund_requests
SET net_refund_amount_cents = refund_amount_cents
WHERE status = 'processed' AND net_refund_amount_cents IS NULL;

-- ------------------------------------------------------------
-- claim_refund_request_for_void(): also resets net_refund_amount_cents to
-- NULL. Defensive only — the row only reaches 'processing' here, never
-- 'processed', so nothing should be reading this column yet, but a stray
-- earlier value (e.g. a previously-rejected-then-resubmitted flow) must not
-- be misread as this claim's outcome.
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
      processed_by = NULL,
      net_refund_amount_cents = NULL
  WHERE id = p_refund_request_id
    AND status = 'pending'
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_refund_request_for_void(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_refund_request_for_void(uuid) TO service_role;

-- ------------------------------------------------------------
-- revert_refund_request_void_claim(): same defensive reset, mirroring the
-- claim above — undoing a claim should leave no stale net amount behind.
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
      refund_method = NULL,
      net_refund_amount_cents = NULL
  WHERE id = p_refund_request_id
    AND status = 'processing'
    AND refund_method = 'void'
    AND processed_by IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revert_refund_request_void_claim(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revert_refund_request_void_claim(uuid) TO service_role;

-- ------------------------------------------------------------
-- cascade_refund_to_booking(): this is the function that actually finalizes
-- a void to refund_requests.status = 'processed' (claim_refund_request_for_void
-- only ever reaches 'processing', see 20260831100000). A void is assumed
-- fee-free (see header), so net = gross here unconditionally — no deduction
-- logic needed, unlike mark_refund_request_processed() below.
-- Signature/return type unchanged from 20260831100000 (still RETURNS
-- boolean = whether the transactions row actually flipped paid -> voided),
-- so CREATE OR REPLACE is sufficient — no DROP FUNCTION needed here.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_refund_to_booking(p_refund_request_id uuid)
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
  SET status = 'processed',
      net_refund_amount_cents = refund_amount_cents
  WHERE id = p_refund_request_id
    AND status = 'processing';

  RETURN v_voided_tx_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cascade_refund_to_booking(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cascade_refund_to_booking(uuid) TO service_role;

-- ------------------------------------------------------------
-- mark_refund_request_processed(): the manual-admin resolution path (also
-- the void force-resolve fallback when Wompi's webhook confirmation never
-- arrives, see 20260831100000). Computes net_refund_amount_cents in the same
-- UPDATE that flips status to 'processed':
--   - p_method = 'manual': deduct the snapshotted Wompi fee, floored at 0
--     via LEAST() so the result always satisfies the new
--     net_refund_amount_cents >= 0 CHECK even if wompi_fee_cents somehow
--     exceeds refund_amount_cents.
--   - p_method = 'void' (the admin force-resolve edge case): no deduction,
--     same fee-free assumption as cascade_refund_to_booking() above.
-- COALESCE(wompi_fee_cents, 0): a missing fee snapshot (e.g. a transaction
-- that predates 20260831210000, or a request inserted before this
-- migration's application-code counterpart started populating it) must
-- deduct nothing — never treated as an unbounded/unknown fee.
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
      processed_by = p_processed_by,
      net_refund_amount_cents = CASE
        WHEN p_method = 'manual'
          THEN refund_amount_cents - LEAST(COALESCE(wompi_fee_cents, 0), refund_amount_cents)
        ELSE refund_amount_cents  -- p_method = 'void' (admin force-resolve edge case)
      END
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
