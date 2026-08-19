-- =============================================================
-- Migration: 20260817000000_add_lat_lng_to_businesses
-- Adds optional geographic coordinates to businesses, matching
-- the pattern already used by places.lat / places.lng.  Needed
-- so business owners and admins can set a business's location
-- via the upcoming interactive map picker.
--
-- Depends on: 20260730000000_create_businesses_places_experiences
--   - public.businesses table
--
-- No RLS changes: the existing businesses_select / businesses_insert /
-- businesses_update / businesses_delete policies (defined in the
-- migration above) are all row-level, built from owner_id/status/
-- verified/is_admin() conditions rather than column references, so
-- they already cover these two new nullable columns without any
-- edits — the same way places' row-level policies already cover
-- places.lat/places.lng.
-- =============================================================

-- IF NOT EXISTS: the businesses table already declares lat/lng inline in its
-- original CREATE TABLE (20260730000000_create_businesses_places_experiences.sql),
-- so on a fresh `supabase db reset` this migration would otherwise fail with
-- "column already exists". Idempotent either way.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS lng numeric(10,7);
