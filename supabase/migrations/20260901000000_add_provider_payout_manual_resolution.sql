-- =============================================================
-- Migration: 20260901000000_add_provider_payout_manual_resolution
--
-- Closes the "known gap" flagged in the header comment of
-- 20260830200000_create_provider_payouts_ledger.sql and required by
-- CLAUDE.md before real (non-sandbox) payouts go live: a provider_payouts
-- row can get stuck at status='pending' or 'failed' forever — nothing
-- currently retries it, and /admin/pagos-proveedores (already built) is
-- read-only. Two admin-triggered resolution paths are added:
--
--   1. Retry — re-attempt the actual Wompi Payouts API call for a stuck
--      row. Handles transient failures (network blip, momentary Wompi
--      outage, etc).
--   2. Manual resolution — the admin pays the recipient out-of-band (bank
--      transfer) and records that the payout is done. Handles structural
--      failures a retry can never fix — e.g. a real stuck row seen today
--      with error_message 'no payout account configured for business ...'
--      (the recipient never finished setting up a payout account, so
--      retrying the same Wompi call would just fail again forever).
--
-- The retry path needs a claim step distinct from the resolve step for the
-- same structural reason as the refund engine's same-day-void problem
-- (20260831000000_create_refund_engine /
-- 20260831100000_make_wompi_void_async): the actual Wompi Payouts API call
-- is an external HTTP request that cannot happen inside the same DB
-- transaction as the claim. This migration mirrors that exact
-- claim/resolve shape rather than inventing a new one:
--
--   - 'sending' is added as a new provider_payouts.status value, playing
--     the same role as refund_requests.status = 'processing' — a
--     transient "claimed for an in-flight attempt" marker, not a terminal
--     state.
--   - claim_provider_payout_for_send() atomically moves a row from
--     'pending'/'failed' to 'sending' and returns the data the caller
--     needs to actually place the Wompi call (transaction_id,
--     recipient_type, recipient_id, amount_cents), avoiding a second round
--     trip — these fields are immutable once the row exists, so returning
--     them from the same UPDATE is safe. Used by BOTH the webhook route's
--     automatic attempt and the admin retry action (see its own comment for
--     why both, not just retry — a security-review fix, not the original
--     design).
--   - mark_provider_payout_result()'s existing guard is widened from
--     status = 'pending' to status IN ('pending', 'sending') so it can
--     resolve a row claimed by either caller above.
--
-- Unlike refund_requests.status = 'processing', 'sending' has no webhook
-- that eventually confirms it, so it has no automatic timeout/reversion in
-- this design — mark_provider_payout_resolved_manually() below is the
-- escape hatch for a 'sending' row orphaned by a crash mid-send, gated on
-- the row having sat in 'sending' for at least 10 minutes (see that
-- function's own comment for the double-payment race this specifically
-- closes).
--
-- Also adds two columns to provider_payouts:
--   - admin_notes text — free-text note an admin leaves when manually
--     resolving a payout (e.g. "paid via Bancolombia transfer, ref #123").
--   - resolved_by uuid REFERENCES profiles(id) — same convention as
--     refund_requests.processed_by: NULL means no admin has ever touched
--     this row; non-NULL means an admin triggered either a retry attempt
--     or a manual resolution. One column serves both cases — status +
--     resolved_by together already disambiguate which: sent/failed with a
--     non-null resolved_by is an admin-triggered retry outcome; paid with
--     a non-null resolved_by is a manual resolution; paid with a NULL
--     resolved_by is reserved for a future automatic payouts-webhook
--     confirmation, exactly as provider_payouts.status's original column
--     comment in 20260830200000 already described for 'paid'.
--
-- Depends on:
--   20260830200000_create_provider_payouts_ledger (provider_payouts,
--     mark_provider_payout_result)
-- =============================================================

-- ------------------------------------------------------------
-- 1. Widen the status CHECK to add 'sending'. provider_payouts_status_check
-- is Postgres's default auto-generated name for the unnamed inline CHECK on
-- the status column in the original CREATE TABLE (20260830200000) — same
-- <table>_<column>_check convention as refund_requests_status_check, which
-- 20260831100000_make_wompi_void_async.sql widened the same way.
-- ------------------------------------------------------------
ALTER TABLE public.provider_payouts DROP CONSTRAINT provider_payouts_status_check;
ALTER TABLE public.provider_payouts ADD CONSTRAINT provider_payouts_status_check
  -- pending  → enqueued, not yet sent to Wompi
  -- sending  → claimed for a retry attempt, Wompi call about to happen
  --            (transient marker, analogous to refund_requests.status =
  --            'processing' — see header comment)
  -- sent     → Wompi's Payouts API accepted the request (still processing
  --            on their side; a future payouts webhook would confirm 'paid')
  -- paid     → reserved for that future payouts-webhook confirmation, OR an
  --            admin's manual out-of-band resolution (see resolved_by)
  -- failed   → the Payouts API call errored or was rejected
  CHECK (status IN ('pending', 'sending', 'sent', 'paid', 'failed'));

-- ------------------------------------------------------------
-- 2. admin_notes / resolved_by
-- ------------------------------------------------------------
ALTER TABLE public.provider_payouts
  ADD COLUMN admin_notes text,
  ADD COLUMN resolved_by uuid REFERENCES public.profiles(id);

