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

-- No dedicated RLS policy needed: refund_requests_select is row-level (not
-- column-level), so the refund's own tourist and the counterpart business
-- owner/guide can read these two columns alongside the refund amount they
-- already see — deliberately harmless bookkeeping metadata (an Alegra
-- credit note id/status), not sensitive in the way internal_cost_cents-style
-- data is elsewhere in this schema. Writes are still admin/service-role only
-- via refund_requests_update and the two SECURITY DEFINER RPCs below.
ALTER TABLE public.refund_requests
  ADD COLUMN alegra_credit_note_id     text,
  ADD COLUMN alegra_credit_note_status text
    CHECK (alegra_credit_note_status IN ('pending', 'issued', 'failed', 'not_applicable'));

-- ------------------------------------------------------------
-- claim_refund_request_for_credit_note()
-- Claims a processed refund for a credit-note attempt and hands back the
-- immutable data needed to place the Alegra call in one round trip — same
-- shape as claim_provider_payout_for_send(). A single UPDATE ... FROM ...
-- RETURNING, not a separate SELECT-then-UPDATE: the earlier draft of this
-- function checked eligibility with a plain SELECT and only issued the
-- claiming UPDATE afterward, which is NOT atomic across concurrent callers
-- (two of this refund's three call sites racing on the same row could both
-- pass the SELECT before either UPDATE committed, both claim, and both fire
-- a real Alegra credit note — caught by an automated security review before
-- this migration was ever applied). Folding the eligibility check into the
-- UPDATE's own WHERE clause makes Postgres's row lock the actual
-- concurrency guard, identical to how claim_provider_payout_for_send's own
-- single UPDATE already prevents a double payout.
--
-- Returns no row when: not yet processed, already claimed/resolved
-- (alegra_credit_note_status is not NULL), or the transaction was never
-- invoiced (no alegra_invoice_id — the FROM subquery's own
-- `t.alegra_invoice_id IS NOT NULL` filter means that case produces no
-- joined row at all, so the UPDATE matches nothing and the row is left
-- completely untouched, not consumed). A computed credit of 0 cents is a
-- legitimate outcome (a 0%-tier cancellation), not a failure: the UPDATE
-- itself sets 'not_applicable' rather than 'pending' in that case, and this
-- function still returns no row, so the caller makes no external call.
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
  UPDATE public.refund_requests rr
  SET alegra_credit_note_status = CASE
        WHEN computed.credit_cents <= 0 THEN 'not_applicable'
        ELSE 'pending'
      END
  FROM (
    SELECT t.alegra_invoice_id AS invoice_id,
           ROUND(t.commission_amount_cents * (rr2.refund_percentage / 100.0))::bigint AS credit_cents
    FROM public.refund_requests rr2
    JOIN public.transactions t ON t.id = rr2.transaction_id
    WHERE rr2.id = p_refund_request_id
      AND t.alegra_invoice_id IS NOT NULL
  ) AS computed
  WHERE rr.id = p_refund_request_id
    AND rr.status = 'processed'
    AND rr.alegra_credit_note_status IS NULL
  RETURNING computed.invoice_id, computed.credit_cents
    INTO v_invoice_id, v_credit_cents;

  IF v_invoice_id IS NULL THEN
    RETURN; -- not eligible / already claimed / never invoiced
  END IF;

  IF v_credit_cents <= 0 THEN
    RETURN; -- marked 'not_applicable' by the UPDATE above; nothing to credit
  END IF;

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
