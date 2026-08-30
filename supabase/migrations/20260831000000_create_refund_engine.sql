-- =============================================================
-- Migration: 20260831000000_create_refund_engine
--
-- Step 4 of the Wompi payment integration (see
-- docs/wompi-alegra-integration-plan.md, §5). Adds the cancellation/refund
-- engine: a fixed-window refund policy (editable by admin, same posture as
-- commission_config), a refund_requests ledger, and the RPC that atomically
-- moves a booking/transaction to their cancelled/voided terminal state when
-- a refund is actually processed (either automatically, via a same-day
-- Wompi void, or manually, via an admin-initiated bank transfer).
--
-- 1. refund_policy_config — editable refund-window tiers.
--    bookings.booking_date is a plain DATE with no time-of-day (see
--    src/lib/refunds.ts), so "hours until booking" is evaluated in whole
--    24h increments off Bogotá midnight, not the exact activity start time.
--    Seed values match the founder-approved defaults from the plan,
--    modeled on Civitatis/Airbnb/GetYourGuide-style tiered windows:
--      >= 72h → 100%, >= 24h → 50%, >= 0h (same-day/no-show) → 0%.
--
-- 2. get_refund_percentage() — SECURITY DEFINER RPC, same posture as
--    get_commission_rate(): only service_role may call it, so the refund
--    percentage is always resolved server-side from the current config,
--    never trusted from a client.
--
-- 3. refund_requests — one row per booking's refund lifecycle
--    (booking_id UNIQUE: a booking has at most one refund request ever,
--    matching the MVP scope in the plan — a rejected request is not
--    resubmittable here).
--
-- 4. mark_refund_request_processed() — the only place that turns a refund
--    request into an actual transactions/bookings state change. Guards on
--    refund_requests.status = 'pending' first (same idempotency pattern as
--    apply_wompi_webhook_transaction_update()), so it's safe to call
--    exactly once whether the trigger was an automatic same-day void or an
--    admin's manual "mark processed" action.
--
-- Depends on:
--   20260729000000_create_profiles (profiles, is_admin(), set_updated_at())
--   20260730200000_create_bookings_transactions (bookings, transactions)
-- =============================================================

-- ------------------------------------------------------------
-- 1. refund_policy_config
-- ------------------------------------------------------------
CREATE TABLE public.refund_policy_config (
  id                       uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  min_hours_before_booking integer       NOT NULL UNIQUE CHECK (min_hours_before_booking >= 0),
  refund_percentage        numeric(5,2)  NOT NULL CHECK (refund_percentage BETWEEN 0 AND 100),
  updated_by               uuid          REFERENCES public.profiles(id),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER refund_policy_config_set_updated_at
  BEFORE UPDATE ON public.refund_policy_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- updated_by is set explicitly by the Server Action (updateRefundPolicyRate,
-- passing the caller's own admin id) — same as commission_config's
-- updateCommissionRate, no trigger involved.
ALTER TABLE public.refund_policy_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refund_policy_config_select_admin"
  ON public.refund_policy_config FOR SELECT
  USING (public.is_admin());

CREATE POLICY "refund_policy_config_insert_admin"
  ON public.refund_policy_config FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "refund_policy_config_update_admin"
  ON public.refund_policy_config FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "refund_policy_config_delete_admin"
  ON public.refund_policy_config FOR DELETE
  USING (public.is_admin());

INSERT INTO public.refund_policy_config (min_hours_before_booking, refund_percentage) VALUES
  (72, 100),
  (24, 50),
  (0,  0);

-- ------------------------------------------------------------
-- 2. get_refund_percentage()
-- Picks the tier with the largest min_hours_before_booking that is still
-- <= the hours actually remaining — e.g. 80h remaining matches the 72h
-- tier (100%), 30h remaining matches the 24h tier (50%), 10h remaining
-- matches the 0h tier (0%). Callers must pass a non-negative value (see
-- computeHoursUntilBooking() in src/lib/refunds.ts, which clamps a
-- same-day/past booking to 0 before calling this).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_refund_percentage(p_hours_until_booking numeric)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rate numeric;
BEGIN
  IF p_hours_until_booking < 0 THEN
    RAISE EXCEPTION 'hours_until_booking must not be negative: %', p_hours_until_booking;
  END IF;

  SELECT refund_percentage INTO v_rate
  FROM public.refund_policy_config
  WHERE min_hours_before_booking <= p_hours_until_booking
  ORDER BY min_hours_before_booking DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'no refund policy tier matches % hours until booking', p_hours_until_booking;
  END IF;

  RETURN v_rate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_refund_percentage(numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_refund_percentage(numeric) TO service_role;

-- ------------------------------------------------------------
-- 3. refund_requests
-- ------------------------------------------------------------
CREATE TABLE public.refund_requests (
  id                 uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  -- UNIQUE: a booking has at most one refund request in this MVP scope.
  booking_id         uuid          NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  transaction_id     uuid          NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  requested_by       uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Snapshotted at request time, same reasoning as transactions.commission_rate:
  -- stays auditable even if an admin edits refund_policy_config later.
  refund_percentage  numeric(5,2)  NOT NULL CHECK (refund_percentage BETWEEN 0 AND 100),
  refund_amount_cents bigint       NOT NULL CHECK (refund_amount_cents >= 0),
  reason             text,
  -- pending   → requested, not yet resolved
  -- processed → refund actually issued (see refund_method)
  -- rejected  → admin declined it (see admin_notes)
  status             text          NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'processed', 'rejected')),
  -- void   → resolved automatically via a same-day Wompi transaction void
  -- manual → resolved by an admin-initiated bank transfer
  -- NULL while status is 'pending' or 'rejected'.
  refund_method      text          CHECK (refund_method IN ('void', 'manual')),
  admin_notes        text,
  -- NULL for an automatic void (no admin involved); set to the admin's id
  -- for a manual mark-processed or a rejection.
  processed_by       uuid          REFERENCES public.profiles(id),
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX refund_requests_requested_by_idx ON public.refund_requests (requested_by);

CREATE TRIGGER refund_requests_set_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- Tourist sees their own; business owner/guide see requests tied to their
-- own bookings (read-only awareness, mirrors bookings_select); admin sees all.
CREATE POLICY "refund_requests_select"
  ON public.refund_requests FOR SELECT
  USING (
    requested_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.bookings bk
      WHERE bk.id = refund_requests.booking_id
        AND (
          bk.business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
          OR bk.guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
        )
    )
    OR public.is_admin()
  );

-- Defense-in-depth, same reasoning as bookings_insert: the Server Action
-- writes through the admin (service_role) client, which bypasses RLS
-- entirely, so this only blocks a stray direct client-SDK insert.
CREATE POLICY "refund_requests_insert"
  ON public.refund_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
  );

