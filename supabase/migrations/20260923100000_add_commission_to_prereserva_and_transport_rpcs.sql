-- Populates provider_commissions (20260923000000_create_provider_
-- commissions.sql) at the two points a manually-closed deal becomes real
-- money ManTur is owed a cut of:
--   - a service/guide-tour prereserva reaching 'confirmed' (there is no
--     later "completed" step for these today — confirmation IS the deal,
--     same reasoning create_service_prereserva's own header comment uses
--     for skipping a pending_availability step)
--   - a transport trip being marked 'completed' by the transporter (its
--     real distinct terminal event, unlike services/guide-tours)
--
-- p_total_amount/price_cents are already validated server-side by the
-- calling Server Action (never trusted from the client) per
-- .claude/rules/money-and-payments.md; commission is computed here, once,
-- from commission_config via get_commission_rate() — never hardcoded,
-- never recalculated later.

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
  v_rate          numeric;
  v_commission    bigint;
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

  v_rate := public.get_commission_rate('business');
  v_commission := ROUND(p_total_amount * v_rate)::bigint;

  INSERT INTO public.provider_commissions (
    booking_id, recipient_type, recipient_id, commission_rate, commission_amount_cents
  )
  VALUES (
    v_booking_id, 'business', v_business_id, v_rate, v_commission
  );

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
  v_rate          numeric;
  v_commission    bigint;
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

  v_rate := public.get_commission_rate('guide_tour');
  v_commission := ROUND(p_total_amount * v_rate)::bigint;

  INSERT INTO public.provider_commissions (
    booking_id, recipient_type, recipient_id, commission_rate, commission_amount_cents
  )
  VALUES (
    v_booking_id, 'guide', v_guide_id, v_rate, v_commission
  );

  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_guide_tour_prereserva(
  uuid, uuid, integer, date, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guide_tour_prereserva(
  uuid, uuid, integer, date, numeric, text
) TO service_role;


-- Transport: quoting a price at accept time becomes mandatory (was fully
-- optional before — a trip could reach 'completed' with price_cents NULL,
-- making commission uncalculable). Enforced at the DB level, not just in
-- the Server Action, so this can never regress silently.
ALTER TABLE public.transport_requests
  ADD CONSTRAINT transport_requests_price_required_once_accepted
  CHECK (status IN ('pending', 'cancelled') OR price_cents IS NOT NULL);

-- Replaces the raw .update() calls previously made directly by
-- acceptTransportRequest/markCompleted (src/app/(app)/mi-perfil-
-- transporte/actions.ts) with SECURITY DEFINER RPCs, so the mandatory-price
-- check, the status transition, and (on completion) the commission insert
-- are atomic — same posture as create_service_prereserva/
-- create_guide_tour_prereserva above.
CREATE OR REPLACE FUNCTION public.accept_transport_request(
  p_request_id     uuid,
  p_transporter_id uuid,
  p_price_cents    bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_price_cents IS NULL OR p_price_cents <= 0 THEN
    RAISE EXCEPTION 'price_required';
  END IF;

  UPDATE public.transport_requests
  SET transporter_id = p_transporter_id, status = 'accepted', price_cents = p_price_cents
  WHERE id = p_request_id AND status = 'pending' AND transporter_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_available';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_transport_request(
  uuid, uuid, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_transport_request(
  uuid, uuid, bigint
) TO service_role;


CREATE OR REPLACE FUNCTION public.complete_transport_request(
  p_request_id     uuid,
  p_transporter_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_price_cents bigint;
  v_rate        numeric;
  v_commission  bigint;
BEGIN
  UPDATE public.transport_requests
  SET status = 'completed'
  WHERE id = p_request_id AND transporter_id = p_transporter_id AND status = 'accepted'
  RETURNING price_cents INTO v_price_cents;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_available';
  END IF;

  -- price_cents is guaranteed NOT NULL here by
  -- transport_requests_price_required_once_accepted above.
  v_rate := public.get_commission_rate('transport');
  v_commission := ROUND(v_price_cents * v_rate / 100)::bigint;

  INSERT INTO public.provider_commissions (
    transport_request_id, recipient_type, recipient_id, commission_rate, commission_amount_cents
  )
  VALUES (
    p_request_id, 'transporter', p_transporter_id, v_rate, v_commission
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_transport_request(
  uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_transport_request(
  uuid, uuid
) TO service_role;
