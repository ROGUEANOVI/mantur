-- =============================================================
-- Migration: 20260830210000_fix_ambiguous_column_wompi_webhook_rpc
--
-- Fixes a real bug in apply_wompi_webhook_transaction_update(), caught by
-- an actual sandbox end-to-end test (not caught by unit tests, since those
-- mock the RPC boundary rather than executing real PL/pgSQL): the function
-- was redefined in 20260830200000 to RETURN TABLE(..., amount_in_cents,
-- commission_amount_cents), and PL/pgSQL implicitly turns RETURNS TABLE
-- columns into variables visible throughout the function body. The
-- `UPDATE public.transactions ... WHERE amount_in_cents = p_wompi_amount_in_cents`
-- clause used the bare (unqualified) column name, which Postgres could no
-- longer resolve unambiguously between the transactions.amount_in_cents
-- column and the identically-named OUT variable — failing every webhook
-- delivery with "column reference \"amount_in_cents\" is ambiguous" (SQLSTATE
-- 42702). This fully qualifies every column reference in both UPDATE
-- statements so no bare identifier can ever collide with an OUT variable,
-- regardless of what the RETURNS TABLE column list is named later.
--
-- Depends on:
--   20260830200000_create_provider_payouts_ledger
--     (this is the migration that introduced the bug being fixed here)
-- =============================================================

CREATE OR REPLACE FUNCTION public.apply_wompi_webhook_transaction_update(
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

  -- Table alias + fully-qualified columns: `transactions.amount_in_cents`
  -- (via alias `t`) can never be confused with the RETURNS TABLE OUT
  -- variable of the same name, unlike the bare `amount_in_cents` this
  -- replaces.
  UPDATE public.transactions AS t
  SET wompi_reference = p_wompi_transaction_id,
      status = v_transaction_status
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

REVOKE EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text) TO service_role;
