-- =============================================================
-- Migration: 20260818100000_rename_experiences_to_services
-- Renames experiences → services and reshapes it into a flexible,
-- per-type commerce entity (Actividades/Tours today; Hospedaje,
-- Alquiler para eventos, Pasadía going forward), all in one
-- transaction (Postgres DDL is transactional).
--
-- Ordered steps:
--   1. Rename table experiences -> services.
--   2. Rename the table's 4 RLS policies and its updated_at trigger
--      (these do not follow a table rename automatically).
--   3. Rename column price -> base_price.
--   4. Add service_type_id, backfill to 'tour_activity', SET NOT NULL.
--   5. Add attributes jsonb, migrate duration_minutes into it, drop
--      duration_minutes (capacity stays a first-class column — see
--      inline comment).
--   6. bookings: rename experience_id -> service_id (+ its FK
--      constraint), rename people_count -> quantity.
--   7. Re-create validate_booking_business_id() against services/
--      service_id; rename the XOR check constraint.
--   8. commission_config: extend the service_type CHECK constraint,
--      rename the 'experience' row to 'tour_activity', seed 3 new
--      rows (lodging/event_rental/pasadia) carrying forward whatever
--      rate tour_activity already has.
--   9. No storage bucket/policy changes — see comment at the bottom.
--
-- Depends on:
--   20260730000000_create_businesses_places_experiences
--     experiences, businesses, commission_config
--   20260730200000_create_bookings_transactions
--     bookings, validate_booking_business_id()
--   20260802000000_create_tourist_guides
--     bookings.guide_tour_id/guide_id, the XOR constraint, the
--     extended commission_config CHECK — direct precedent for the
--     re-alter pattern used again here
--   20260818000000_create_service_types
--     service_types (needs the 'tour_activity' row's id for backfill)
-- =============================================================

-- ── 1. Rename table ──────────────────────────────────────────────────────────

ALTER TABLE public.experiences RENAME TO services;


-- ── 2. Rename policies + trigger (do not follow a table rename) ─────────────

-- Same bodies as the original experiences_* policies
-- (20260730000000_create_businesses_places_experiences.sql), just
-- renamed and re-worded for the new entity name.

DROP POLICY IF EXISTS "experiences_select" ON public.services;
DROP POLICY IF EXISTS "experiences_insert" ON public.services;
DROP POLICY IF EXISTS "experiences_update" ON public.services;
DROP POLICY IF EXISTS "experiences_delete_admin" ON public.services;

-- Active services of verified+active businesses are public.
-- Inactive services (and those of pending/unverified businesses)
-- are only visible to the owning business_owner and admins.
CREATE POLICY "services_select"
  ON public.services FOR SELECT
  USING (
    (
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = business_id AND b.status = 'active' AND b.verified = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Only the business owner (verified via the businesses table)
-- or an admin may add services to a business.
CREATE POLICY "services_insert"
  ON public.services FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Same ownership check for updates.
CREATE POLICY "services_update"
  ON public.services FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Services linked to past bookings should never be hard-deleted.
-- Soft-delete via status='inactive' is the preferred path.
-- Hard delete is admin-only as a last resort.
CREATE POLICY "services_delete_admin"
  ON public.services FOR DELETE
  USING (public.is_admin());

ALTER TRIGGER experiences_set_updated_at ON public.services
  RENAME TO services_set_updated_at;


-- ── 3. Rename price -> base_price ────────────────────────────────────────────

-- Unit now varies by service_type (per person / per night / fixed);
-- base_price pairs with bookings.quantity in the total-amount formula.
-- Note: the inline CHECK (price >= 0) constraint keeps its original
-- auto-generated name (experiences_price_check) — Postgres does not
-- rename constraints on a column/table rename. Purely cosmetic; the
-- constraint still enforces against the renamed column correctly.
ALTER TABLE public.services RENAME COLUMN price TO base_price;


-- ── 4. Add service_type_id, backfill, lock down ──────────────────────────────

-- Nullable first so the backfill UPDATE below can run, then locked to
-- NOT NULL. service_type_id is immutable after creation at the
-- application level (Server Actions never accept it on update) to
-- avoid orphaned `attributes` shaped for a stale type.
ALTER TABLE public.services
  ADD COLUMN service_type_id uuid REFERENCES public.service_types(id);

-- Every pre-existing row was a guided-tour-style experience priced
-- per person — the exact shape of 'tour_activity'.
UPDATE public.services
SET service_type_id = (SELECT id FROM public.service_types WHERE slug = 'tour_activity');

ALTER TABLE public.services
  ALTER COLUMN service_type_id SET NOT NULL;


-- ── 5. Add attributes jsonb; migrate + drop duration_minutes ─────────────────

-- attributes holds the per-type extra fields (see
-- src/lib/services/attributeConfig.ts): duration/meeting point for
-- tour_activity, rooms/beds/checkin/checkout for lodging, etc.
-- Not modeled as columns because the field set genuinely varies by
-- type and would otherwise require a column per type per field.
ALTER TABLE public.services
  ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}';

-- duration_minutes is not universal (meaningless for lodging, event
-- rental, and pasadía), so it moves into the generic attributes bag
-- under the same key the tour_activity attribute config expects,
-- rather than being silently dropped.
UPDATE public.services
SET attributes = jsonb_set(attributes, '{duration_minutes}', to_jsonb(duration_minutes))
WHERE duration_minutes IS NOT NULL;

ALTER TABLE public.services
  DROP COLUMN duration_minutes;

-- capacity is intentionally left untouched and unrenamed: it is
-- genuinely universal (guests/room, seats, max attendees, tour group
-- size) across every service_type, and is already read directly by
-- the booking capacity check and BookingForm's `max` attribute — no
-- reason to hide it behind the jsonb bag.


-- ── 6. bookings: rename experience_id -> service_id, people_count -> quantity ─

-- The FK target (services) follows the referenced-table rename
-- automatically via OID, but the constraint's own name does not
-- rename itself — done explicitly below for readability.
ALTER TABLE public.bookings RENAME COLUMN experience_id TO service_id;
ALTER TABLE public.bookings
  RENAME CONSTRAINT bookings_experience_id_fkey TO bookings_service_id_fkey;

-- Pure rename, no data transform: an existing "5 people" booking
-- becomes quantity=5 unchanged. For lodging bookings going forward,
-- quantity is read as "nights" in the UI copy — see the plan's
-- explicit MVP limitation note: there is no automatic checkout-date
-- derivation, booking_date stays a single start date.
ALTER TABLE public.bookings RENAME COLUMN people_count TO quantity;

-- Note: the inline CHECK (people_count > 0) constraint keeps its
-- original auto-generated name (bookings_people_count_check) for the
-- same reason noted in step 3 above — cosmetic only.


-- ── 7. Re-create validate_booking_business_id(); rename the XOR constraint ──

-- Same signature (CREATE OR REPLACE), body updated to query
-- public.services / reference NEW.service_id instead of
-- public.experiences / NEW.experience_id. This is the second
-- re-definition of this function — the first was in
-- 20260802000000_create_tourist_guides.sql to handle the nullable
-- experience_id (guide-tour bookings) case, which is preserved here.
CREATE OR REPLACE FUNCTION public.validate_booking_business_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_business_id uuid;
BEGIN
  -- Guide-tour bookings have no service_id; the guide_id/guide_tour_id
  -- consistency is validated by the separate validate_booking_guide_id trigger.
  IF NEW.service_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_id INTO expected_business_id
  FROM public.services
  WHERE id = NEW.service_id;

  IF expected_business_id IS NULL THEN
    RAISE EXCEPTION 'service % does not exist', NEW.service_id;
  END IF;

  IF NEW.business_id IS DISTINCT FROM expected_business_id THEN
    RAISE EXCEPTION 'business_id % does not match service % (expected %)',
      NEW.business_id, NEW.service_id, expected_business_id;
  END IF;

  RETURN NEW;
END;
$$;

-- The existing trigger (bookings_validate_business_id, fired BEFORE
-- INSERT OR UPDATE OF business_id, experience_id) tracks its column
-- list by attribute number internally, so it keeps firing correctly
-- on service_id updates without needing to be re-created here.

-- Renamed for consistency with the new column/table names; the CHECK
-- expression itself is unchanged (Postgres redisplays it using the
-- current column name automatically), so only the constraint's own
-- name needs updating.
ALTER TABLE public.bookings
  RENAME CONSTRAINT bookings_experience_or_guide_tour_xor
  TO bookings_service_or_guide_tour_xor;


-- ── 8. commission_config: extend CHECK, rename key, seed new rows ───────────

-- Same pattern 20260802000000_create_tourist_guides.sql already used
-- to add 'guide_tour': drop + recreate the unnamed-inline-turned-named
-- CHECK constraint with the full new allowed set.
--
-- Unlike that precedent, this new set DROPS 'experience' entirely
-- (replaced by 'tour_activity'), so the constraint cannot be re-added
-- until the existing 'experience' row is renamed first -- otherwise
-- ADD CONSTRAINT validates the current data immediately and fails on
-- that row. Order here is therefore: drop constraint -> rename data ->
-- add new constraint -> seed new rows.
ALTER TABLE public.commission_config
  DROP CONSTRAINT IF EXISTS commission_config_service_type_check;

-- Safe to rename the config key without touching historical data:
-- transactions.commission_rate is a numeric value captured at booking
-- creation time, not a live reference to commission_config, so
-- existing transactions are unaffected by this rename.
UPDATE public.commission_config
SET service_type = 'tour_activity'
WHERE service_type = 'experience';

ALTER TABLE public.commission_config
  ADD CONSTRAINT commission_config_service_type_check
  CHECK (service_type IN ('tour_activity','lodging','event_rental','pasadia','transport','business','guide_tour'));

-- Seed the 3 new service types by carrying forward whatever rate
-- tour_activity currently has (not hardcoded), so a prior admin rate
-- change is preserved across the split. ON CONFLICT keeps this
-- idempotent on re-run, same as every other commission_config seed
-- in this codebase.
INSERT INTO public.commission_config (service_type, rate)
SELECT v.service_type, cc.rate
FROM (VALUES ('lodging'), ('event_rental'), ('pasadia')) AS v(service_type)
CROSS JOIN (SELECT rate FROM public.commission_config WHERE service_type = 'tour_activity') AS cc
ON CONFLICT (service_type) DO NOTHING;


-- ── 9. Storage: no changes needed ────────────────────────────────────────────

-- Bucket policies in 20260730000000_create_businesses_places_experiences.sql
-- and 20260807100000_add_videos_and_video_buckets.sql check only
-- bucket_id and owner = auth.uid(), never a path prefix. The
-- experiences/[id]/... -> services/[id]/... storage path prefix is
-- purely an application-level string constant (changed in the
-- corresponding Server Action code, not here). Already-uploaded files
-- keep their old prefix and existing public URLs (stored absolute,
-- never reconstructed from the entity type) — no backfill needed.
