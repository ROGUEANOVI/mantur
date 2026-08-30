-- =============================================================
-- Migration: 20260830200000_create_provider_payouts_ledger
--
-- Step 3 of the Wompi payment integration (see
-- docs/wompi-alegra-integration-plan.md, §4.4). Adds the ledger and RPCs
-- needed to automatically pay a business/guide their net share (amount
-- minus commission) once a booking's payment is confirmed by the Wompi
-- webhook.
--
-- 1. wompi_bank_id column on business_payout_accounts /
--    tourist_guide_payout_accounts — Wompi's Payouts API identifies the
--    destination bank by its own catalog id (obtained from Wompi's
--    /banks endpoint), not by a free-text bank name. bank_name (added in
--    20260830000000) stays as the human-readable label shown in any future
--    payout-account settings UI; wompi_bank_id is the value actually sent
--    to Wompi. Nullable for now: no UI writes these tables yet (that is
--    itself future work), and a payout attempt with a NULL wompi_bank_id
--    fails loudly (see src/lib/wompi/payouts.ts) rather than guessing.
--
-- 2. provider_payouts — one row per transaction that has been (or is
--    being) paid out to its recipient. transaction_id UNIQUE makes
--    enqueue_provider_payout() naturally idempotent: a retried webhook
--    delivery for an already-confirmed payment reuses the existing row
--    instead of creating a duplicate payout.
--
-- 3. enqueue_provider_payout() — called by the webhook route right after
--    apply_wompi_webhook_transaction_update() confirms a payment. Inserts
--    (or finds the existing) pending payout row.
--
-- 4. mark_provider_payout_result() — called by the webhook route after it
--    attempts the actual Wompi Payouts API call, recording success/failure.
--
-- 5. apply_wompi_webhook_transaction_update() is redefined (DROP + CREATE,
--    since its return type changes from boolean to a row) to also return
--    the booking's business_id/guide_id and the transaction's
--    amount_in_cents/commission_amount_cents when it applies an update —
--    exactly what the webhook route needs to enqueue a payout, read in the
--    same query as the status update rather than a separate round trip.
--
-- 6. A CHECK on transactions guaranteeing commission_amount_cents can never
--    exceed amount_in_cents — the explicit DB-level guarantee that a
--    provider payout (amount_in_cents - commission_amount_cents) can never
--    be negative, rather than relying incidentally on
--    provider_payouts.amount_cents' own `> 0` CHECK to catch it.
--
-- Known gap to close before enabling this against REAL (non-sandbox)
-- payouts, flagged by security review: a provider_payouts row can get
-- stuck at status='pending' or 'failed' forever if the process crashes
-- between enqueue_provider_payout() and mark_provider_payout_result(), or
-- if sendProviderPayout() fails — nothing currently re-drives it (a second
-- webhook delivery for the same event finds apply_wompi_webhook_transaction_
-- update's `applied` already false and never re-enters the payout path).
-- Needs a reconciliation job/admin action before going live that finds
-- stale pending/failed rows and retries sendProviderPayout() reusing the
-- same payout row id as the idempotency key (safe to retry: Wompi's own
-- idempotency key prevents an actual double payment even on retry). That
-- retry path will also need to atomically claim the row first (e.g.
-- `UPDATE ... SET status='pending' WHERE id=$1 AND status='pending'
-- RETURNING id`, mirroring acceptTransportRequest's claim pattern) once more
-- than one caller can reach a 'pending' row concurrently.
--
-- Depends on:
--   20260830000000_create_booking_transaction_rpc_and_payout_accounts
--     (business_payout_accounts, tourist_guide_payout_accounts)
--   20260830100000_create_wompi_webhook_rpc
--     (apply_wompi_webhook_transaction_update, being redefined here)
-- =============================================================

-- ------------------------------------------------------------
-- 1. wompi_bank_id columns
-- ------------------------------------------------------------
ALTER TABLE public.business_payout_accounts
  ADD COLUMN wompi_bank_id text;

ALTER TABLE public.tourist_guide_payout_accounts
  ADD COLUMN wompi_bank_id text;

-- ------------------------------------------------------------
-- 2. provider_payouts
-- Same RLS posture as transactions: admin-only on all four operations.
-- Clients never interact with this table directly — the webhook route
-- (service_role) is the only writer, and any future admin payouts
-- dashboard reads it as an admin.
-- ------------------------------------------------------------
CREATE TABLE public.provider_payouts (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- UNIQUE enforces at most one payout per transaction — the mechanism
  -- enqueue_provider_payout() relies on for idempotency.
  transaction_id  uuid        NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  recipient_type  text        NOT NULL CHECK (recipient_type IN ('business', 'guide')),
  -- Intentionally not a FK to businesses/tourist_guides: recipient_type
  -- determines which table recipient_id belongs to, and a single FK column
  -- can't reference two different parent tables. The webhook route resolves
  -- and validates recipient_id against the correct table before calling
  -- enqueue_provider_payout(), the same way bookings.business_id/guide_id
  -- are resolved from a specific booking rather than trusted blindly.
  recipient_id    uuid        NOT NULL,
  amount_cents    bigint      NOT NULL CHECK (amount_cents > 0),
  wompi_payout_id text,
  -- pending  → enqueued, not yet sent to Wompi
  -- sent     → Wompi's Payouts API accepted the request (still processing
  --            on their side; a future payouts webhook would confirm 'paid')
  -- paid     → reserved for that future payouts-webhook confirmation
  -- failed   → the Payouts API call errored or was rejected
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'paid', 'failed')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER provider_payouts_set_updated_at
  BEFORE UPDATE ON public.provider_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.provider_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_payouts_select_admin"
  ON public.provider_payouts FOR SELECT
  USING (public.is_admin());

CREATE POLICY "provider_payouts_insert_admin"
  ON public.provider_payouts FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "provider_payouts_update_admin"
  ON public.provider_payouts FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "provider_payouts_delete_admin"
  ON public.provider_payouts FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 3. enqueue_provider_payout()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_provider_payout(
  p_transaction_id uuid,
  p_recipient_type text,
  p_recipient_id   uuid,
  p_amount_cents   bigint
)
RETURNS TABLE (id uuid, status text, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id     uuid;
  v_status text;
  v_is_new boolean := false;
BEGIN
  IF p_recipient_type NOT IN ('business', 'guide') THEN
    RAISE EXCEPTION 'unknown provider payout recipient type: %', p_recipient_type;
  END IF;

  INSERT INTO public.provider_payouts (transaction_id, recipient_type, recipient_id, amount_cents, status)
  VALUES (p_transaction_id, p_recipient_type, p_recipient_id, p_amount_cents, 'pending')
  ON CONFLICT (transaction_id) DO NOTHING
  RETURNING provider_payouts.id, provider_payouts.status INTO v_id, v_status;

  IF v_id IS NOT NULL THEN
    v_is_new := true;
  ELSE
    -- A row already existed for this transaction (retried webhook delivery
    -- for an already-confirmed payment) — reuse it instead of erroring.
    SELECT provider_payouts.id, provider_payouts.status INTO v_id, v_status
    FROM public.provider_payouts
    WHERE transaction_id = p_transaction_id;
  END IF;

  RETURN QUERY SELECT v_id, v_status, v_is_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_provider_payout(uuid, text, uuid, bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.enqueue_provider_payout(uuid, text, uuid, bigint) TO service_role;

-- ------------------------------------------------------------
-- 4. mark_provider_payout_result()
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

  -- `AND status = 'pending'` — same idempotency pattern as
  -- apply_wompi_webhook_transaction_update(): a payout is only ever
  -- transitioned out of 'pending' once through this function.
  UPDATE public.provider_payouts
  SET status = p_status,
      wompi_payout_id = COALESCE(p_wompi_payout_id, wompi_payout_id),
      error_message = p_error_message
  WHERE id = p_payout_id
    AND status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_provider_payout_result(uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_provider_payout_result(uuid, text, text, text) TO service_role;

-- ------------------------------------------------------------
-- 5. Redefine apply_wompi_webhook_transaction_update() to also return the
-- fields the webhook route needs to enqueue a payout, read consistently
-- inside the same function call as the status update.
-- DROP is required (not just CREATE OR REPLACE) because the return type
-- changes from boolean to a table.
-- ------------------------------------------------------------
DROP FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text);

CREATE FUNCTION public.apply_wompi_webhook_transaction_update(
  p_booking_id            uuid,
  p_wompi_transaction_id  text,
  p_wompi_status          text,
  p_wompi_amount_in_cents bigint,
  p_wompi_currency        text
)
RETURNS TABLE (
  applied                 boolean,
  transaction_id          uuid,
  business_id             uuid,
  guide_id                uuid,
  amount_in_cents         bigint,
  commission_amount_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transaction_status text;
  v_booking_status     text;
  v_updated_id         uuid;
BEGIN
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
    ELSE NULL
  END;

  UPDATE public.transactions
  SET wompi_reference = p_wompi_transaction_id,
      status = v_transaction_status
  WHERE booking_id = p_booking_id
    AND status = 'pending'
    AND amount_in_cents = p_wompi_amount_in_cents
    AND currency = p_wompi_currency
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  IF v_booking_status IS NOT NULL THEN
    UPDATE public.bookings
    SET status = v_booking_status
    WHERE id = p_booking_id;
  END IF;

  RETURN QUERY
    SELECT true, t.id, b.business_id, b.guide_id, t.amount_in_cents, t.commission_amount_cents
    FROM public.transactions t
    JOIN public.bookings b ON b.id = t.booking_id
    WHERE t.id = v_updated_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text) TO service_role;

-- ------------------------------------------------------------
-- 6. Explicit DB-level guarantee that a provider payout can never be
-- negative — see the header comment for why this matters even though
-- provider_payouts.amount_cents' own `> 0` CHECK already catches a
-- violation incidentally today (it would simply fail the INSERT).
-- ------------------------------------------------------------
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_commission_not_exceeding_amount
  CHECK (commission_amount_cents <= amount_in_cents);
