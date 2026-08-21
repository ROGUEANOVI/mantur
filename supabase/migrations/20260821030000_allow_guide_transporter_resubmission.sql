-- =============================================================
-- Phase 3 of the RNT compliance feature adds a self-service way for a
-- guide/transporter to resubmit their RNT/Tarjeta Profesional/SOAT/
-- license/cooperative documents (mi-perfil-guia/editar and the new
-- mi-perfil-transporte/editar), mirroring what businesses already got
-- in Phase 2. The verification-column triggers added in
-- 20260821020000_lock_verification_columns.sql fully locked
-- verification_status/verified_by/verified_at for transporters and
-- tourist_guides (no self-downgrade allowance, since no resubmission
-- flow existed yet) — that would silently block this legitimate
-- resubmission. Widen both triggers with the same nuanced rule already
-- used for businesses.rnt_status: a non-admin may move
-- verification_status to 'pending_review' (and only that value) on
-- UPDATE; any other target, or a direct attempt to set verified_by/
-- verified_at, is still reverted.
-- =============================================================

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
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      IF NEW.verification_status = 'pending_review' THEN
        NEW.verified_by := NULL;
        NEW.verified_at := NULL;
      ELSE
        NEW.verification_status := OLD.verification_status;
        NEW.verified_by := OLD.verified_by;
        NEW.verified_at := OLD.verified_at;
      END IF;
    ELSE
      NEW.verified_by := OLD.verified_by;
      NEW.verified_at := OLD.verified_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      IF NEW.verification_status = 'pending_review' THEN
        NEW.verified_by := NULL;
        NEW.verified_at := NULL;
      ELSE
        NEW.verification_status := OLD.verification_status;
        NEW.verified_by := OLD.verified_by;
        NEW.verified_at := OLD.verified_at;
      END IF;
    ELSE
      NEW.verified_by := OLD.verified_by;
      NEW.verified_at := OLD.verified_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
