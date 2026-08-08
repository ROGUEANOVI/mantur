-- =============================================================
-- Migration: 20260807200000_add_public_entity_slugs
--
-- 1. slugify()          — text → url-safe slug (Spanish accents stripped)
-- 2. unique_slug()       — appends -2, -3, ... until unique within a table
-- 3. slug columns        — businesses, places, tourist_guides (nullable at first)
-- 4. per-table triggers  — populate slug on INSERT when not already set
-- 5. backfill            — existing rows, ordered by created_at
-- 6. prevent slug update — non-admin UPDATE cannot change an existing slug
-- 7. NOT NULL + UNIQUE   — only after backfill guarantees no nulls/dupes
--
-- Public detail pages move from /negocios/[id] to /negocios/[slug] (same
-- for lugares, guias) as part of the SEO plan. Slugs are generated once,
-- at row-creation time, and never regenerated afterward — a business/place
-- rename or a guide's profile name change must not break an already-issued
-- URL.
-- =============================================================

-- ── 1. slugify() ─────────────────────────────────────────────────────────────

-- translate() runs before lower() so the substitution is a plain 1:1
-- character map unaffected by locale/collation quirks (lower() alone isn't
-- guaranteed to fold "Á" → "á" the same way on every Postgres locale).
-- No unaccent extension — this keeps the migration dependency-free.
CREATE OR REPLACE FUNCTION public.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT trim(both '-' FROM
    regexp_replace(
      lower(translate(coalesce(input, ''), 'ÁÉÍÓÚÑÜáéíóúñü', 'AEIOUNUaeiounu')),
      '[^a-z0-9]+', '-', 'g'
    )
  )
$$;

-- ── 2. unique_slug() ─────────────────────────────────────────────────────────

-- Appends -2, -3, ... until the candidate is unique within p_table.
-- p_table is always a hardcoded literal at every call site in this file
-- (never user input), so the format()+EXECUTE dynamic SQL is not an
-- injection vector.
--
-- SECURITY DEFINER: businesses_select's RLS policy only lets an owner see
-- their own rows plus other owners' *verified+active* ones — a pending,
-- unverified business from a different owner is invisible under RLS. If
-- this ran as the inserting owner, two different owners' same-named pending
-- businesses could collide undetected and fail later on the UNIQUE
-- constraint instead of getting a clean "-2" suffix. Running as the
-- function owner (bypassing RLS) makes the uniqueness check see the whole
-- table regardless of who's inserting — mirrors this repo's existing
-- validate_booking_business_id()/validate_booking_guide_id() convention of
-- SECURITY DEFINER for triggers that need full-table visibility.
CREATE OR REPLACE FUNCTION public.unique_slug(p_table text, p_base text, p_exclude_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  candidate text := p_base;
  suffix    int := 1;
  slug_taken boolean;
BEGIN
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I WHERE slug = $1 AND ($2 IS NULL OR id <> $2))',
      p_table
    ) INTO slug_taken USING candidate, p_exclude_id;

    EXIT WHEN NOT slug_taken;
    suffix := suffix + 1;
    candidate := p_base || '-' || suffix;
  END LOOP;

  RETURN candidate;
END;
$$;

