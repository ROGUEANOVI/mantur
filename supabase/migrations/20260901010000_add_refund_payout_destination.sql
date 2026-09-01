-- =============================================================
-- Migration: 20260901010000_add_refund_payout_destination
--
-- Wompi's own support documentation confirms (not assumed) that the only
-- automated refund mechanism Wompi exposes — the instant same-day
-- transaction void that 20260831000000_create_refund_engine /
-- 20260831100000_make_wompi_void_async already build against — only works
-- for card payments (VISA/MASTERCARD/AMEX). PSE, Nequi, and Bancolombia
-- Transfer have no automated refund path at all on Wompi's side; those
-- always require ManTur to manually wire the money back to the tourist.
-- Today transactions doesn't record which payment method was actually
-- used, so application code has no way to tell "this one could still
-- qualify for an auto-void" from "this was always going to be manual" —
-- and refund_requests has nowhere to capture where a manual refund should
-- be sent, which today means an admin has to separately contact the
-- tourist by email/phone just to ask.
--
-- 1. transactions.payment_method_type — populated from Wompi's
--    payment_method.type field on the transaction webhook payload at
--    confirmation time. Left as unconstrained text (no CHECK/enum),
--    mirroring the existing posture of business_payout_accounts.bank_name /
--    tourist_guide_payout_accounts.bank_name in
--    20260830000000_create_booking_transaction_rpc_and_payout_accounts.sql:
--    Wompi's set of method-type values (CARD, PSE, NEQUI,
--    BANCOLOMBIA_TRANSFER, ...) could expand over time and this column
--    should not need a migration every time it does.
--
-- 2. refund_requests.payout_instructions — free-text instructions the
--    tourist provides at refund-request time for where to send a manual
--    refund (e.g. "Nequi 3001234567" or bank account details).
--    Deliberately free text rather than a structured bank-account schema
--    like business_payout_accounts/tourist_guide_payout_accounts: nothing
--    here feeds programmatically into any payout API the way those tables
--    do — an admin reads this and wires the money by hand, and Colombia's
--    payment landscape (Nequi/Daviplata identified by phone number vs.
--    traditional bank accounts with type/number/holder) doesn't fit one
--    rigid schema.
--
-- Both columns are nullable additions to tables that already have RLS
-- enabled with full policy sets (transactions: admin-only on all four
-- operations, from 20260730200000_create_bookings_transactions;
-- refund_requests: tourist/business-owner/guide-scoped SELECT + admin-only
-- write, from 20260831000000_create_refund_engine). A new nullable column
-- inherits the existing policies automatically — no new policy needed.
--
-- 3. apply_wompi_webhook_transaction_update() is redefined (DROP + CREATE,
--    not CREATE OR REPLACE) to accept the new p_payment_method_type
--    parameter and persist it. DROP is required here, not optional:
--    CREATE OR REPLACE FUNCTION cannot change a function's parameter list —
--    without dropping first, Postgres would silently create a second,
--    ambiguously-overloaded 6-arg sibling alongside the existing 5-arg
--    function rather than replacing it, leaving both callable. That is a
--    different failure mode than 20260830210000_fix_ambiguous_column_wompi_
--    webhook_rpc.sql already had to fix once in this same function (a bare
--    column reference colliding with a RETURNS TABLE OUT variable), but the
--    same underlying lesson applies: this function has already shown it's
--    easy to get subtly wrong, so change it minimally and deliberately.
--    Only two changes are made to the function body below (adding the new
--    trailing parameter, and adding it to the existing UPDATE's SET list);
--    everything else — including the fully-qualified column references
--    that migration fixed — is preserved exactly as it stands today.
--
-- Depends on:
--   20260730200000_create_bookings_transactions (transactions)
--   20260831000000_create_refund_engine (refund_requests)
--   20260830210000_fix_ambiguous_column_wompi_webhook_rpc
--     (apply_wompi_webhook_transaction_update, being redefined here — this
--     is the migration whose fully-qualified-columns fix must be preserved)
-- =============================================================

-- ------------------------------------------------------------
-- 1. transactions.payment_method_type
-- ------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN payment_method_type text;

COMMENT ON COLUMN public.transactions.payment_method_type IS
  'Populated from Wompi''s payment_method.type field on the transaction webhook payload at confirmation time (e.g. CARD, PSE, NEQUI, BANCOLOMBIA_TRANSFER). Unconstrained text since Wompi''s set of values may expand. Used to determine refund eligibility: only CARD supports Wompi''s automated same-day void.';

-- ------------------------------------------------------------
-- 2. refund_requests.payout_instructions
-- ------------------------------------------------------------
ALTER TABLE public.refund_requests
  ADD COLUMN payout_instructions text;

COMMENT ON COLUMN public.refund_requests.payout_instructions IS
  'Free-text instructions the tourist provides at refund-request time for where to send a manual refund (e.g. "Nequi 3001234567" or bank account details). Deliberately free text, not a structured bank-account schema: nothing here is fed programmatically into any payout API, an admin reads this and wires money by hand, and Colombia''s payment landscape (Nequi/Daviplata by phone number vs. traditional bank accounts) does not fit one rigid schema.';

-- ------------------------------------------------------------
-- 3. Redefine apply_wompi_webhook_transaction_update() to also accept and
-- persist the payment method type. DROP + CREATE because the parameter
-- list changes (see header comment). RETURNS TABLE shape, CASE mappings,
-- bookings UPDATE, and the final RETURN QUERY SELECT are unchanged from
-- the current (post-20260830210000, fully-qualified) definition.
-- ------------------------------------------------------------
DROP FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text);

CREATE FUNCTION public.apply_wompi_webhook_transaction_update(
  p_booking_id            uuid,
  p_wompi_transaction_id  text,
  p_wompi_status          text,
  p_wompi_amount_in_cents bigint,
  p_wompi_currency        text,
  p_payment_method_type   text DEFAULT NULL
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

  -- Table alias + fully-qualified columns: `transactions.amount_in_cents`
  -- (via alias `t`) can never be confused with the RETURNS TABLE OUT
  -- variable of the same name, unlike a bare `amount_in_cents` would be.
  UPDATE public.transactions AS t
  SET wompi_reference = p_wompi_transaction_id,
      status = v_transaction_status,
      payment_method_type = p_payment_method_type
  WHERE t.booking_id = p_booking_id
    AND t.status = 'pending'
    AND t.amount_in_cents = p_wompi_amount_in_cents
    AND t.currency = p_wompi_currency
  RETURNING t.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  IF v_booking_status IS NOT NULL THEN
    UPDATE public.bookings AS bk
    SET status = v_booking_status
    WHERE bk.id = p_booking_id;
  END IF;

  RETURN QUERY
    SELECT true, t.id, b.business_id, b.guide_id, t.amount_in_cents, t.commission_amount_cents
    FROM public.transactions t
    JOIN public.bookings b ON b.id = t.booking_id
    WHERE t.id = v_updated_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text, text) TO service_role;
