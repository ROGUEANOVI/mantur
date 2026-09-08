-- =============================================================
-- Migration: 20260917000000_add_transport_payments
--
-- Builds the full Wompi checkout + Wompi Payouts pipeline for transport
-- (motocarro rides), replicating the exact pattern already used for
-- business services and guide tours — but, like both of those, kept
-- dormant: no public UI wires createTransportBooking() (added in this
-- same PR, src/app/(app)/reservas/actions.ts) to any form. See CLAUDE.md
-- Phase 13 and project memory `manual_operation_pivot` — ManTur still
-- can't confirm real-time availability for any of the three actor types
-- (negocios, transportistas, guías), so none of the three gets a live
-- in-platform payment CTA yet. Transport never had payment infra at all
-- before this (pure cash logistics via transport_requests), unlike
-- services/guide tours which have theirs built and simply unwired.
--
-- 1. transport_requests.price_cents — the transporter quotes a price when
--    accepting a request (see updated acceptTransportRequest). Nullable:
--    the existing cash-only accept flow still works with no price set.
-- 2. transporter_payout_accounts — exact column/RLS copy of
--    tourist_guide_payout_accounts (20260830000000, wompi_bank_id added
--    20260830200000), scoped to transporters.profile_id.
-- 3. bookings.transport_request_id / bookings.transporter_id — same
--    denormalization pattern as business_id/guide_id: the Server Action
--    resolves transporter_id server-side from transport_requests, never
--    trusts the client. Widens the booking-shape XOR from 3 to 4 ways —
--    same mechanical widening already done once for package_id
--    (20260903000000_create_packages.sql).
-- 4. provider_payouts.recipient_type CHECK widened to include
--    'transporter'; enqueue_provider_payout()'s own guard widened to
--    match.
-- 5. apply_wompi_webhook_transaction_update() DROP+CREATE (return type
--    changes) to also return transporter_id, same shape as
--    business_id/guide_id already returned.
-- 6. create_booking_with_transaction() CREATE OR REPLACE (return type
--    unchanged) with two new optional params.
-- 7. Tightened transport_requests_insert/transport_requests_tourist_cancel
--    RLS (both pre-existing, from 20260801100000) to explicitly guard the
--    new price_cents column — a security review caught that neither policy
--    mentioned it, so a tourist hitting PostgREST directly (bypassing
--    createTransportRequest/cancelTransportRequest, neither of which ever
--    sets it) could otherwise insert or "cancel-with-a-price-change" an
--    arbitrary price_cents. Not exploitable into a real bad charge today
--    (acceptTransportRequest always overwrites price_cents from the
--    transporter's own quote via the admin client before a booking can
--    ever be created against the row), but the DB should enforce this
--    itself rather than rely on that being the only path forever.
-- 8. bookings.transport_request_id gets a UNIQUE partial index instead of
--    a plain one — a security review flagged that nothing otherwise stops
--    createTransportBooking from being called twice for the same
--    transport_request_id (a retried redirect, a double submit), which
--    would create two bookings/transactions/Wompi checkouts for one
--    physical ride. services/guide_tours don't need this (a booking
--    against the same catalog item twice is legitimate — two different
--    tourists, or the same tourist booking again); a transport_request is
--    a single physical ride with one quoted price, so it isn't.
--
-- commission_config already has a 'transport' row seeded at 10% since
-- Phase 2 (20260730000000_create_businesses_places_experiences.sql) and
-- was never removed by later CHECK widenings — no change needed there.
-- provider_availability.provider_type already accepts 'transporter'
-- (20260903000000_create_packages.sql:172) — no change needed there either.
--
-- Depends on:
--   20260801100000_create_transporters (transporters, transport_requests)
--   20260830000000_create_booking_transaction_rpc_and_payout_accounts
--     (create_booking_with_transaction, the payout_accounts pattern)
--   20260830200000_create_provider_payouts_ledger (provider_payouts,
--     enqueue_provider_payout, wompi_bank_id)
--   20260901010000_add_refund_payout_destination (current
--     apply_wompi_webhook_transaction_update definition, being redefined)
--   20260903000000_create_packages (current bookings XOR, being widened)
-- =============================================================

-- ------------------------------------------------------------
-- 1. transport_requests.price_cents + tightened RLS (see point 7 above)
-- ------------------------------------------------------------
ALTER TABLE public.transport_requests
  ADD COLUMN price_cents bigint CHECK (price_cents IS NULL OR price_cents > 0);

