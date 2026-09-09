-- Item-level availability (per service / guide tour / transporter route)
-- plus a per-provider weekly recurring pattern, and transporter_routes — the
-- transporter's own "menu" of offered routes, the missing third leg of the
-- business→services / guide→guide_tours symmetry.
--
-- Design (see the plan discussed with the user):
--   1. provider_availability (20260903000000) already models a polymorphic,
--      per-date, per-provider availability override. Its provider_type CHECK
--      is widened with three new ITEM-level values ('service', 'guide_tour',
--      'transporter_route') instead of inventing a parallel table — the
--      shape (provider_type/provider_id/date, UNIQUE per triple) already
--      generalizes cleanly. 'transporter' also gets self-service RLS for the
--      first time (20260908000000 excluded it on purpose, reasoning that
--      transport never participates in packages — that reasoning no longer
--      applies now that transporters get their own calendar and routes).
--   2. A brand-new table, provider_weekly_availability, adds a *weekly
--      recurring* layer below the per-date rows: tourist demand (and actor
--      willingness to serve) concentrates on weekends, so a provider can
--      declare "I generally don't attend tourists on Tuesdays" once instead
--      of it looking permanently open by default. Same "row = exception,
--      absence = available" philosophy as provider_availability, just keyed
--      by weekday instead of date, and PROVIDER-level only (business/guide/
--      transporter) — the weekly rhythm belongs to the whole provider, not
--      to an individual service/tour/route.
--   3. is_item_available() composes both layers into a single 3-step
--      resolution (per-date row > weekly-pattern row > available) for an
--      item AND its parent provider, used by the two prereserva RPCs added
--      in a later migration.
--   4. transporter_routes mirrors services/guide_tours: a transporter
--      publishes the routes they actually run, each declaring whether it's
--      offered one-way, round-trip, or both (with an independent price for
--      each, since a round trip isn't reliably 2x a one-way fare).
--      transport_requests gets an optional transporter_route_id (a tourist
--      can still submit a free-text request with no route) and a trip_type
--      column that applies either way.
--
-- Table-creation order matters here: transporter_routes must exist BEFORE
-- provider_availability's widened self-service policies are (re)created,
-- since one of the new branches references it.
--
-- Depends on:
--   20260903000000_create_packages (provider_availability)
--   20260908000000_add_provider_availability_self_service_rls
--   20260908100000_tighten_provider_availability_self_service_check
--   20260801100000_create_transporters (transporters, transport_requests)
--   20260818100000_rename_experiences_to_services (services)
--   20260802000000_create_tourist_guides (guide_tours, tourist_guides)
-- =============================================================


-- ------------------------------------------------------------
-- 1. Widen provider_availability.provider_type
-- ------------------------------------------------------------
ALTER TABLE public.provider_availability
  DROP CONSTRAINT IF EXISTS provider_availability_provider_type_check;

ALTER TABLE public.provider_availability
  ADD CONSTRAINT provider_availability_provider_type_check
  CHECK (provider_type IN ('business','guide','transporter','service','guide_tour','transporter_route'));


-- ------------------------------------------------------------
-- 2. Table: transporter_routes
-- The transporter's own published menu of routes — same role as `services`
-- for a business or `guide_tours` for a guide. Created before section 3
-- below, which references it from a new provider_availability RLS branch.
-- ------------------------------------------------------------
CREATE TABLE public.transporter_routes (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  transporter_id         uuid        NOT NULL REFERENCES public.transporters(id) ON DELETE CASCADE,
  origin                 text        NOT NULL,
  destination            text        NOT NULL,
  -- A route must offer at least one modality. Which modalities make sense
  -- (an airport drop-off is almost always one-way only; a remote waterfall
  -- is almost always round-trip) is a judgment call the transporter is
  -- better placed to make than the tourist requesting it.
  allows_one_way         boolean     NOT NULL DEFAULT true,
  allows_round_trip      boolean     NOT NULL DEFAULT false,
  -- Both nullable = "cotiza al aceptar", same convention as services'
  -- pricing and transport_requests.price_cents. A round trip isn't reliably
  -- 2x a one-way fare, so it gets its own independent price rather than a
  -- computed one.
  price_one_way_cents    integer     CHECK (price_one_way_cents IS NULL OR price_one_way_cents > 0),
  price_round_trip_cents integer     CHECK (price_round_trip_cents IS NULL OR price_round_trip_cents > 0),
  estimated_duration_minutes integer CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),
  notes                  text,
  status                 text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (allows_one_way OR allows_round_trip)
);

CREATE INDEX transporter_routes_transporter_id_idx ON public.transporter_routes (transporter_id);

CREATE TRIGGER transporter_routes_set_updated_at
  BEFORE UPDATE ON public.transporter_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.transporter_routes ENABLE ROW LEVEL SECURITY;

