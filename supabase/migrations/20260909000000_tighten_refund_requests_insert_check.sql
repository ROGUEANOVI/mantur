-- =============================================================
-- Migration: 20260909000000_tighten_refund_requests_insert_check
--
-- Follow-up to 20260831000000: refund_requests_insert's WITH CHECK only ever
-- verified requested_by/status, never that booking_id/transaction_id
-- actually belong to the caller — the same bug class as
-- 20260908100000_tighten_provider_availability_self_service_check.sql fixed
-- for provider_availability (an INSERT policy that pins the "who" column but
-- leaves every other column an unauthenticated free-for-all).
--
-- This is defense-in-depth only, not a real production gap: the only actual
-- write path, requestRefund() in src/app/(app)/mis-reservas/actions.ts, goes
-- through createAdminClient() (service_role), which bypasses RLS entirely —
-- same posture already called out in the original policy's own comment. But
-- as with provider_availability, a stray direct client-SDK insert should
-- still be rejected rather than merely rely on application code never doing
-- that.
--
-- Fix: WITH CHECK now also requires
--   - the referenced booking to belong to the caller (bookings.tourist_id =
--     auth.uid()), and
--   - the referenced transaction to belong to that same booking
--     (transactions.booking_id = refund_requests.booking_id) — so a caller
--     can't attach one of their own bookings to someone else's transaction.
--
-- requested_by/status stay exactly as before; select/update/delete on
-- refund_requests are untouched by this migration.
--
-- Depends on:
--   20260831000000_create_refund_engine (refund_requests, refund_requests_insert)
--   20260730200000_create_bookings_transactions (bookings, transactions)
-- =============================================================

DROP POLICY "refund_requests_insert" ON public.refund_requests;

CREATE POLICY "refund_requests_insert"
  ON public.refund_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = refund_requests.booking_id
        AND tourist_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.transactions
      WHERE id = refund_requests.transaction_id
        AND booking_id = refund_requests.booking_id
    )
  );