-- Status transitions (pending → processed/rejected) are admin/service-role
-- only — no client-originated UPDATE is ever valid.
CREATE POLICY "refund_requests_update"
  ON public.refund_requests FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "refund_requests_delete"
  ON public.refund_requests FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 4. mark_refund_request_processed()
-- Called either right after a successful same-day Wompi void (automatic,
-- p_processed_by = NULL) or by an admin's manual "mark processed" action
-- (p_processed_by = the admin's profile id).
--
-- The `WHERE status = 'pending'` guard on refund_requests is evaluated
-- FIRST and claims the row — a second call for the same refund request
-- (e.g. a duplicate form submit) finds 0 rows and returns false, never
-- touching transactions/bookings twice.
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
    AND status = 'pending'
  RETURNING booking_id INTO v_booking_id;

  IF v_booking_id IS NULL THEN
    RETURN false;
  END IF;

  -- `AND status = 'paid'` guards against acting on a transaction the Wompi
  -- webhook has already moved elsewhere (e.g. a race with a late DECLINED
  -- event, however unlikely) — if it doesn't match, the refund_requests row
  -- is still marked processed above (the refund itself did happen), but the
  -- transaction/booking are left as-is rather than forced into a
  -- possibly-wrong state.
  UPDATE public.transactions
  SET status = 'voided'
  WHERE booking_id = v_booking_id
    AND status = 'paid';

  -- `AND status = 'confirmed'` mirrors the transactions guard above: don't
  -- force a booking that has moved on (e.g. already 'completed') back to
  -- 'cancelled' just because a refund was processed after the fact.
  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE id = v_booking_id
    AND status = 'confirmed';

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_refund_request_processed(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_refund_request_processed(uuid, text, uuid) TO service_role;

-- ------------------------------------------------------------
-- 5. Automatic same-day void: claim / revert
--
-- requestRefund() (src/app/(app)/mis-reservas/actions.ts) cannot hold a
-- Postgres row lock open across the external Wompi API call it needs to
-- make, so the atomic "claim, guarded by status='pending'" and the
-- irreversible external void call cannot happen inside one RPC the way
-- mark_refund_request_processed() above does for the (call-free) manual
-- admin path. Splitting into claim → external call → cascade-or-revert is
-- the standard pattern for combining a DB transaction with an external
-- side effect: claim_refund_request_for_void() closes the race where an
-- admin action (reject / manual mark-processed) could otherwise act on the
-- same 'pending' row while the Wompi call is in flight — whichever side
-- wins the claim is the only side that can act on the row.
-- ------------------------------------------------------------

-- Optimistically claims the row for an automatic void attempt. `status`
-- moves straight to 'processed' (there is no separate "in flight" status
-- value) — if the Wompi call that follows fails,
-- revert_refund_request_void_claim() below undoes exactly this.
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
  SET status = 'processed',
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

-- Cascades a successful automatic void to transactions/bookings — called
-- only after voidWompiTransaction() has actually confirmed success for a
-- row this same request already claimed above.
CREATE OR REPLACE FUNCTION public.cascade_refund_to_booking(p_refund_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  SELECT booking_id INTO v_booking_id
  FROM public.refund_requests
  WHERE id = p_refund_request_id;

  IF v_booking_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.transactions
  SET status = 'voided'
  WHERE booking_id = v_booking_id
    AND status = 'paid';

  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE id = v_booking_id
    AND status = 'confirmed';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cascade_refund_to_booking(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cascade_refund_to_booking(uuid) TO service_role;

-- Undoes exactly what claim_refund_request_for_void() did, and only that:
-- `refund_method = 'void' AND processed_by IS NULL` ensures this can only
-- revert our own optimistic claim, never a manual admin action (which
-- always sets processed_by to the admin's id) — so a slow Wompi call can
-- never stomp on a legitimate admin decision made in the meantime.
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
    AND status = 'processed'
    AND refund_method = 'void'
    AND processed_by IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revert_refund_request_void_claim(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revert_refund_request_void_claim(uuid) TO service_role;
