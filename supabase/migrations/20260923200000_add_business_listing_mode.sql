-- =============================================================
-- Migration: 20260923200000_add_business_listing_mode
--
-- ManTur's core is tourism bookings, but business_categories already
-- includes categories with little booking value for a general-public
-- audience (restaurant, eatery/"picada") alongside tourism-value
-- categories (resort/balneario, farm, casa_de_campo) that should keep
-- selling services and taking bookings through ManTur. This migration
-- lets a category default to "informational" (profile-only, no
-- services) or "bookable", with a per-business override for the mixed
-- cases a category default can't capture (e.g. a restaurant that also
-- rents its lot for events).
--
-- 1. business_categories.default_listing_mode — the category-level
--    default. Seeded 'informational' for restaurant/eatery,
--    'bookable' for everything else (resort, farm, casa_de_campo,
--    balneario, other) — same posture as today, no regression.
--
-- 2. businesses.listing_mode_override — optional per-business
--    override, for a business whose actual offering doesn't match its
--    category's default (a restaurant that rents its lot for events
--    is a real, common case here).
--
-- 3. public.business_listing_mode(uuid) — the single resolution
--    function backing both the services trigger below and every
--    TypeScript call site (Server Actions, admin pages, the public
--    business page) via .rpc(). Never duplicate this resolution
--    logic in TypeScript — always call the RPC — so there is exactly
--    one place the rule can drift. Resolution order:
--      a. businesses.listing_mode_override, if set.
--      b. 'bookable', if the business has any active category whose
--         own default is 'bookable' (a mixed-category business — e.g.
--         restaurant + balneario — keeps selling).
--      c. 'informational', if it has any active category at all (and
--         reached here, so none of them are 'bookable').
--      d. 'bookable', if it has no categories at all — preserves
--         today's behavior for any business not yet tagged.
--
-- 4. Backfill: any business that already has an active service gets
--    an explicit listing_mode_override = 'bookable' *before* the
--    trigger below exists, so re-tagging restaurant/eatery to
--    'informational' above never silently freezes a business that is
--    already selling.
--
-- 5. A BEFORE INSERT OR UPDATE trigger on services blocks a new
--    service, or reactivating one (status -> 'active'), while the
--    owning business currently resolves to 'informational'. Editing
--    an already-inactive service's own fields is left alone — it
--    can't become bookable while the business stays informational
--    either way. This is the enforcement backstop; the friendlier
--    pre-check in createService (mi-negocio/actions.ts) exists purely
--    for a clear error message, same relationship as every other
--    "Server Action pre-checks, RPC/trigger is the real gate" pair
--    already in this codebase (see create_package_prereserva's
--    provider_availability re-check comment).
--
-- Depends on:
--   20260731000000_create_business_categories
--   20260730000000_create_businesses_places_experiences (businesses, services)
-- =============================================================

-- ------------------------------------------------------------
-- 1. business_categories.default_listing_mode
-- ------------------------------------------------------------
ALTER TABLE public.business_categories
  ADD COLUMN default_listing_mode text NOT NULL DEFAULT 'bookable'
    CHECK (default_listing_mode IN ('informational', 'bookable'));

-- Restaurants and picadas serve the general public, not specifically
-- tourists, and aren't Ley 300 tourism-service providers (no RNT) —
-- little sense in a ManTur booking flow for them. Every other seeded
-- category keeps the 'bookable' column default.
UPDATE public.business_categories
  SET default_listing_mode = 'informational'
  WHERE slug IN ('restaurant', 'eatery');

-- ------------------------------------------------------------
-- 2. businesses.listing_mode_override
-- ------------------------------------------------------------
ALTER TABLE public.businesses
  ADD COLUMN listing_mode_override text
    CHECK (listing_mode_override IN ('informational', 'bookable'));

-- ------------------------------------------------------------
-- 3. Backfill — run before the trigger exists (step 5), so
-- retagging restaurant/eatery above never freezes a business that
-- is already selling active services.
-- ------------------------------------------------------------
UPDATE public.businesses b
SET listing_mode_override = 'bookable'
WHERE b.listing_mode_override IS NULL
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.business_id = b.id AND s.status = 'active'
  );

-- ------------------------------------------------------------
-- 4. public.business_listing_mode(uuid) — single resolution function.
-- SECURITY DEFINER: business_category_links/business_categories are
-- already public-select tables (same posture as is_admin() reading
-- profiles), so this just avoids depending on the caller's own RLS
-- context to resolve a non-sensitive enum value.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_listing_mode(p_business_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT b.listing_mode_override FROM public.businesses b WHERE b.id = p_business_id),
    (
      SELECT 'bookable'
      FROM public.business_category_links bcl
      JOIN public.business_categories bc ON bc.id = bcl.category_id
      WHERE bcl.business_id = p_business_id
        AND bc.is_active = true
        AND bc.default_listing_mode = 'bookable'
      LIMIT 1
    ),
    (
      SELECT 'informational'
      FROM public.business_category_links bcl
      JOIN public.business_categories bc ON bc.id = bcl.category_id
      WHERE bcl.business_id = p_business_id
        AND bc.is_active = true
      LIMIT 1
    ),
    'bookable'
  );
$$;

-- ------------------------------------------------------------
-- 5. services trigger — enforcement backstop.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_service_when_informational()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.business_listing_mode(NEW.business_id) = 'informational' THEN
    IF TG_OP = 'INSERT' OR NEW.status = 'active' THEN
      RAISE EXCEPTION 'business_is_informational: business % does not offer bookable services', NEW.business_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER services_prevent_when_informational
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.prevent_service_when_informational();