-- Public: only active routes belonging to a currently-available transporter
-- (mirrors transporters_select's own is_available gate). Owner sees all
-- their own routes regardless of status, same as businesses/services.
CREATE POLICY "transporter_routes_select" ON public.transporter_routes FOR SELECT
  USING (
    (status = 'active' AND transporter_id IN (SELECT id FROM public.transporters WHERE is_available = true))
    OR transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "transporter_routes_insert" ON public.transporter_routes FOR INSERT
  WITH CHECK (
    transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "transporter_routes_update" ON public.transporter_routes FOR UPDATE
  USING (
    transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    transporter_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

-- No DELETE policy: deactivate (status='inactive'), don't remove — same
-- posture as services/business_payout_accounts.


-- ------------------------------------------------------------
-- 3. Widen provider_availability's self-service RLS
-- Replaces the three policies from 20260908000000 (already once tightened
-- by 20260908100000, whose source/resolved_by pinning on INSERT/UPDATE is
-- preserved verbatim below) to add ownership branches for the three new
-- item-level provider_types plus 'transporter' itself.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "provider_availability_select_own" ON public.provider_availability;
DROP POLICY IF EXISTS "provider_availability_insert_own" ON public.provider_availability;
DROP POLICY IF EXISTS "provider_availability_update_own" ON public.provider_availability;

CREATE POLICY "provider_availability_select_own"
  ON public.provider_availability FOR SELECT
  USING (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
    OR (provider_type = 'service' AND provider_id IN (
          SELECT s.id FROM public.services s
          JOIN public.businesses b ON b.id = s.business_id
          WHERE b.owner_id = auth.uid()))
    OR (provider_type = 'guide_tour' AND provider_id IN (
          SELECT gt.id FROM public.guide_tours gt
          JOIN public.tourist_guides tg ON tg.id = gt.guide_id
          WHERE tg.profile_id = auth.uid()))
    OR (provider_type = 'transporter_route' AND provider_id IN (
          SELECT tr.id FROM public.transporter_routes tr
          JOIN public.transporters t ON t.id = tr.transporter_id
          WHERE t.profile_id = auth.uid()))
    OR public.is_admin()
  );

-- INSERT/UPDATE's WITH CHECK additionally pins source/resolved_by
-- server-side (20260908100000_tighten_provider_availability_self_service_check)
-- so a provider can't spoof an admin-sourced row — preserved here verbatim
-- for the two existing branches, just extended with the same four new
-- ownership branches as USING/SELECT above.
CREATE POLICY "provider_availability_insert_own"
  ON public.provider_availability FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      (
        (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
        OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
        OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
        OR (provider_type = 'service' AND provider_id IN (
              SELECT s.id FROM public.services s
              JOIN public.businesses b ON b.id = s.business_id
              WHERE b.owner_id = auth.uid()))
        OR (provider_type = 'guide_tour' AND provider_id IN (
              SELECT gt.id FROM public.guide_tours gt
              JOIN public.tourist_guides tg ON tg.id = gt.guide_id
              WHERE tg.profile_id = auth.uid()))
        OR (provider_type = 'transporter_route' AND provider_id IN (
              SELECT tr.id FROM public.transporter_routes tr
              JOIN public.transporters t ON t.id = tr.transporter_id
              WHERE t.profile_id = auth.uid()))
      )
      AND source = 'provider_self_service'
      AND resolved_by = auth.uid()
    )
  );

CREATE POLICY "provider_availability_update_own"
  ON public.provider_availability FOR UPDATE
  USING (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
    OR (provider_type = 'service' AND provider_id IN (
          SELECT s.id FROM public.services s
          JOIN public.businesses b ON b.id = s.business_id
          WHERE b.owner_id = auth.uid()))
    OR (provider_type = 'guide_tour' AND provider_id IN (
          SELECT gt.id FROM public.guide_tours gt
          JOIN public.tourist_guides tg ON tg.id = gt.guide_id
          WHERE tg.profile_id = auth.uid()))
    OR (provider_type = 'transporter_route' AND provider_id IN (
          SELECT tr.id FROM public.transporter_routes tr
          JOIN public.transporters t ON t.id = tr.transporter_id
          WHERE t.profile_id = auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
        OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
        OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
        OR (provider_type = 'service' AND provider_id IN (
              SELECT s.id FROM public.services s
              JOIN public.businesses b ON b.id = s.business_id
              WHERE b.owner_id = auth.uid()))
        OR (provider_type = 'guide_tour' AND provider_id IN (
              SELECT gt.id FROM public.guide_tours gt
              JOIN public.tourist_guides tg ON tg.id = gt.guide_id
              WHERE tg.profile_id = auth.uid()))
        OR (provider_type = 'transporter_route' AND provider_id IN (
              SELECT tr.id FROM public.transporter_routes tr
              JOIN public.transporters t ON t.id = tr.transporter_id
              WHERE t.profile_id = auth.uid()))
      )
      AND source = 'provider_self_service'
      AND resolved_by = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 4. Extend transport_requests for route-based requests
-- ------------------------------------------------------------
ALTER TABLE public.transport_requests
  ADD COLUMN transporter_route_id uuid REFERENCES public.transporter_routes(id) ON DELETE SET NULL,
  ADD COLUMN trip_type text NOT NULL DEFAULT 'one_way' CHECK (trip_type IN ('one_way','round_trip'));

CREATE INDEX transport_requests_transporter_route_id_idx ON public.transport_requests (transporter_route_id);


-- ------------------------------------------------------------
-- 5. Table: provider_weekly_availability
-- A recurring weekly layer beneath provider_availability's per-date rows.
-- Same "row = exception, absence = available" philosophy, just keyed by
-- weekday instead of date, and provider-level only (business/guide/
-- transporter) — the weekly rhythm belongs to the whole provider, not to an
-- individual service/tour/route.
-- ------------------------------------------------------------
CREATE TABLE public.provider_weekly_availability (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_type text        NOT NULL CHECK (provider_type IN ('business','guide','transporter')),
  provider_id   uuid        NOT NULL,
  -- 0=Sunday..6=Saturday, matching JS Date.getDay() — the same convention
  -- AvailabilityCalendar already uses for its own date math.
  weekday       smallint    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  status        text        NOT NULL DEFAULT 'unavailable' CHECK (status IN ('available','unavailable')),
  source        text        NOT NULL DEFAULT 'provider_self_service' CHECK (source IN ('provider_self_service','admin_manual')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_type, provider_id, weekday)
);

CREATE TRIGGER provider_weekly_availability_set_updated_at
  BEFORE UPDATE ON public.provider_weekly_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.provider_weekly_availability ENABLE ROW LEVEL SECURITY;

-- Same three ownership branches as provider_availability's provider-level
-- rows (business/guide/transporter) — no public SELECT policy; read the
-- same way provider_availability is read (admin client, explicit safe
-- column list, from a Server Component).
CREATE POLICY "provider_weekly_availability_select_own"
  ON public.provider_weekly_availability FOR SELECT
  USING (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
    OR public.is_admin()
  );

-- Same source-pinning posture as provider_availability's own tightened
-- policies (20260908100000): a non-admin write must be truthfully
-- self-attributed, never forgeable as 'admin_manual'.
CREATE POLICY "provider_weekly_availability_insert_own"
  ON public.provider_weekly_availability FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      (
        (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
        OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
        OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
      )
      AND source = 'provider_self_service'
    )
  );

CREATE POLICY "provider_weekly_availability_update_own"
  ON public.provider_weekly_availability FOR UPDATE
  USING (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
        OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
        OR (provider_type = 'transporter' AND provider_id IN (SELECT id FROM public.transporters WHERE profile_id = auth.uid()))
      )
      AND source = 'provider_self_service'
    )
  );

-- No DELETE policy: a provider corrects a mistake by flipping status back
-- to 'available' (upsert), never by removing the row — same posture as
-- provider_availability.


-- ------------------------------------------------------------
-- 6. Function: is_item_available()
-- 3-step resolution for whether ENTITY (item or provider) is available on
-- p_date: (1) a per-date row for that entity wins outright, in either
-- direction; (2) else, if the entity is a provider (not an item), its
-- weekly-pattern row for that weekday wins; (3) else, available.
--
-- An item is available on a date only if BOTH its own resolution AND its
-- parent provider's resolution say available — the inheritance the two
-- prereserva RPCs (added in a later migration) rely on. Because of this AND,
-- an item's own explicit 'available' override can never rescue a date its
-- parent has closed — "wins outright" above describes step (1) resolving
-- the ENTITY's own status in isolation, not a bypass of the parent check.
-- The implementation reflects this directly: only item_status =
-- 'unavailable' short-circuits early (a real override, in the blocking
-- direction); an item_status of 'available' or NULL both fall through to
-- the parent check identically, since either way the item itself isn't
-- what's blocking the date.
--
-- SECURITY DEFINER + SET search_path = '' since it reads provider_availability
-- and provider_weekly_availability directly, bypassing RLS by design — this
-- mirrors get_commission_rate()/is_admin() (both SECURITY DEFINER helpers
-- called from other SECURITY DEFINER functions), so it is intentionally NOT
-- granted to anon/authenticated: only the two prereserva RPCs (service_role)
-- call it. Public-facing "which dates are blocked" reads stay outside this
-- function, going straight through createAdminClient() with an explicit
-- safe column list, exactly like provider_availability is read today.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_item_available(
  p_item_type   text,
  p_item_id     uuid,
  p_parent_type text,
  p_parent_id   uuid,
  p_date        date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_status   text;
  parent_status text;
  parent_weekday_status text;
BEGIN
  SELECT status INTO item_status
    FROM public.provider_availability
    WHERE provider_type = p_item_type AND provider_id = p_item_id AND date = p_date;

  IF item_status = 'unavailable' THEN
    RETURN false;
  END IF;

  SELECT status INTO parent_status
    FROM public.provider_availability
    WHERE provider_type = p_parent_type AND provider_id = p_parent_id AND date = p_date;

  IF parent_status IS NOT NULL THEN
    RETURN parent_status = 'available';
  END IF;

  SELECT status INTO parent_weekday_status
    FROM public.provider_weekly_availability
    WHERE provider_type = p_parent_type
      AND provider_id = p_parent_id
      AND weekday = EXTRACT(DOW FROM p_date)::smallint;

  IF parent_weekday_status = 'unavailable' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_item_available(text, uuid, text, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_item_available(text, uuid, text, uuid, date) TO service_role;