-- ------------------------------------------------------------
-- 3. claim_provider_payout_for_send()
-- Claims a 'pending' or 'failed' row for a send attempt, atomically moving
-- it to 'sending' and handing back the immutable data the caller needs to
-- actually place the Wompi Payouts API call. Returns 0 rows if the row was
-- already claimed/resolved by a concurrent action (the calling code treats
-- an empty result as "someone else already handled this", a no-op — same
-- posture as claim_refund_request_for_void()'s boolean return, just shaped
-- as a row set here since the caller also needs the payout's own data back
-- in the same round trip.
--
-- SECURITY REVIEW FINDING (fixed here, before this migration was ever
-- applied): the original version of this function was retry-only, called
-- solely from the new admin retry action — enqueueAndSendPayout() in the
-- webhook route still transitioned pending -> sending only implicitly, by
-- reading (not compare-and-swapping) enqueued.status before calling Wompi.
-- That left no DB-level mutual exclusion between "the automatic webhook
-- attempt is still in flight" and "an admin retry claims the same row" for
-- the whole duration of the outbound Wompi call, relying entirely on
-- Wompi's own idempotency-key behavior to prevent a double send. Renamed
-- (was claim_provider_payout_for_retry) and given p_admin_id a NULL default
-- so both callers share one atomic claim: the webhook route now calls this
-- with p_admin_id = NULL immediately after enqueue_provider_payout()
-- (resolved_by stays NULL, matching its "no admin involved" convention),
-- and the admin retry action calls it with the acting admin's id. Whichever
-- caller's UPDATE actually matches first wins the claim; the loser sees 0
-- rows and no-ops, exactly like a concurrent double-claim already did.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_provider_payout_for_send(
  p_payout_id uuid,
  p_admin_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  transaction_id uuid,
  recipient_type text,
  recipient_id   uuid,
  amount_cents   bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    UPDATE public.provider_payouts
    SET status = 'sending',
        resolved_by = p_admin_id
    WHERE id = p_payout_id
      AND status IN ('pending', 'failed')
    RETURNING provider_payouts.transaction_id, provider_payouts.recipient_type,
              provider_payouts.recipient_id, provider_payouts.amount_cents;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_provider_payout_for_send(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_provider_payout_for_send(uuid, uuid) TO service_role;

-- ------------------------------------------------------------
-- 4. mark_provider_payout_result(): widen the guard so it can resolve a row
-- claimed by either caller of claim_provider_payout_for_send() above — the
-- webhook route (p_admin_id = NULL) or the admin retry action (p_admin_id =
-- the acting admin). Both now claim into 'sending' before calling Wompi, so
-- this only ever needs to transition out of 'sending' in practice; 'pending'
-- stays in the guard too for defense-in-depth against any future caller that
-- doesn't go through the claim step. Every other line is unchanged from
-- 20260830200000 — no signature change, so CREATE OR REPLACE is sufficient
-- (no DROP needed).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_provider_payout_result(
  p_payout_id      uuid,
  p_status         text,
  p_wompi_payout_id text DEFAULT NULL,
  p_error_message  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'sent', 'paid', 'failed') THEN
    RAISE EXCEPTION 'unknown provider payout status: %', p_status;
  END IF;

  -- `AND status IN ('pending', 'sending')` — same idempotency pattern as
  -- apply_wompi_webhook_transaction_update(): a payout is only ever
  -- transitioned out of 'pending' (original webhook path) or 'sending'
  -- (admin-triggered retry path) once through this function.
  UPDATE public.provider_payouts
  SET status = p_status,
      wompi_payout_id = COALESCE(p_wompi_payout_id, wompi_payout_id),
      error_message = p_error_message
  WHERE id = p_payout_id
    AND status IN ('pending', 'sending');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_provider_payout_result(uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_provider_payout_result(uuid, text, text, text) TO service_role;

-- ------------------------------------------------------------
-- 5. mark_provider_payout_resolved_manually()
-- The manual-resolution escape hatch: an admin has paid the recipient
-- out-of-band (bank transfer) and records the payout as done. Claimable
-- from 'pending' or 'failed' unconditionally, and from 'sending' ONLY once
-- it's been sitting there for more than SENDING_ORPHAN_MINUTES (10) —
-- see the CHECK below.
--
-- SECURITY REVIEW FINDING (fixed here, before this migration was ever
-- applied): the original version let 'sending' be claimed unconditionally,
-- with no age check. Since a 'sending' row shows up in /admin/pagos-
-- proveedores immediately (no staleness filter, unlike 'pending', which
-- needs STUCK_PAYOUT_HOURS to appear), an admin could click "resolver
-- manualmente" on a row an admin retry (or the webhook) had only just
-- claimed a moment earlier, while sendProviderPayout()'s outbound call to
-- Wompi was still genuinely in flight. If that in-flight call then
-- succeeded, mark_provider_payout_result()'s guard would silently no-op
-- against the row this function had already moved to 'paid' — the
-- recipient would be paid twice (once by Wompi, once by the admin's
-- out-of-band transfer) with nothing in provider_payouts ever recording
-- that the Wompi side also succeeded. A live HTTP call to Wompi completes
-- or times out in seconds, not minutes, so requiring the row to have sat in
-- 'sending' for at least 10 minutes before it's manually resolvable closes
-- that window while still leaving a real escape hatch for a row genuinely
-- orphaned by a crash mid-send (which has no other way to ever leave
-- 'sending', since that status has no automatic timeout/reversion in this
-- design — unlike refund_requests.status = 'processing', which always
-- eventually resolves via a webhook).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_provider_payout_resolved_manually(
  p_payout_id uuid,
  p_admin_id  uuid,
  p_notes     text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.provider_payouts
  SET status = 'paid',
      resolved_by = p_admin_id,
      admin_notes = p_notes
  WHERE id = p_payout_id
    AND (
      status IN ('pending', 'failed')
      OR (status = 'sending' AND updated_at < now() - interval '10 minutes')
    )
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_provider_payout_resolved_manually(uuid, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_provider_payout_resolved_manually(uuid, uuid, text) TO service_role;
