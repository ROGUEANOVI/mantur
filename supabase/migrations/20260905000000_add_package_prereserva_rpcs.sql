-- =============================================================
-- Migration: 20260905000000_add_package_prereserva_rpcs
--
-- Fase 1 of Paquetes/Tours, continued (see
-- docs/wompi-alegra-integration-plan.md §7/§7.0 and
-- 20260903000000_create_packages.sql, which laid down the schema this
-- migration operates on: bookings.package_id, the three-way
-- bookings_service_guide_or_package_xor constraint, package_items and
-- provider_availability). No application code (Server Actions/pages)
-- exists against these functions yet — that is future work built on top
-- of this migration.
--
-- Why three separate RPCs instead of reusing create_booking_with_transaction():
-- that function always writes bookings + transactions together in one
-- call, which is correct for a service/guide-tour booking (payment intent
-- is known immediately) but wrong for a package pre-reserva, which must
-- NOT create a transactions row until every provider's availability is
-- confirmed (§7.0) — charging the tourist before that would risk an
-- avoidable refund. Splitting the pre-reserva lifecycle into three
-- SECURITY DEFINER functions keeps each state transition atomic on its
-- own, without forcing create_booking_with_transaction() to grow a
-- nullable-everything, conditionally-skip-the-transaction-insert branch:
--
-- 1. create_package_prereserva() — pending_availability. Booking only,
--    no transaction. This is step 1 of §7.0: the tourist requests a
--    package before anyone (admin or provider) has confirmed anything.
--
-- 2. confirm_package_prereserva() — pending_availability -> pending_payment.
--    Re-checks provider_availability for every package_items row at call
--    time (defense-in-depth: never trust that the admin UI's last read is
--    still accurate) and only then opens the transactions row so the
--    tourist can be charged. commission_rate/commission_amount_cents are
--    always 0 here — see the inline comment below for why.
--
-- 3. mark_package_booking_paid() — pending_payment -> confirmed. Wompi
--    checkout stays disabled for packages (manual-ops pivot, PR #110) —
--    there is no webhook for this transition. An admin collects payment
--    manually (WhatsApp + transfer/Wompi link, same as the rest of the
--    manual-ops model) and closes the loop with this RPC from
--    /admin/paquetes/solicitudes.
--
-- All three follow the same defense-in-depth posture as
-- create_booking_with_transaction()/get_commission_rate(): SECURITY
-- DEFINER + SET search_path = '' to bypass bookings/transactions RLS
-- safely, immediately paired with REVOKE ... FROM PUBLIC + GRANT ... TO
-- service_role so only createAdminClient() in a Server Action can ever
-- call them — never the anon/authenticated Postgres roles.
--
-- Depends on:
--   20260730200000_create_bookings_transactions (bookings, transactions)
--   20260818100000_rename_experiences_to_services (services)
--   20260802000000_create_tourist_guides (guide_tours, tourist_guides)
--   20260830000000_create_booking_transaction_rpc_and_payout_accounts
--     (create_booking_with_transaction — the sibling RPC this one does
--     NOT modify or replace)
--   20260903000000_create_packages
--     (packages, package_items, provider_availability, bookings.package_id,
--     bookings_status_check with 'pending_availability',
--     bookings_service_guide_or_package_xor)
-- =============================================================

-- ------------------------------------------------------------
-- 1. create_package_prereserva()
-- Inserts the bookings row only, in status 'pending_availability'.
-- service_id/business_id/guide_tour_id/guide_id all stay NULL, satisfying
-- bookings_service_guide_or_package_xor (exactly one of
-- service_id/guide_tour_id/package_id). Deliberately does not touch
-- transactions — no money has moved yet, and none should until
-- confirm_package_prereserva() succeeds.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_package_prereserva(
  p_tourist_id   uuid,
  p_package_id   uuid,
  p_quantity     integer,
  p_booking_date date,
  p_total_amount numeric,
  p_notes        text DEFAULT NULL
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
    package_id, tourist_id, quantity, booking_date, total_amount, status, notes
  )
  VALUES (
    p_package_id, p_tourist_id, p_quantity, p_booking_date, p_total_amount,
    'pending_availability', p_notes
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

-- Same posture as create_booking_with_transaction(): writes a financial-
-- adjacent record (a booking that will later be charged), so it must
-- never be reachable via anon/authenticated even though SECURITY DEFINER
-- would otherwise let it bypass bookings RLS.
REVOKE EXECUTE ON FUNCTION public.create_package_prereserva(
  uuid, uuid, integer, date, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_package_prereserva(
  uuid, uuid, integer, date, numeric, text
) TO service_role;

-- ------------------------------------------------------------
-- 2. confirm_package_prereserva()
-- Step 2 of §7.0: re-validate every package_items provider's availability
-- for the booking's date, then open the transactions row so payment can
-- proceed. Runs as a single function-call transaction, so a failed
-- availability check or a failed transactions insert rolls back the
-- bookings status update too — the booking is left untouched in
-- 'pending_availability' rather than half-transitioned.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_package_prereserva(
  p_booking_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking            public.bookings%ROWTYPE;
  v_item               RECORD;
  v_provider_type      text;
  v_provider_id        uuid;
  v_transaction_id     uuid;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL
     OR v_booking.status <> 'pending_availability'
     OR v_booking.package_id IS NULL THEN
    RAISE EXCEPTION 'invalid_booking_state';
  END IF;

  -- Re-check every provider in the package, even though an admin may have
  -- already reviewed this on /admin/paquetes before calling this function:
  -- provider_availability can change between that read and this call
  -- (another package could have just marked the same provider
  -- unavailable), so this is server-side defense-in-depth, not a
  -- duplicate of the UI check.
  FOR v_item IN
    SELECT service_id, guide_tour_id
    FROM public.package_items
    WHERE package_id = v_booking.package_id
  LOOP
    IF v_item.service_id IS NOT NULL THEN
      v_provider_type := 'business';
      SELECT business_id INTO v_provider_id
      FROM public.services
      WHERE id = v_item.service_id;
    ELSE
      v_provider_type := 'guide';
      SELECT guide_id INTO v_provider_id
      FROM public.guide_tours
      WHERE id = v_item.guide_tour_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.provider_availability
      WHERE provider_type = v_provider_type
        AND provider_id = v_provider_id
        AND date = v_booking.booking_date
        AND status = 'unavailable'
    ) THEN
      RAISE EXCEPTION 'provider_unavailable';
    END IF;
  END LOOP;

  UPDATE public.bookings
  SET status = 'pending_payment'
  WHERE id = p_booking_id;

  -- commission_rate/commission_amount_cents are always 0 for packages:
  -- ManTur is the operator selling its own inventory here, not taking a
  -- cut of a third party's sale. The margin already lives in
  -- package_items.internal_cost_cents (base_price - Σinternal_cost_cents,
  -- see 20260903000000_create_packages.sql), so commission_config never
  -- applies to a package booking.
  INSERT INTO public.transactions (
    booking_id, status, amount_in_cents, currency,
    commission_rate, commission_amount_cents
  )
  VALUES (
    p_booking_id, 'pending', round(v_booking.total_amount * 100), 'COP',
    0, 0
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_package_prereserva(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_package_prereserva(uuid) TO service_role;

-- ------------------------------------------------------------
-- 3. mark_package_booking_paid()
-- Step 3 of §7.0: the package-booking equivalent of the Wompi webhook's
-- normal paid/confirmed flip, exposed as its own callable so the webhook
-- handler can call it directly instead of duplicating the two-table
-- update inline for the package case.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_package_booking_paid(
  p_booking_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL
     OR v_booking.package_id IS NULL
     OR v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'invalid_booking_state';
  END IF;

  UPDATE public.transactions
  SET status = 'paid'
  WHERE booking_id = p_booking_id;

  UPDATE public.bookings
  SET status = 'confirmed'
  WHERE id = p_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_package_booking_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_package_booking_paid(uuid) TO service_role;
