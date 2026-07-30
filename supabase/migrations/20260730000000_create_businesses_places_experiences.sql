-- =============================================================
-- Migration: 20260730000000_create_businesses_places_experiences
-- Creates: get_my_role() helper, businesses, places, experiences,
-- commission_config tables with full RLS, and the
-- business-images Storage bucket with its access policies.
--
-- Depends on: 20260729000000_create_profiles
--   - public.user_role enum
--   - public.profiles table
--   - public.is_admin()       SECURITY DEFINER helper
--   - public.set_updated_at() trigger function
-- =============================================================

-- ------------------------------------------------------------
-- 1. Helper: get_my_role()
-- Returns the role of the currently authenticated user by
-- querying profiles directly (bypasses RLS via SECURITY DEFINER,
-- same pattern as is_admin()).  Reused in every INSERT/UPDATE
-- policy that needs to verify the caller's role without a
-- subquery, keeping policies short and readable.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 2. Table: businesses
-- Owned by a profile with role = 'business_owner'.
-- New rows start as status='pending'/verified=false until an
-- admin approves them; the SELECT policy hides unapproved rows
-- from third parties while keeping them visible to their owner.
-- ------------------------------------------------------------
CREATE TABLE public.businesses (
  id          uuid           DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id    uuid           NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text           NOT NULL,
  description text,
  -- English canonical keys; Spanish labels live in src/lib/copy/businesses.ts
  type        text           NOT NULL CHECK (type IN ('resort','restaurant','farm','eatery','other')),
  address     text,
  phone       text,
  images      text[]         NOT NULL DEFAULT '{}',
  verified    boolean        NOT NULL DEFAULT false,
  -- pending → active (admin approves) → inactive (suspended)
  status      text           NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','active','inactive')),
  lat         numeric(10,7),
  lng         numeric(10,7),
  created_at  timestamptz    NOT NULL DEFAULT now(),
  updated_at  timestamptz    NOT NULL DEFAULT now()
);

CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Prevent business owners from self-approving their listing.
-- On INSERT: non-admins must supply verified=false and status='pending'.
-- On UPDATE: non-admins may not change verified or status at all.
-- Mirrors the prevent_role_escalation pattern from the profiles migration.
CREATE OR REPLACE FUNCTION public.prevent_business_status_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.verified = true OR NEW.status != 'pending' THEN
        RAISE EXCEPTION 'new businesses must start as pending and unverified';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.verified IS DISTINCT FROM OLD.verified
         OR NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'insufficient privileges to change business verification or status';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_prevent_status_escalation
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_business_status_escalation();

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Public visitors see only verified + active listings.
-- Owners always see their own rows regardless of status.
-- Admins see every row.
CREATE POLICY "businesses_select"
  ON public.businesses FOR SELECT
  USING (
    (status = 'active' AND verified = true)
    OR owner_id = auth.uid()
    OR public.is_admin()
  );

-- Only authenticated users with role business_owner may create a
-- business, and owner_id must equal their uid to prevent impersonation.
-- Admins may also insert (e.g., to seed listings or provide support).
CREATE POLICY "businesses_insert"
  ON public.businesses FOR INSERT
  WITH CHECK (
    (auth.uid() = owner_id AND public.get_my_role() = 'business_owner')
    OR public.is_admin()
  );

-- Owners may update their own listing; admins may update any.
-- WITH CHECK mirrors USING so the implied check doesn't silently allow
-- column changes that USING alone would permit on the post-update row.
CREATE POLICY "businesses_update"
  ON public.businesses FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- Hard deletes are admin-only; owners should set status='inactive'
-- instead of deleting to preserve referential integrity with
-- bookings and transactions.
CREATE POLICY "businesses_delete"
  ON public.businesses FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 3. Table: places
