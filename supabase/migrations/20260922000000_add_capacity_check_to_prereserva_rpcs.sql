-- Fixes an overbooking hole in create_service_prereserva()/
-- create_guide_tour_prereserva() (20260921000000_add_service_and_guide_tour_
-- prereserva_rpcs.sql): both only checked date-level availability via
-- is_item_available(), never capacity. The calling Server Actions
-- (createServicePrereserva/createGuideTourPrereserva in
-- src/app/(app)/reservas/actions.ts) only verify that a single request's
-- own quantity doesn't exceed total capacity — they never sum against other
-- bookings already 'confirmed' for the same item + date. Two different
-- tourists could each request quantity=1 against capacity=1 on the same
-- day and both get auto-confirmed: a real double-booking with no
-- system-level prevention, since this flow has no admin/provider approval
-- step to catch it after the fact (see that migration's own header comment).
--
-- Fix: sum existing 'confirmed' bookings' quantity for the same item+date
-- and reject if the new request would exceed capacity (NULL capacity means
-- unlimited, same convention as the existing `capacity !== null` checks in
-- reservas/actions.ts). This is a classic check-then-insert race under
-- READ COMMITTED, so both functions take a pg_advisory_xact_lock keyed by
-- item_type+item_id+date as their very first statement, before either the
-- availability re-check or the capacity aggregate — see
-- .claude/skills/supabase-postgres-best-practices/references/lock-advisory.md.
-- This serializes only concurrent calls for the SAME item+date; different
-- items/dates never contend. The lock is released automatically at
-- commit/rollback of the function's implicit transaction. Prefixing the
-- hash input with the literal item-type string avoids a hash-input
-- collision between the two RPCs on the same date/id; an actual
-- hashtext() output collision only costs an unrelated, harmless extra bit
-- of serialization, never a correctness bug.

CREATE OR REPLACE FUNCTION public.create_service_prereserva(
  p_tourist_id   uuid,
  p_service_id   uuid,
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
  v_business_id   uuid;
  v_capacity      integer;
  v_existing_qty  integer;
  v_booking_id    uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('service' || p_service_id::text || p_booking_date::text));

  SELECT business_id, capacity INTO v_business_id, v_capacity
  FROM public.services
  WHERE id = p_service_id AND status = 'active';

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  IF NOT public.is_item_available('service', p_service_id, 'business', v_business_id, p_booking_date) THEN
    RAISE EXCEPTION 'date_unavailable';
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_existing_qty
    FROM public.bookings
    WHERE service_id = p_service_id AND booking_date = p_booking_date AND status = 'confirmed';

    IF v_existing_qty + p_quantity > v_capacity THEN
      RAISE EXCEPTION 'capacity_exceeded';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    service_id, business_id, tourist_id, quantity, booking_date, total_amount, status, notes
  )
  VALUES (
    p_service_id, v_business_id, p_tourist_id, p_quantity, p_booking_date, p_total_amount,
    'confirmed', p_notes
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_service_prereserva(
  uuid, uuid, integer, date, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_service_prereserva(
  uuid, uuid, integer, date, numeric, text
) TO service_role;


CREATE OR REPLACE FUNCTION public.create_guide_tour_prereserva(
  p_tourist_id    uuid,
  p_guide_tour_id uuid,
  p_quantity      integer,
  p_booking_date  date,
  p_total_amount  numeric,
  p_notes         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_guide_id      uuid;
  v_capacity      integer;
  v_existing_qty  integer;
  v_booking_id    uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('guide_tour' || p_guide_tour_id::text || p_booking_date::text));

  SELECT guide_id, capacity INTO v_guide_id, v_capacity
  FROM public.guide_tours
  WHERE id = p_guide_tour_id AND status = 'active';

  IF v_guide_id IS NULL THEN
    RAISE EXCEPTION 'guide_tour_not_found';
  END IF;

  IF NOT public.is_item_available('guide_tour', p_guide_tour_id, 'guide', v_guide_id, p_booking_date) THEN
    RAISE EXCEPTION 'date_unavailable';
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_existing_qty
    FROM public.bookings
    WHERE guide_tour_id = p_guide_tour_id AND booking_date = p_booking_date AND status = 'confirmed';

    IF v_existing_qty + p_quantity > v_capacity THEN
      RAISE EXCEPTION 'capacity_exceeded';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    guide_tour_id, guide_id, tourist_id, quantity, booking_date, total_amount, status, notes
  )
  VALUES (
    p_guide_tour_id, v_guide_id, p_tourist_id, p_quantity, p_booking_date, p_total_amount,
    'confirmed', p_notes
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_guide_tour_prereserva(
  uuid, uuid, integer, date, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guide_tour_prereserva(
  uuid, uuid, integer, date, numeric, text
) TO service_role;
