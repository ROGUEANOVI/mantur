-- Records commission owed to ManTur on manually-closed (WhatsApp) bookings
-- and completed transport trips — closes the gap left by the manual-ops
-- pivot, where create_service_prereserva()/create_guide_tour_prereserva()
-- (20260921000000_add_service_and_guide_tour_prereserva_rpcs.sql) insert
-- bookings directly at 'confirmed' with no transactions row and no
-- commission calculation at all. This table is populated by the RPC
-- changes in 20260923100000_add_commission_to_prereserva_and_transport_rpcs.sql,
-- not by this migration.
--
-- Structural mirror of provider_payouts (20260830200000_create_provider_
-- payouts_ledger.sql), which tracks the opposite direction of money
-- (ManTur paying a provider back after collecting via Wompi): same
-- recipient_type/recipient_id pair without an FK on recipient_id (it can
-- point at businesses, tourist_guides, or transporters — three different
-- parent tables, so a single FK column can't target all three; the caller
-- resolves/validates the id before insert, same reasoning as
-- provider_payouts). status='voided' (not a delete) is how a commission
-- record is invalidated if its booking gets cancelled after confirmation
-- (see cancelServiceBooking/cancelGuideTourBooking) — this system never
-- deletes a money-relevant row, same posture as every other ledger table.

CREATE TABLE public.provider_commissions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id               uuid        REFERENCES public.bookings(id) ON DELETE RESTRICT,
  transport_request_id     uuid        REFERENCES public.transport_requests(id) ON DELETE RESTRICT,
  recipient_type           text        NOT NULL CHECK (recipient_type IN ('business', 'guide', 'transporter')),
  recipient_id             uuid        NOT NULL,
  commission_rate          numeric(5,2) NOT NULL CHECK (commission_rate BETWEEN 0 AND 100),
  commission_amount_cents  bigint      NOT NULL CHECK (commission_amount_cents > 0),
  status                   text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'voided')),
  collected_by             uuid        REFERENCES public.profiles(id),
  admin_notes              text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Exactly one of booking_id / transport_request_id, same XOR shape as
-- bookings_service_guide_package_or_transport_xor.
ALTER TABLE public.provider_commissions
  ADD CONSTRAINT provider_commissions_booking_or_transport_xor
  CHECK (
    (booking_id IS NOT NULL AND transport_request_id IS NULL)
    OR (booking_id IS NULL AND transport_request_id IS NOT NULL)
  );

-- At most one commission record per booking/trip — commission is computed
-- once at confirmation/completion time and never recalculated (per
-- .claude/rules/money-and-payments.md), so a second insert for the same
-- source row would be a bug, not a legitimate correction.
CREATE UNIQUE INDEX provider_commissions_booking_id_idx
  ON public.provider_commissions (booking_id) WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX provider_commissions_transport_request_id_idx
  ON public.provider_commissions (transport_request_id) WHERE transport_request_id IS NOT NULL;

CREATE INDEX provider_commissions_recipient_idx
  ON public.provider_commissions (recipient_type, recipient_id);
CREATE INDEX provider_commissions_status_idx ON public.provider_commissions (status);

CREATE TRIGGER provider_commissions_set_updated_at
  BEFORE UPDATE ON public.provider_commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.provider_commissions ENABLE ROW LEVEL SECURITY;

-- Same posture as provider_payouts/transactions: admin-only on all four
-- operations. Real writes happen via SECURITY DEFINER RPCs (service_role
-- bypasses RLS) or the admin-only markCommissionCollected Server Action;
-- clients never interact with this table directly.
CREATE POLICY "provider_commissions_select_admin" ON public.provider_commissions
  FOR SELECT USING (public.is_admin());
CREATE POLICY "provider_commissions_insert_admin" ON public.provider_commissions
  FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "provider_commissions_update_admin" ON public.provider_commissions
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
-- No DELETE policy beyond an explicit false — this is an audit trail,
-- rows are voided, never removed.
CREATE POLICY "provider_commissions_delete_admin" ON public.provider_commissions
  FOR DELETE USING (false);