-- Static informational attractions (no transactions).
-- Fully public for SELECT; only admins may modify.
-- ------------------------------------------------------------
CREATE TABLE public.places (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  description text,
  -- English canonical keys; Spanish labels live in src/lib/copy/businesses.ts
  type        text        CHECK (type IN ('waterfall','river','viewpoint','beach','park','other')),
  images      text[]      NOT NULL DEFAULT '{}',
  lat         numeric(10,7),
  lng         numeric(10,7),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER places_set_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

-- Fully public: anyone (even unauthenticated) can read places.
CREATE POLICY "places_select_public"
  ON public.places FOR SELECT
  USING (true);

CREATE POLICY "places_insert_admin"
  ON public.places FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "places_update_admin"
  ON public.places FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "places_delete_admin"
  ON public.places FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 4. Table: experiences
-- Bookable activities tied to a business.
--
-- NOTE on `price`: clients MAY read this column to display it on
-- listing cards.  What is forbidden is client-side CALCULATION or
-- MUTATION: prices must only be written via Server Actions, and all
-- commission and payment-amount logic must run server-side.
-- numeric(10,2) avoids floating-point rounding in financial math.
-- ------------------------------------------------------------
CREATE TABLE public.experiences (
  id               uuid           DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id      uuid           NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name             text           NOT NULL,
  description      text,
  -- Display-safe for clients; write/calculate server-side only. See note above.
  price            numeric(10,2)  NOT NULL CHECK (price >= 0),
  capacity         integer        CHECK (capacity > 0),
  duration_minutes integer        CHECK (duration_minutes > 0),
  images           text[]         NOT NULL DEFAULT '{}',
  status           text           NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','inactive')),
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);

CREATE TRIGGER experiences_set_updated_at
  BEFORE UPDATE ON public.experiences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

-- Active experiences of verified+active businesses are public.
-- Inactive experiences (and those of pending/unverified businesses)
-- are only visible to the owning business_owner and admins.
CREATE POLICY "experiences_select"
  ON public.experiences FOR SELECT
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
-- or an admin may add experiences to a business.
CREATE POLICY "experiences_insert"
  ON public.experiences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Same ownership check for updates.
CREATE POLICY "experiences_update"
  ON public.experiences FOR UPDATE
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

-- Experiences linked to past bookings should never be hard-deleted.
-- Soft-delete via status='inactive' is the preferred path.
-- Hard delete is admin-only as a last resort.
CREATE POLICY "experiences_delete_admin"
  ON public.experiences FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 5. Table: commission_config
-- Stores the configurable commission rate per service type.
-- The rate is consumed server-side only during transaction
-- creation; it must never be applied client-side.
-- One row per service_type enforced by the UNIQUE constraint.
-- ------------------------------------------------------------
CREATE TABLE public.commission_config (
  id           uuid           DEFAULT gen_random_uuid() PRIMARY KEY,
  service_type text           NOT NULL UNIQUE
                              CHECK (service_type IN ('experience','transport','business')),
  -- rate is a percentage: 0.00–100.00
  rate         numeric(5,2)   NOT NULL CHECK (rate >= 0 AND rate <= 100),
  -- tracks which admin last changed a rate for audit purposes
  updated_by   uuid           REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz    NOT NULL DEFAULT now()
);

-- updated_at is maintained by the shared trigger function.
-- There is no created_at: rows are seeded once and then updated.
CREATE TRIGGER commission_config_set_updated_at
  BEFORE UPDATE ON public.commission_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-populate updated_by with the current user on every UPDATE so the
-- audit trail is reliable without relying on callers to set it manually.
CREATE OR REPLACE FUNCTION public.set_commission_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER commission_config_set_updated_by
  BEFORE UPDATE ON public.commission_config
  FOR EACH ROW EXECUTE FUNCTION public.set_commission_updated_by();

ALTER TABLE public.commission_config ENABLE ROW LEVEL SECURITY;

-- Only admins may SELECT directly from this table.
-- All server-side code that needs a rate must call get_commission_rate()
-- (SECURITY DEFINER below), which enforces that commission logic
-- never leaks to client-side code via direct table queries.
CREATE POLICY "commission_config_select_admin"
  ON public.commission_config FOR SELECT
  USING (public.is_admin());

-- Server Actions call this function to read a commission rate without
-- granting clients direct table access.  SECURITY DEFINER + empty
-- search_path makes it safe to call from any RLS context.
-- EXECUTE is revoked from PUBLIC and granted only to service_role so
-- this function cannot be called via the Supabase RPC endpoint by clients.
CREATE OR REPLACE FUNCTION public.get_commission_rate(p_service_type text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT rate FROM public.commission_config WHERE service_type = p_service_type
$$;

REVOKE EXECUTE ON FUNCTION public.get_commission_rate(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_commission_rate(text) TO service_role;

CREATE POLICY "commission_config_insert_admin"
  ON public.commission_config FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "commission_config_update_admin"
  ON public.commission_config FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "commission_config_delete_admin"
  ON public.commission_config FOR DELETE
  USING (public.is_admin());

-- Seed default commission rates (10 % across all service types).
-- ON CONFLICT ensures this is idempotent: re-running the migration
-- will not overwrite rates that an admin has already changed.
INSERT INTO public.commission_config (service_type, rate)
VALUES
  ('experience', 10.00),
  ('transport',  10.00),
  ('business',   10.00)
ON CONFLICT (service_type) DO NOTHING;

-- ------------------------------------------------------------
-- 6. Storage bucket: business-images
-- Public bucket (images are embedded in public-facing pages).
-- File-size cap: 5 MB.  Only JPEG, PNG, and WebP are allowed
-- to prevent upload of arbitrary files under an image route.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-images',
  'business-images',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: storage.objects already has RLS enabled by
-- Supabase by default, so we only need to add policies.

-- Anyone (including unauthenticated visitors) may download images
-- because the bucket is public-facing (used in listing cards).
CREATE POLICY "business_images_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-images');

-- Only authenticated business_owners and admins may upload.
-- `owner` is explicitly checked to match auth.uid() (Supabase sets this
-- automatically, but the explicit check is a robust belt-and-suspenders guard).
CREATE POLICY "business_images_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'business-images'
    AND auth.uid() IS NOT NULL
    AND (owner = auth.uid() OR public.get_my_role() = 'admin')
    AND public.get_my_role() IN ('business_owner', 'admin')
  );

-- Only the file owner or an admin may overwrite an existing object.
-- `owner` is set automatically by Supabase to auth.uid() at INSERT time.
CREATE POLICY "business_images_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'business-images'
    AND (owner = auth.uid() OR public.get_my_role() = 'admin')
  );

-- Only the file owner or an admin may delete an object.
CREATE POLICY "business_images_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'business-images'
    AND (owner = auth.uid() OR public.get_my_role() = 'admin')
  );
