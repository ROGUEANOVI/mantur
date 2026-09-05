-- =============================================================
-- Migration: 20260911000000_add_refund_credit_note_tracking
--
-- Step 6 of docs/wompi-alegra-integration-plan.md (§6.3, step 4): when a
-- refund reaches 'processed' AND its transaction was actually invoiced
-- (transactions.alegra_invoice_id IS NOT NULL, see
-- 20260831200000_create_alegra_invoicing_links.sql), Alegra needs a credit
-- note referencing that original invoice so the DIAN-facing accounting
-- record reflects the refund. A refund can reach 'processed' from three
-- different call sites (mark_refund_request_processed() via the manual
-- admin path, or cascade_refund_to_booking() via the synchronous or
-- webhook-confirmed same-day void paths — see src/lib/alegra/refundCreditNotes.ts),
-- so this needs the same atomic claim/mark shape already used for
-- provider_payouts (claim_provider_payout_for_send / mark_provider_payout_result,
-- 20260901000000_add_provider_payout_manual_resolution.sql) rather than
-- application-level dedup — whichever call site processes a given refund
-- first, the DB claim is the single source of truth for "has a credit note
-- already been attempted for this refund".
--
-- credit_amount_cents = refund_percentage% of the ORIGINAL, immutable
-- commission_amount_cents already stored on the transaction at booking
-- time — never recomputed from anything else, per
-- .claude/rules/money-and-payments.md ("commission is stored at creation
-- time and is never recalculated retroactively"). A 0%-refund-tier
-- cancellation (refund_percentage = 0, though in practice that status never
-- reaches 'processed' today) computes to 0 cents and is marked
-- 'not_applicable' rather than attempted as a real credit note.
--
-- Depends on:
--   20260831000000_create_refund_engine (refund_requests)
--   20260831200000_create_alegra_invoicing_links (transactions.alegra_invoice_id)
-- =============================================================

ALTER TABLE public.refund_requests
  ADD COLUMN alegra_credit_note_id     text,
  ADD COLUMN alegra_credit_note_status text
    CHECK (alegra_credit_note_status IN ('pending', 'issued', 'failed', 'not_applicable'));

-- ------------------------------------------------------------
-- claim_refund_request_for_credit_note()
-- Claims a processed refund for a credit-note attempt and hands back the
-- immutable data needed to place the Alegra call in one round trip — same
-- shape as claim_provider_payout_for_send(). Returns no row when: not yet
-- processed, already claimed/resolved (alegra_credit_note_status is not
-- NULL), or the transaction was never invoiced (no alegra_invoice_id —
-- nothing to credit). A computed credit of 0 cents is a legitimate outcome
-- (a 0%-tier cancellation), not a failure: marked 'not_applicable' directly
-- by this function, with no row returned, so the caller makes no external
-- call at all.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_refund_request_for_credit_note(p_refund_request_id uuid)
RETURNS TABLE (alegra_invoice_id text, credit_amount_cents bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_id   text;
  v_credit_cents bigint;
BEGIN
  SELECT t.alegra_invoice_id,
         ROUND(t.commission_amount_cents * (rr.refund_percentage / 100.0))::bigint
    INTO v_invoice_id, v_credit_cents
  FROM public.refund_requests rr
  JOIN public.transactions t ON t.id = rr.transaction_id
  WHERE rr.id = p_refund_request_id
    AND rr.status = 'processed'
    AND rr.alegra_credit_note_status IS NULL;

  IF v_invoice_id IS NULL THEN
    RETURN; -- not eligible / already claimed / never invoiced
  END IF;

  IF v_credit_cents <= 0 THEN
    UPDATE public.refund_requests
    SET alegra_credit_note_status = 'not_applicable'
    WHERE id = p_refund_request_id;
    RETURN; -- nothing to credit; caller makes no Alegra call
  END IF;

  UPDATE public.refund_requests
  SET alegra_credit_note_status = 'pending'
  WHERE id = p_refund_request_id;

  RETURN QUERY SELECT v_invoice_id, v_credit_cents;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_refund_request_for_credit_note(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_refund_request_for_credit_note(uuid) TO service_role;

-- ------------------------------------------------------------
-- mark_refund_request_credit_note_result()
-- Only transitions a row this session itself claimed into 'pending' above —
-- a stale/foreign call with a mismatched id simply matches 0 rows.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_refund_request_credit_note_result(
  p_refund_request_id     uuid,
  p_status                text,
  p_alegra_credit_note_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('issued', 'failed') THEN
    RAISE EXCEPTION 'unknown alegra credit note status: %', p_status;
  END IF;

  UPDATE public.refund_requests
  SET alegra_credit_note_status = p_status,
      alegra_credit_note_id = COALESCE(p_alegra_credit_note_id, alegra_credit_note_id)
  WHERE id = p_refund_request_id
    AND alegra_credit_note_status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_refund_request_credit_note_result(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_refund_request_credit_note_result(uuid, text, text) TO service_role;
