-- =============================================================
-- Migration: 20260904000000_add_packages_slug
--
-- Fase 3 of Paquetes/Tours (public /paquetes pages —
-- docs/wompi-alegra-integration-plan.md §7.2). businesses, places, and
-- tourist_guides all got clean-URL slugs in
-- 20260807200000_add_public_entity_slugs.sql; packages was created after
-- that migration (20260903000000_create_packages.sql) and has no slug
-- column yet. This adds one the same way, reusing the slugify()/
-- unique_slug()/prevent_slug_update() functions that migration already
-- created — no new DB functions needed here.
--
-- packages_select's RLS (USING (is_active = true)) is row-level, not
-- column-scoped, so the new column is automatically covered by the
-- existing public SELECT policy.
--
-- Depends on:
--   20260807200000_add_public_entity_slugs
--     public.slugify(), public.unique_slug(), public.prevent_slug_update()
--   20260903000000_create_packages
--     packages table
-- =============================================================

-- ------------------------------------------------------------
-- 1. slug column (nullable at first — filled by trigger/backfill below,
--    then locked, same sequencing as the original three tables)
-- ------------------------------------------------------------
ALTER TABLE public.packages ADD COLUMN slug text;

-- ------------------------------------------------------------
-- 2. BEFORE INSERT trigger — mirrors places_generate_slug() exactly,
--    packages has its own `name` column (unlike tourist_guides, which
--    has to join profiles for its display name).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.packages_generate_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.slug := public.unique_slug(
    'packages',
    coalesce(nullif(public.slugify(NEW.name), ''), 'paquete'),
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER packages_set_slug
  BEFORE INSERT ON public.packages
  FOR EACH ROW WHEN (NEW.slug IS NULL)
  EXECUTE FUNCTION public.packages_generate_slug();

-- ------------------------------------------------------------
-- 3. Backfill any packages created before this migration (Fase 2a/2b
--    testing may have left rows, and admins may have created real ones)
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM public.packages WHERE slug IS NULL ORDER BY created_at LOOP
    UPDATE public.packages
    SET slug = public.unique_slug('packages', coalesce(nullif(public.slugify(r.name), ''), 'paquete'), r.id)
    WHERE id = r.id;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. Prevent slug changes after creation — reuses the table-agnostic
--    prevent_slug_update() function as-is, just a new trigger binding.
-- ------------------------------------------------------------
CREATE TRIGGER packages_prevent_slug_update
  BEFORE UPDATE OF slug ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_slug_update();

-- ------------------------------------------------------------
-- 5. Lock the column down (safe only once the backfill guarantees no
--    nulls) and index it for the .eq('slug', ...) lookups the public
--    detail page will use.
-- ------------------------------------------------------------
ALTER TABLE public.packages ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.packages ADD CONSTRAINT packages_slug_key UNIQUE (slug);
