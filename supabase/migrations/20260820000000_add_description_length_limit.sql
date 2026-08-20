-- =============================================================
-- Migration: 20260820000000_add_description_length_limit
-- Adds a CHECK constraint capping `description` at 1200 characters
-- on businesses, places, and services.
--
-- Why 1200: matches the app-level `maxLength` already enforced on
-- the create/edit forms for these three entities. This constraint
-- is defense-in-depth against a client bypassing that limit (e.g.
-- a direct API/SQL insert), not the primary UX guard — the form's
-- maxLength remains the first line of defense for normal users.
--
-- Safe to apply as a normal (non-NOT VALID) constraint: current
-- production data tops out at 1140 (businesses), 1033 (places),
-- and 546 (services) characters, all comfortably under 1200, so
-- validation against existing rows will pass without truncation.
--
-- Depends on:
--   - public.businesses (20260730000000_create_businesses_places_experiences)
--   - public.places     (20260730000000_create_businesses_places_experiences)
--   - public.services    (renamed from experiences in
--                          20260818100000_rename_experiences_to_services)
-- =============================================================

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_description_length_check
  CHECK (char_length(description) <= 1200);

ALTER TABLE public.places
  ADD CONSTRAINT places_description_length_check
  CHECK (char_length(description) <= 1200);

ALTER TABLE public.services
  ADD CONSTRAINT services_description_length_check
  CHECK (char_length(description) <= 1200);
