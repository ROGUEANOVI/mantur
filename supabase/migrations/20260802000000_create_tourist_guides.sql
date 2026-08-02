-- =============================================================
-- Migration: 20260802000000_create_tourist_guides
--
-- 1. tourist_guides  — one row per approved tourist guide
-- 2. guide_tours     — tours offered by a guide (bookable, fixed price)
-- 3. bookings alter  — support guide-tour bookings alongside existing
--                      experience bookings (XOR constraint, nullable FKs,
--                      trigger updates, SELECT policy update)
-- 4. commission_config — extend service_type enum + seed 'guide_tour' row
--
-- Depends on:
--   20260729000000_create_profiles
--     profiles, is_admin(), set_updated_at()
--   20260730000000_create_businesses_places_experiences
--     experiences, businesses, commission_config, get_commission_rate()
--   20260730200000_create_bookings_transactions
--     bookings, validate_booking_business_id()
--   20260731200000_add_tourist_guide_role_and_role_requests
--     user_role.tourist_guide value
-- =============================================================

-- ── 1. tourist_guides ────────────────────────────────────────────────────────

-- One row per approved tourist guide. Rows are created exclusively by the
-- approveRoleRequest Server Action (service_role client) when a tourist_guide
-- role request is approved — mirrors the identical pattern used for transporters.
-- Columns mirror the metadata collected in role_requests.metadata for
-- tourist_guide applicants (specialties, languages, bio).
CREATE TABLE public.tourist_guides (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id   uuid        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  specialties  text[]      NOT NULL DEFAULT '{}',
  languages    text[]      NOT NULL DEFAULT '{}',
  bio          text,
  -- Contact phone captured from role_requests.metadata at approval time.
  -- Used by ManTur admins to verify guide credentials and by tourists who need
  -- to coordinate after booking.
  phone        text        NOT NULL DEFAULT '',
  -- Toggled by the guide from their panel (/mi-perfil-guia).
  -- The public listing (/guias) only shows available guides.
  is_available boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- profile_id is already covered by the UNIQUE index.
-- is_available is queried in the public listing WHERE clause.
CREATE INDEX tourist_guides_is_available_idx ON public.tourist_guides (is_available);

CREATE TRIGGER tourist_guides_set_updated_at
  BEFORE UPDATE ON public.tourist_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tourist_guides ENABLE ROW LEVEL SECURITY;

-- Public (including unauthenticated) can browse the /guias listing.
-- No filtering here — guides control visibility via is_available; the
-- listing page applies that filter in the query, not in policy.
CREATE POLICY "tourist_guides_select"
  ON public.tourist_guides FOR SELECT
  USING (true);

-- No user INSERT policy: rows are created only via the approveRoleRequest
-- Server Action which runs under service_role, bypassing RLS entirely.
-- This prevents any authenticated user from self-inserting a guide profile
-- without admin approval.

-- A guide updates their own profile (bio, availability, specialties).
-- Admin can update any guide row (e.g., emergency suspension).
CREATE POLICY "tourist_guides_update"
  ON public.tourist_guides FOR UPDATE
  USING  (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- Hard deletes are admin-only. Preferred approach is toggling is_available.
CREATE POLICY "tourist_guides_delete"
  ON public.tourist_guides FOR DELETE
  USING (public.is_admin());


-- ── 2. guide_tours ───────────────────────────────────────────────────────────

-- Tours offered by a tourist guide. Structurally similar to experiences on a
-- business: fixed price, capacity, optional duration, image array.
-- Bookings reference guide_tours(id) the same way they reference experiences(id).
CREATE TABLE public.guide_tours (
  id               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Cascade: removing a tourist_guides row removes all their tours too.
  -- ON DELETE RESTRICT is not appropriate here because a guide being removed
  -- (e.g., role revoked) should clean up their tours; existing bookings that
  -- still reference these tours are protected by the bookings FK on guide_tours(id)
  -- with ON DELETE RESTRICT (see the bookings ALTER section below).
  guide_id         uuid          NOT NULL REFERENCES public.tourist_guides(id) ON DELETE CASCADE,
  name             text          NOT NULL,
  description      text,
  -- numeric avoids floating-point rounding for Colombian peso amounts.
  -- 12 digits total, 2 decimal places (COP never uses sub-centavo amounts).
  price            numeric(12,2) NOT NULL CHECK (price >= 0),
  -- capacity >= 1: every tour has at least one slot
  capacity         integer       NOT NULL DEFAULT 1 CHECK (capacity > 0),
  -- NULL is valid when duration is not fixed or not yet specified
  duration_minutes integer       CHECK (duration_minutes > 0),
  images           text[]        NOT NULL DEFAULT '{}',
  -- Soft-delete via status='inactive' is preferred over hard-deleting tours
  -- that have existing bookings (the bookings FK with ON DELETE RESTRICT
  -- would block a hard delete anyway while live bookings exist).
  status           text          NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'inactive')),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

-- guide_id is used in RLS policies and JOIN queries (guide panel page).
CREATE INDEX guide_tours_guide_id_idx ON public.guide_tours (guide_id);
-- status is filtered in the public listing and in the SELECT policy.
CREATE INDEX guide_tours_status_idx   ON public.guide_tours (status);

CREATE TRIGGER guide_tours_set_updated_at
  BEFORE UPDATE ON public.guide_tours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.guide_tours ENABLE ROW LEVEL SECURITY;

-- Public sees active tours (the /guias/[id] listing page).
-- A guide sees all their own tours regardless of status (for /mi-perfil-guia
-- management — they need to see and reactivate inactive tours).
-- Admin sees everything.
CREATE POLICY "guide_tours_select"
  ON public.guide_tours FOR SELECT
  USING (
    status = 'active'
    OR guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

-- Only the owning guide can create tours for themselves.
-- The subquery resolves profile_id → tourist_guides.id. Because the
-- tourist_guides SELECT policy is USING (true), this subquery is always
-- visible regardless of the caller's authentication state, but
-- auth.uid() for an unauthenticated caller returns NULL so the subquery
-- yields an empty set — effectively denying the INSERT.
CREATE POLICY "guide_tours_insert"
  ON public.guide_tours FOR INSERT
  WITH CHECK (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
  );

-- Guide edits their own tours; admin can edit any tour.
CREATE POLICY "guide_tours_update"
  ON public.guide_tours FOR UPDATE
  USING (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

-- Guide can delete their own tours; admin can delete any.
-- IMPORTANT: a hard delete will be blocked by Postgres FK enforcement if any
-- booking rows reference this tour (bookings.guide_tour_id ON DELETE RESTRICT).
-- The guide panel should prefer status='inactive' for tours with live bookings.
CREATE POLICY "guide_tours_delete"
  ON public.guide_tours FOR DELETE
  USING (
    guide_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid())
    OR public.is_admin()
  );


-- ── 3. Alter bookings ────────────────────────────────────────────────────────

-- experience_id and business_id become nullable so guide-tour bookings
-- (which have no experience or business) can share the same table and the
-- existing bookings + transactions payment flow.
ALTER TABLE public.bookings
  ALTER COLUMN experience_id DROP NOT NULL,
  ALTER COLUMN business_id   DROP NOT NULL;

-- guide_tour_id links the booking to the specific tour being booked.
-- guide_id is denormalized from guide_tours.guide_id for RLS SELECT efficiency
-- (avoids a two-hop join bookings → guide_tours → tourist_guides on every
-- SELECT policy evaluation), mirroring the existing business_id denormalization
-- that avoids bookings → experiences → businesses.
-- Both columns use ON DELETE RESTRICT: an in-progress booking must not
-- disappear silently if a guide or tour is removed. The admin must manually
-- cancel affected bookings first.
ALTER TABLE public.bookings
  ADD COLUMN guide_tour_id uuid REFERENCES public.guide_tours(id)    ON DELETE RESTRICT,
  ADD COLUMN guide_id      uuid REFERENCES public.tourist_guides(id) ON DELETE RESTRICT;

CREATE INDEX bookings_guide_tour_id_idx ON public.bookings (guide_tour_id);
CREATE INDEX bookings_guide_id_idx      ON public.bookings (guide_id);

-- XOR constraint: a booking must be exactly one type.
--   • experience_id NOT NULL  AND guide_tour_id IS NULL  → experience booking
--   • guide_tour_id NOT NULL  AND experience_id IS NULL  → guide-tour booking
-- This blocks empty, mixed, or double-set states at the DB level as a
-- defense-in-depth guard complementing the Server Action validation.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_experience_or_guide_tour_xor
  CHECK (
    (experience_id IS NOT NULL AND guide_tour_id IS NULL)
    OR  (experience_id IS NULL  AND guide_tour_id IS NOT NULL)
  );

-- ── Trigger: validate_booking_business_id (updated) ──────────────────────────
-- The existing trigger validates that business_id matches the parent
-- experience's business_id. Now that experience_id can be NULL (guide-tour
-- bookings), the function must skip the check for that case.
-- Replacing the existing function with CREATE OR REPLACE (no signature change).
CREATE OR REPLACE FUNCTION public.validate_booking_business_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_business_id uuid;
BEGIN
  -- Guide-tour bookings have no experience_id; the guide_id/guide_tour_id
  -- consistency is validated by the separate validate_booking_guide_id trigger.
  IF NEW.experience_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_id INTO expected_business_id
  FROM public.experiences
  WHERE id = NEW.experience_id;

  IF expected_business_id IS NULL THEN
    RAISE EXCEPTION 'experience % does not exist', NEW.experience_id;
  END IF;

  IF NEW.business_id IS DISTINCT FROM expected_business_id THEN
    RAISE EXCEPTION 'business_id % does not match experience % (expected %)',
      NEW.business_id, NEW.experience_id, expected_business_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Trigger: validate_booking_guide_id (new) ─────────────────────────────────
-- Mirrors validate_booking_business_id for the guide-tour path.
-- Ensures the denormalized guide_id always matches the guide that owns
-- the referenced guide_tour, preventing wrong RLS attribution.
CREATE OR REPLACE FUNCTION public.validate_booking_guide_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_guide_id uuid;
BEGIN
  -- Experience bookings have no guide_tour_id; nothing to validate.
  IF NEW.guide_tour_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT guide_id INTO expected_guide_id
  FROM public.guide_tours
  WHERE id = NEW.guide_tour_id;

  IF expected_guide_id IS NULL THEN
    RAISE EXCEPTION 'guide_tour % does not exist', NEW.guide_tour_id;
  END IF;

  IF NEW.guide_id IS DISTINCT FROM expected_guide_id THEN
    RAISE EXCEPTION 'guide_id % does not match guide_tour % (expected %)',
      NEW.guide_id, NEW.guide_tour_id, expected_guide_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_validate_guide_id
  BEFORE INSERT OR UPDATE OF guide_id, guide_tour_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_guide_id();

-- ── bookings SELECT policy (replaced) ────────────────────────────────────────
-- The original policy only surfaced rows via tourist_id or business_id.
-- For guide-tour bookings business_id IS NULL, so guides would be invisible
-- to the original policy and /mi-perfil-guia could not list guide tour bookings
-- through the normal client SDK. The guide_id denormalized column makes this
-- extension a single equality predicate with index support (bookings_guide_id_idx).
-- INSERT / UPDATE / DELETE policies are unchanged: all status transitions are
-- driven by Server Actions using the service_role client.
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;

CREATE POLICY "bookings_select"
  ON public.bookings FOR SELECT
  USING (
    tourist_id = auth.uid()
    -- Business owner sees bookings for any of their businesses.
    OR business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
    -- Tourist guide sees bookings for any of their tours.
    -- guide_id is denormalized (from guide_tours.guide_id) so this is a
    -- single-table predicate backed by bookings_guide_id_idx.
    OR guide_id IN (
      SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()
    )
    OR public.is_admin()
  );


-- ── 4. Extend commission_config service_type constraint ──────────────────────

-- The original inline CHECK constraint allows only 'experience', 'transport',
-- 'business'. PostgreSQL names an unnamed inline column CHECK constraint as
-- {table}_{column}_check, so the constraint to drop is:
--   commission_config_service_type_check
-- Drop and recreate with 'guide_tour' added to the allowed set.
-- This must run BEFORE the INSERT below or the insert will fail the check.
ALTER TABLE public.commission_config
  DROP CONSTRAINT IF EXISTS commission_config_service_type_check;

ALTER TABLE public.commission_config
  ADD CONSTRAINT commission_config_service_type_check
  CHECK (service_type IN ('experience', 'transport', 'business', 'guide_tour'));


-- ── 5. Seed commission_config for guide tours ─────────────────────────────────

-- Default rate matches all other service types (10 %).
-- ON CONFLICT DO NOTHING makes this idempotent: re-running the migration
-- or applying it to a DB where an admin has already adjusted the rate
-- will not overwrite the current value.
INSERT INTO public.commission_config (service_type, rate)
VALUES ('guide_tour', 10.00)
ON CONFLICT (service_type) DO NOTHING;
