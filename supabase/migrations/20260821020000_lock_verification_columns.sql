-- =============================================================
-- Closes a severe gap found while finishing the RNT compliance
-- verification feature: the UPDATE/INSERT RLS policies on
-- `businesses`, `transporters`, and `tourist_guides` are row-scoped
-- only ("owner_id = auth.uid() OR is_admin()") — Postgres RLS has no
-- column-level granularity, so nothing ever stopped the OWNER of a
-- row from directly calling the Supabase client SDK (their own normal
-- session, no admin privileges) and setting status/verified/
-- rnt_status/verification_status/verified_by/verified_at to whatever
-- they want, on their own row. Verified live (in a rolled-back
-- transaction) that a business owner could self-approve their own
-- business AND fabricate rnt_status = 'verified' this way — this
-- predates the RNT feature (status/verified were already forgeable)
-- but the new verification columns widen the same hole.
--
-- Fix: a BEFORE INSERT OR UPDATE trigger per table that pins these
-- columns to their safe/existing value unless the caller is the
-- service_role (Server Actions using the admin client, already gated
-- by getAuthenticatedAdmin() in application code) or an actual admin
-- profile. auth.role() reads the PostgREST JWT 'role' claim, which is
-- 'service_role' for the admin client and 'authenticated' for a normal
-- user session — distinct from auth.uid(), which is null under
-- service_role and would make is_admin() alone insufficient here.
--
-- businesses gets one extra allowance: a non-admin may move rnt_status
-- to 'pending_review' (and only that value) on UPDATE, since
-- updateBusiness legitimately resets it there when the owner uploads a
-- new RNT document — every other target value, and any attempt to set
-- rnt_verified_by/rnt_verified_at directly, is reverted.
-- =============================================================

CREATE OR REPLACE FUNCTION public.protect_business_verification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.verified := false;
    NEW.is_featured := false;
    NEW.rnt_status := 'pending_review';
    NEW.rnt_verified_by := NULL;
    NEW.rnt_verified_at := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.status := OLD.status;
    NEW.verified := OLD.verified;
    NEW.is_featured := OLD.is_featured;

    IF NEW.rnt_status IS DISTINCT FROM OLD.rnt_status THEN
      IF NEW.rnt_status = 'pending_review' THEN
        NEW.rnt_verified_by := NULL;
        NEW.rnt_verified_at := NULL;
      ELSE
        NEW.rnt_status := OLD.rnt_status;
        NEW.rnt_verified_by := OLD.rnt_verified_by;
        NEW.rnt_verified_at := OLD.rnt_verified_at;
      END IF;
    ELSE
      NEW.rnt_verified_by := OLD.rnt_verified_by;
      NEW.rnt_verified_at := OLD.rnt_verified_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_protect_verification_columns
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.protect_business_verification_columns();

-- ── transporters ─────────────────────────────────────────────────────────────
-- No owner-facing re-upload flow exists yet for transporters (unlike
-- businesses), so these three columns are fully locked for non-admins —
-- no self-downgrade allowance needed today. is_available is untouched by
-- this trigger: the driver legitimately self-toggles it from their own panel.

CREATE OR REPLACE FUNCTION public.protect_transporter_verification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending_review';
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.verification_status := OLD.verification_status;
    NEW.verified_by := OLD.verified_by;
    NEW.verified_at := OLD.verified_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transporters_protect_verification_columns
  BEFORE INSERT OR UPDATE ON public.transporters
  FOR EACH ROW EXECUTE FUNCTION public.protect_transporter_verification_columns();

-- ── tourist_guides ───────────────────────────────────────────────────────────
-- Same reasoning as transporters. is_available stays owner-toggleable.

CREATE OR REPLACE FUNCTION public.protect_guide_verification_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending_review';
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.verification_status := OLD.verification_status;
    NEW.verified_by := OLD.verified_by;
    NEW.verified_at := OLD.verified_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tourist_guides_protect_verification_columns
  BEFORE INSERT OR UPDATE ON public.tourist_guides
  FOR EACH ROW EXECUTE FUNCTION public.protect_guide_verification_columns();