-- unique_slug() is SECURITY DEFINER with a plain (non-trigger) signature,
-- which Postgres auto-grants EXECUTE on to PUBLIC by default — that would
-- expose it as a callable RPC (`/rest/v1/rpc/unique_slug`) that any client
-- could use to probe for existing/pending business or guide names (compare
-- input vs. output slug to infer a collision), bypassing businesses_select's
-- RLS restriction on other owners' unverified rows. Lock it down the same
-- way get_commission_rate() is locked down in
-- 20260730000000_create_businesses_places_experiences.sql. The trigger
-- functions below don't need this: Postgres refuses to invoke
-- `RETURNS trigger` functions outside of a trigger context.
REVOKE EXECUTE ON FUNCTION public.unique_slug(text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unique_slug(text, text, uuid) TO service_role;

-- ── 3. slug columns (nullable — filled by trigger/backfill below, then locked) ──

ALTER TABLE public.businesses     ADD COLUMN slug text;
ALTER TABLE public.places         ADD COLUMN slug text;
ALTER TABLE public.tourist_guides ADD COLUMN slug text;

-- ── 4. Per-table BEFORE INSERT triggers ───────────────────────────────────────

-- WHEN (NEW.slug IS NULL) so a future manually-supplied slug (e.g. an admin
-- override UI, not built yet) passes through untouched instead of being
-- overwritten.

CREATE OR REPLACE FUNCTION public.businesses_generate_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.slug := public.unique_slug(
    'businesses',
    coalesce(nullif(public.slugify(NEW.name), ''), 'negocio'),
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_set_slug
  BEFORE INSERT ON public.businesses
  FOR EACH ROW WHEN (NEW.slug IS NULL)
  EXECUTE FUNCTION public.businesses_generate_slug();

CREATE OR REPLACE FUNCTION public.places_generate_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.slug := public.unique_slug(
    'places',
    coalesce(nullif(public.slugify(NEW.name), ''), 'lugar'),
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER places_set_slug
  BEFORE INSERT ON public.places
  FOR EACH ROW WHEN (NEW.slug IS NULL)
  EXECUTE FUNCTION public.places_generate_slug();

-- tourist_guides has no name column of its own — the display name lives on
-- profiles.full_name via profile_id. SECURITY DEFINER also lets this read
-- profiles regardless of the inserting role's RLS visibility (today the
-- only insert path is approveRoleRequest's service_role client, which
-- already bypasses RLS — this is defense-in-depth for any future path).
CREATE OR REPLACE FUNCTION public.tourist_guides_generate_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_full_name text;
BEGIN
  SELECT full_name INTO v_full_name FROM public.profiles WHERE id = NEW.profile_id;
  NEW.slug := public.unique_slug(
    'tourist_guides',
    coalesce(nullif(public.slugify(v_full_name), ''), 'guia'),
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER tourist_guides_set_slug
  BEFORE INSERT ON public.tourist_guides
  FOR EACH ROW WHEN (NEW.slug IS NULL)
  EXECUTE FUNCTION public.tourist_guides_generate_slug();

-- ── 5. Backfill existing rows ─────────────────────────────────────────────────

-- Processed one row at a time (not batched) and ordered by created_at so
-- each unique_slug() call sees every slug already assigned earlier in the
-- loop — this is what makes the -2/-3 suffixing deterministic on backfill.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, name FROM public.businesses WHERE slug IS NULL ORDER BY created_at LOOP
    UPDATE public.businesses
    SET slug = public.unique_slug('businesses', coalesce(nullif(public.slugify(r.name), ''), 'negocio'), r.id)
    WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id, name FROM public.places WHERE slug IS NULL ORDER BY created_at LOOP
    UPDATE public.places
    SET slug = public.unique_slug('places', coalesce(nullif(public.slugify(r.name), ''), 'lugar'), r.id)
    WHERE id = r.id;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tg.id, p.full_name
    FROM public.tourist_guides tg
    JOIN public.profiles p ON p.id = tg.profile_id
    WHERE tg.slug IS NULL
    ORDER BY tg.created_at
  LOOP
    UPDATE public.tourist_guides
    SET slug = public.unique_slug('tourist_guides', coalesce(nullif(public.slugify(r.full_name), ''), 'guia'), r.id)
    WHERE id = r.id;
  END LOOP;
END $$;

-- ── 6. Prevent slug changes after creation (non-admin) ────────────────────────

-- businesses_update/places_update_admin/tourist_guides_update's WITH CHECK
-- only sees the proposed new row, not OLD — RLS alone can't stop an owner
-- from calling supabase.from('businesses').update({ slug: 'x' }) directly
-- (bypassing the app, which never sends `slug` in an update payload today,
-- but that's not something RLS enforces). A BEFORE UPDATE trigger is the
-- only way to compare NEW against OLD, mirroring
-- prevent_business_status_escalation()'s style in
-- 20260730000000_create_businesses_places_experiences.sql. Table-agnostic
-- body, reused across all three tables.
CREATE OR REPLACE FUNCTION public.prevent_slug_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'slug cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_prevent_slug_update
  BEFORE UPDATE OF slug ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_slug_update();

CREATE TRIGGER places_prevent_slug_update
  BEFORE UPDATE OF slug ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.prevent_slug_update();

CREATE TRIGGER tourist_guides_prevent_slug_update
  BEFORE UPDATE OF slug ON public.tourist_guides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_slug_update();

-- ── 7. Lock the column down (only safe once backfill guarantees no nulls) ────

ALTER TABLE public.businesses     ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.places         ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.tourist_guides ALTER COLUMN slug SET NOT NULL;

-- UNIQUE creates its own backing index — no separate CREATE INDEX needed
-- for the .eq('slug', ...) lookups on the public detail pages.
ALTER TABLE public.businesses     ADD CONSTRAINT businesses_slug_key     UNIQUE (slug);
ALTER TABLE public.places         ADD CONSTRAINT places_slug_key         UNIQUE (slug);
ALTER TABLE public.tourist_guides ADD CONSTRAINT tourist_guides_slug_key UNIQUE (slug);

-- No RLS changes: businesses_select / places_select_public /
-- tourist_guides_select are all column-agnostic (USING predicates over
-- whole rows), so the new slug column is automatically covered by the
-- existing policies.