-- A tourist's own insert must start with no price quoted yet — only
-- acceptTransportRequest (transporter-side, via the admin client) ever
-- sets price_cents.
DROP POLICY "transport_requests_insert" ON public.transport_requests;

CREATE POLICY "transport_requests_insert" ON public.transport_requests FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND public.get_my_role() = 'tourist'
    AND status = 'pending'
    AND transporter_id IS NULL
    AND price_cents IS NULL
  );

-- A tourist can only reach this policy while the row is still 'pending'
-- (see USING below), and transport_requests_insert above guarantees
-- price_cents is NULL for every row that ever reaches 'pending' — so the
-- new row must keep it NULL too. (A bare "price_cents IS NOT DISTINCT FROM
-- price_cents" self-comparison would be a no-op tautology here — WITH
-- CHECK only sees the proposed new row, not the pre-update one — so this
-- pins the only value that column can legitimately have at this stage,
-- rather than attempting an old-vs-new comparison RLS can't express.)
DROP POLICY "transport_requests_tourist_cancel" ON public.transport_requests;

CREATE POLICY "transport_requests_tourist_cancel" ON public.transport_requests FOR UPDATE
  USING (tourist_id = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled' AND price_cents IS NULL);

-- ------------------------------------------------------------
-- 2. transporter_payout_accounts
-- Same shape and RLS posture as tourist_guide_payout_accounts, scoped to
-- transporters.profile_id instead of tourist_guides.profile_id.
-- ------------------------------------------------------------
CREATE TABLE public.transporter_payout_accounts (
  transporter_id   uuid        PRIMARY KEY REFERENCES public.transporters(id) ON DELETE CASCADE,
  bank_name        text        NOT NULL,
  wompi_bank_id    text,
  account_type     text        NOT NULL CHECK (account_type IN ('ahorros', 'corriente')),
  account_number   text        NOT NULL,
  holder_id_type   text        NOT NULL CHECK (holder_id_type IN ('CC', 'CE', 'NIT')),
  holder_id_number text        NOT NULL,
  holder_name      text        NOT NULL,
  holder_email     text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER transporter_payout_accounts_set_updated_at
  BEFORE UPDATE ON public.transporter_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.transporter_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transporter_payout_accounts_select_own"
  ON public.transporter_payout_accounts FOR SELECT
  USING (
    transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "transporter_payout_accounts_insert_own"
  ON public.transporter_payout_accounts FOR INSERT
  WITH CHECK (
    transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "transporter_payout_accounts_update_own"
  ON public.transporter_payout_accounts FOR UPDATE
  USING (
    transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

-- No DELETE policy — same posture as the other two payout-account tables.

-- ------------------------------------------------------------
-- 3. bookings: transport_request_id / transporter_id + widen the XOR
-- ------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN transport_request_id uuid REFERENCES public.transport_requests(id) ON DELETE RESTRICT,
  ADD COLUMN transporter_id       uuid REFERENCES public.transporters(id) ON DELETE RESTRICT;

-- UNIQUE, not a plain index (see point 8 above): a transport_request is one
-- physical ride with one quoted price, unlike services/guide_tours where
-- multiple bookings against the same catalog id are legitimate — this is
-- the DB-level guarantee that createTransportBooking can never be called
-- twice for the same ride (a retried redirect, a double submit) and create
-- two separate charges for it.
CREATE UNIQUE INDEX bookings_transport_request_id_idx ON public.bookings (transport_request_id) WHERE transport_request_id IS NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT bookings_service_guide_or_package_xor;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_service_guide_package_or_transport_xor
  CHECK (
    (service_id IS NOT NULL AND guide_tour_id IS NULL     AND package_id IS NULL     AND transport_request_id IS NULL)
    OR (service_id IS NULL     AND guide_tour_id IS NOT NULL AND package_id IS NULL     AND transport_request_id IS NULL)
    OR (service_id IS NULL     AND guide_tour_id IS NULL     AND package_id IS NOT NULL AND transport_request_id IS NULL)
    OR (service_id IS NULL     AND guide_tour_id IS NULL     AND package_id IS NULL     AND transport_request_id IS NOT NULL)
  );

-- ------------------------------------------------------------
-- 4. provider_payouts.recipient_type + enqueue_provider_payout() guard
-- ------------------------------------------------------------
ALTER TABLE public.provider_payouts
  DROP CONSTRAINT provider_payouts_recipient_type_check;

ALTER TABLE public.provider_payouts
  ADD CONSTRAINT provider_payouts_recipient_type_check
  CHECK (recipient_type IN ('business', 'guide', 'transporter'));

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
  IF p_recipient_type NOT IN ('business', 'guide', 'transporter') THEN
    RAISE EXCEPTION 'unknown provider payout recipient type: %', p_recipient_type;
  END IF;

  INSERT INTO public.provider_payouts (transaction_id, recipient_type, recipient_id, amount_cents, status)
  VALUES (p_transaction_id, p_recipient_type, p_recipient_id, p_amount_cents, 'pending')
  ON CONFLICT (transaction_id) DO NOTHING
  RETURNING provider_payouts.id, provider_payouts.status INTO v_id, v_status;

  IF v_id IS NOT NULL THEN
    v_is_new := true;
  ELSE
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
-- 5. apply_wompi_webhook_transaction_update() — add transporter_id to the
-- returned row. DROP + CREATE because the return type changes (adds a
-- column); no input parameter changes.
-- ------------------------------------------------------------
DROP FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text, text);

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
  transporter_id          uuid,
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
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  IF v_booking_status IS NOT NULL THEN
    UPDATE public.bookings AS bk
    SET status = v_booking_status
    WHERE bk.id = p_booking_id;
  END IF;

  RETURN QUERY
    SELECT true, t.id, b.business_id, b.guide_id, b.transporter_id, t.amount_in_cents, t.commission_amount_cents
    FROM public.transactions t
    JOIN public.bookings b ON b.id = t.booking_id
    WHERE t.id = v_updated_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(uuid, text, text, bigint, text, text) TO service_role;

-- ------------------------------------------------------------
-- 6. create_booking_with_transaction() — two new optional params. DROP +
-- CREATE, not CREATE OR REPLACE: a function's identity in Postgres is its
-- (name, argument-type-list) — adding parameters changes that list, so
-- CREATE OR REPLACE would silently create a second overload alongside the
-- original 15-arg one rather than truly replacing it. Same reasoning
-- already applied to apply_wompi_webhook_transaction_update in
-- 20260901010000_add_refund_payout_destination.sql when it grew a 6th
-- parameter.
-- ------------------------------------------------------------
DROP FUNCTION public.create_booking_with_transaction(
  uuid, integer, date, numeric, text, bigint, text, numeric, bigint, text, uuid, uuid, uuid, uuid, text
);

CREATE FUNCTION public.create_booking_with_transaction(
  p_tourist_id              uuid,
  p_quantity                integer,
  p_booking_date            date,
  p_total_amount            numeric,
  p_booking_status          text,
  p_amount_in_cents         bigint,
  p_currency                text,
  p_commission_rate         numeric,
  p_commission_amount_cents bigint,
  p_transaction_status      text,
  p_service_id              uuid DEFAULT NULL,
  p_business_id             uuid DEFAULT NULL,
  p_guide_tour_id           uuid DEFAULT NULL,
  p_guide_id                uuid DEFAULT NULL,
  p_notes                   text DEFAULT NULL,
  p_transport_request_id    uuid DEFAULT NULL,
  p_transporter_id          uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  INSERT INTO public.bookings (
    service_id, business_id, guide_tour_id, guide_id,
    transport_request_id, transporter_id,
    tourist_id, quantity, booking_date, total_amount, status, notes
  )
  VALUES (
    p_service_id, p_business_id, p_guide_tour_id, p_guide_id,
    p_transport_request_id, p_transporter_id,
    p_tourist_id, p_quantity, p_booking_date, p_total_amount, p_booking_status, p_notes
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.transactions (
    booking_id, status, amount_in_cents, currency,
    commission_rate, commission_amount_cents
  )
  VALUES (
    v_booking_id, p_transaction_status, p_amount_in_cents, p_currency,
    p_commission_rate, p_commission_amount_cents
  );

  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking_with_transaction(
  uuid, integer, date, numeric, text, bigint, text, numeric, bigint, text, uuid, uuid, uuid, uuid, text, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_with_transaction(
  uuid, integer, date, numeric, text, bigint, text, numeric, bigint, text, uuid, uuid, uuid, uuid, text, uuid, uuid
) TO service_role;
