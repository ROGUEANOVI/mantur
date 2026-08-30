-- =============================================================
-- Migration: 20260830000000_create_booking_transaction_rpc_and_payout_accounts
--
-- Foundational step for the Wompi payment integration
-- (see docs/wompi-alegra-integration-plan.md, §3 and §9 step 1).
-- No behavior change yet: booking/transaction statuses stay exactly as
-- they are today ('confirmed'/'paid', simulated payment). This migration
-- only prepares the schema so the real Wompi checkout (step 2) and Wompi
-- Payouts dispersion (step 3) can be built without further migrations.
--
-- 1. create_booking_with_transaction() — atomic RPC replacing the
--    insert-booking-then-insert-transaction-with-manual-rollback pattern
--    in src/app/(app)/reservas/actions.ts (tech debt M-1 in
--    docs/handoff.md). A single PL/pgSQL function body is one Postgres
--    transaction: if the transaction insert fails, the booking insert
--    rolls back automatically — no application-level cleanup needed.
--    Both booking and transaction status are passed in as parameters so
--    this same RPC serves today's simulated-payment flow and step 2's
--    real pending_payment/pending flow without a signature change.
--
-- 2. business_payout_accounts / tourist_guide_payout_accounts — where a
--    business/guide's bank account for Wompi Payouts dispersion will
--    live. These must NOT be columns on businesses/tourist_guides: both
--    tables carry a public SELECT policy (businesses_select allows any
--    active+verified row; tourist_guides_select is USING (true)) for the
--    public /negocios and /guias listings, so anything added directly to
--    those tables is served to every visitor via PostgREST. Mirrors the
--    profile_contact_details pattern from
--    20260814000000_move_profiles_phone_to_contact_details.sql: a
--    separate 1:1 table with strict owner-or-admin RLS and no broad
--    SELECT policy.
--
-- Depends on:
--   20260730200000_create_bookings_transactions (bookings, transactions)
--   20260730000000_create_businesses_places_experiences (businesses)
--   20260802000000_create_tourist_guides (tourist_guides)
-- =============================================================

-- ------------------------------------------------------------
-- 1. create_booking_with_transaction()
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_with_transaction(
  p_tourist_id             uuid,
  p_quantity               integer,
  p_booking_date           date,
  p_total_amount           numeric,
  p_booking_status         text,
  p_amount_in_cents        bigint,
  p_currency               text,
  p_commission_rate        numeric,
  p_commission_amount_cents bigint,
  p_transaction_status     text,
  p_service_id             uuid DEFAULT NULL,
  p_business_id            uuid DEFAULT NULL,
  p_guide_tour_id          uuid DEFAULT NULL,
  p_guide_id               uuid DEFAULT NULL,
  p_notes                  text DEFAULT NULL
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
    tourist_id, quantity, booking_date, total_amount, status, notes
  )
  VALUES (
    p_service_id, p_business_id, p_guide_tour_id, p_guide_id,
    p_tourist_id, p_quantity, p_booking_date, p_total_amount, p_booking_status, p_notes
  )
  RETURNING id INTO v_booking_id;

  -- If this insert raises (e.g. a future CHECK/trigger failure), the
  -- booking insert above rolls back too — both live in the same
  -- function-call transaction. No manual delete needed.
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

-- Same defense-in-depth posture as get_commission_rate(): only service_role
-- (i.e. createAdminClient() in Server Actions) may call this. It writes
-- financial records, so it must never be reachable via the anon/authenticated
-- Postgres roles even though SECURITY DEFINER would otherwise let it bypass
-- bookings/transactions RLS.
REVOKE EXECUTE ON FUNCTION public.create_booking_with_transaction(
  uuid, integer, date, numeric, text, bigint, text, numeric, bigint, text, uuid, uuid, uuid, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_with_transaction(
  uuid, integer, date, numeric, text, bigint, text, numeric, bigint, text, uuid, uuid, uuid, uuid, text
) TO service_role;

-- ------------------------------------------------------------
-- 2. business_payout_accounts
-- ------------------------------------------------------------
CREATE TABLE public.business_payout_accounts (
  business_id      uuid        PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Matches the beneficiary fields Wompi's Payouts API requires
  -- (bankId/bank name, account type, account number, holder ID + name).
  bank_name        text        NOT NULL,
  account_type     text        NOT NULL CHECK (account_type IN ('ahorros', 'corriente')),
  account_number   text        NOT NULL,
  holder_id_type   text        NOT NULL CHECK (holder_id_type IN ('CC', 'CE', 'NIT')),
  holder_id_number text        NOT NULL,
  holder_name      text        NOT NULL,
  holder_email     text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER business_payout_accounts_set_updated_at
  BEFORE UPDATE ON public.business_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.business_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Deliberately no `USING (true)` anywhere on this table: a bank account
-- number must only ever be visible to the business owner or an admin.
CREATE POLICY "business_payout_accounts_select_own"
  ON public.business_payout_accounts FOR SELECT
  USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "business_payout_accounts_insert_own"
  ON public.business_payout_accounts FOR INSERT
  WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "business_payout_accounts_update_own"
  ON public.business_payout_accounts FOR UPDATE
  USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR public.is_admin()
  );

-- No DELETE policy: only service_role or an admin-authored path may remove
-- a payout account directly; cascades from businesses deletion regardless.

-- ------------------------------------------------------------
-- 3. tourist_guide_payout_accounts
-- Same shape and RLS posture as business_payout_accounts above, scoped to
-- tourist_guides.profile_id instead of businesses.owner_id.
-- ------------------------------------------------------------
CREATE TABLE public.tourist_guide_payout_accounts (
  guide_id         uuid        PRIMARY KEY REFERENCES public.tourist_guides(id) ON DELETE CASCADE,
  bank_name        text        NOT NULL,
  account_type     text        NOT NULL CHECK (account_type IN ('ahorros', 'corriente')),
  account_number   text        NOT NULL,
  holder_id_type   text        NOT NULL CHECK (holder_id_type IN ('CC', 'CE', 'NIT')),
  holder_id_number text        NOT NULL,
  holder_name      text        NOT NULL,
  holder_email     text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tourist_guide_payout_accounts_set_updated_at
  BEFORE UPDATE ON public.tourist_guide_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tourist_guide_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tourist_guide_payout_accounts_select_own"
  ON public.tourist_guide_payout_accounts FOR SELECT
  USING (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "tourist_guide_payout_accounts_insert_own"
  ON public.tourist_guide_payout_accounts FOR INSERT
  WITH CHECK (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "tourist_guide_payout_accounts_update_own"
  ON public.tourist_guide_payout_accounts FOR UPDATE
  USING (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  );
