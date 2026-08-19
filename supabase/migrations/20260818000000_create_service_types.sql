-- =============================================================
-- Migration: 20260818000000_create_service_types
-- Creates:
--   1. service_types — catalog of bookable service kinds
--      (Actividades/Tours, Hospedaje, Alquiler para eventos,
--      Pasadía), driving both the booking total-amount formula
--      (via pricing_unit) and the dynamic attribute fields shown
--      in the create-service form.
--   2. business_category_service_type_suggestions — a pure UX
--      ordering hint (never an enforced constraint) for which
--      service types to surface first in the type picker, based
--      on a business's own categories.
--
-- Mirrors business_categories (20260731000000_create_business_categories.sql)
-- for style and RLS posture: public SELECT of active rows only;
-- no INSERT/UPDATE/DELETE policy because all admin writes go
-- through createAdminClient() (service_role bypasses RLS).
--
-- Depends on:
--   - public.business_categories (20260731000000)
-- =============================================================

-- ------------------------------------------------------------
-- 1. Table: service_types
-- ------------------------------------------------------------
CREATE TABLE public.service_types (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Stable key, also used as the service_type value in commission_config
  -- (see the follow-up rename-to-services migration, §8 of the plan).
  slug         text        NOT NULL UNIQUE,
  -- Spanish display label — source of truth for the type picker UI.
  name         text        NOT NULL,
  -- Drives (a) the booking total-amount formula in createBooking and
  -- (b) which PRICING_UNIT_LABELS string is shown next to base_price
  -- on the owner's create/edit service form.
  pricing_unit text        NOT NULL CHECK (pricing_unit IN ('per_person','per_night','fixed')),
  is_active    boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

-- Public read (active types only) — same shape as business_categories_select.
CREATE POLICY "service_types_select"
  ON public.service_types FOR SELECT
  USING (is_active = true);

-- Admin write via service_role (createAdminClient bypasses RLS).
-- No additional policy needed; service_role ignores RLS by default.
-- (Same posture as business_categories — see /admin/tipos-servicio,
-- modeled on /admin/categorias.)

-- Seed the four initial service types confirmed with the founder.
-- 'tour_activity' doubles as the backfill target for every pre-existing
-- experiences row in the follow-up rename-to-services migration, so it
-- must exist before that migration runs.
INSERT INTO public.service_types (slug, name, pricing_unit, sort_order) VALUES
  ('tour_activity', 'Actividades/Tours',      'per_person', 1),
  ('lodging',        'Hospedaje',              'per_night',  2),
  ('event_rental',   'Alquiler para eventos',  'fixed',      3),
  ('pasadia',         'Pasadía',                'per_person', 4);


-- ------------------------------------------------------------
-- 2. Table: business_category_service_type_suggestions
-- Pure UX ordering hint: which service types to surface first in
-- the type picker for a business tagged with a given category.
-- Never enforced — the full active service_types catalog is always
-- selectable regardless of a business's categories (see plan §1).
-- No surrogate PK, mirrors business_category_links
-- (20260801000000_create_business_category_links.sql): the composite
-- (category_id, service_type_id) pair is already unique by design.
-- ------------------------------------------------------------
CREATE TABLE public.business_category_service_type_suggestions (
  category_id     uuid        NOT NULL REFERENCES public.business_categories(id) ON DELETE CASCADE,
  service_type_id uuid        NOT NULL REFERENCES public.service_types(id)       ON DELETE CASCADE,
  sort_order      integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, service_type_id)
);

ALTER TABLE public.business_category_service_type_suggestions ENABLE ROW LEVEL SECURITY;

-- Public read: consumed directly by the create-service form to order
-- the type picker for a given business's categories. No sensitive data
-- is exposed here (just two UUIDs and an integer).
CREATE POLICY "bcsts_select"
  ON public.business_category_service_type_suggestions FOR SELECT
  USING (true);

-- Admin write via service_role (createAdminClient bypasses RLS).
-- No additional policy needed, same posture as service_types above.

-- Seed suggestion rows from the founder's own examples (plan context
-- section). Category slugs match the existing seed data in
-- business_categories (20260731000000_create_business_categories.sql):
-- resort, restaurant, farm, eatery, casa_de_campo, balneario, other.
--
-- 'restaurant' and 'eatery' each map only to 'pasadia' — a standalone
-- "Comidas/Restaurante" service type was explicitly rejected by the
-- founder in favor of folding that use case into Pasadía, so pasadía
-- is the only sensible soft-UX suggestion for a dining-oriented
-- business today.
--
-- 'other' intentionally gets no rows: the picker falls back to
-- showing the full catalog unordered, which is the desired behavior
-- for a category that doesn't map cleanly to any particular type.
INSERT INTO public.business_category_service_type_suggestions (category_id, service_type_id, sort_order)
SELECT bc.id, st.id, v.suggestion_sort_order
FROM (VALUES
  ('farm',          'lodging',       1),
  ('farm',          'tour_activity', 2),
  ('farm',          'event_rental',  3),
  ('balneario',     'pasadia',       1),
  ('balneario',     'tour_activity', 2),
  ('balneario',     'event_rental',  3),
  ('resort',        'lodging',       1),
  ('resort',         'tour_activity', 2),
  ('resort',         'pasadia',       3),
  ('restaurant',     'pasadia',       1),
  ('eatery',         'pasadia',       1),
  ('casa_de_campo',  'lodging',       1),
  ('casa_de_campo',  'event_rental',  2)
) AS v(category_slug, service_type_slug, suggestion_sort_order)
JOIN public.business_categories bc ON bc.slug = v.category_slug
JOIN public.service_types       st ON st.slug = v.service_type_slug;
