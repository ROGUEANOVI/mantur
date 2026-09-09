-- Fase C of the item-level availability plan: a pre-reserva flow for
-- business services and guide tours, analogous to Paquetes' (§7.0) but
-- simpler and improved — the tourist-facing date picker (BlockedDatesPicker,
-- application-side) already blocks unavailable dates *before* submission,
-- using the item + parent availability now available since Fase A/B. There
-- is nothing left for an admin to confirm afterward, unlike Paquetes (which
-- exists precisely because its providers didn't have their own calendar
-- yet) — so these RPCs insert the booking directly at 'confirmed', with no
-- 'pending_availability' intermediate state and no transactions row (money
-- stays dormant, same posture as the rest of the manual-ops pivot). The
-- business/guide is notified by email to coordinate by WhatsApp, same as
-- every other manual-ops flow.
--
-- Both re-check is_item_available() server-side even though the tourist's
-- own date picker already filtered the option out — defense-in-depth
-- against a stale client read, same reasoning as
-- confirm_package_prereserva()'s own re-check.
--
-- Depends on:
--   20260730200000_create_bookings_transactions (bookings)
--   20260818100000_rename_experiences_to_services (services)
--   20260802000000_create_tourist_guides (guide_tours, tourist_guides)
--   20260917000000_add_transport_payments (current bookings XOR:
--     bookings_service_guide_package_or_transport_xor — unaffected, these
--     RPCs only ever set service_id or guide_tour_id, same shape
--     create_booking_with_transaction already uses)
--   20260920000000_add_item_availability_and_transporter_routes
--     (is_item_available(), item-level provider_availability rows)
-- =============================================================


-- ------------------------------------------------------------
-- 1. create_service_prereserva()
-- ------------------------------------------------------------
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
  v_business_id uuid;
  v_booking_id  uuid;
BEGIN
  SELECT business_id INTO v_business_id
  FROM public.services
  WHERE id = p_service_id AND status = 'active';

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  IF NOT public.is_item_available('service', p_service_id, 'business', v_business_id, p_booking_date) THEN
    RAISE EXCEPTION 'date_unavailable';
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

-- Same posture as create_package_prereserva()/create_booking_with_transaction():
-- writes a bookings row directly, so it must never be reachable via
-- anon/authenticated even though SECURITY DEFINER would otherwise let it
-- bypass bookings RLS.
REVOKE EXECUTE ON FUNCTION public.create_service_prereserva(
  uuid, uuid, integer, date, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_service_prereserva(
  uuid, uuid, integer, date, numeric, text
) TO service_role;


-- ------------------------------------------------------------
-- 2. create_guide_tour_prereserva()
-- ------------------------------------------------------------
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
  v_guide_id   uuid;
  v_booking_id uuid;
BEGIN
  SELECT guide_id INTO v_guide_id
  FROM public.guide_tours
  WHERE id = p_guide_tour_id AND status = 'active';

  IF v_guide_id IS NULL THEN
    RAISE EXCEPTION 'guide_tour_not_found';
  END IF;

  IF NOT public.is_item_available('guide_tour', p_guide_tour_id, 'guide', v_guide_id, p_booking_date) THEN
    RAISE EXCEPTION 'date_unavailable';
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
