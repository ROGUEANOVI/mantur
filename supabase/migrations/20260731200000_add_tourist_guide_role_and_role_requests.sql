-- =============================================================
-- Migration: 20260731200000_add_tourist_guide_role_and_role_requests
-- 1. Adds 'tourist_guide' to the user_role enum
-- 2. Creates role_requests table with RLS
--    Users request role upgrades; admins approve or reject with feedback.
-- =============================================================

-- 1. Extend the enum — ADD VALUE is transactional in Postgres 12+
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'tourist_guide';

-- 2. Table: role_requests
-- One row per request. Rejected users may re-submit (new row each time).
-- Approved rows are kept for audit; the profile role is updated separately.
CREATE TABLE public.role_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Only non-tourist roles can be requested
  requested_role   text        NOT NULL CHECK (requested_role IN ('business_owner', 'transporter', 'tourist_guide')),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Free-text note from the applicant (optional, shown to admin)
  notes            text,
  -- Role-specific structured data — shape varies by requested_role:
  --   business_owner: { business_name, category_slug, phone }
  --   transporter:    { license_plate, vehicle_type, phone }
  --   tourist_guide:  { specialties[], languages[], experience_years, bio }
  metadata         jsonb       NOT NULL DEFAULT '{}',
  -- Populated by admin on rejection — shown to the user
  rejection_reason text,
  reviewer_id      uuid        REFERENCES public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX role_requests_user_id_idx   ON public.role_requests (user_id);
CREATE INDEX role_requests_status_idx    ON public.role_requests (status);

ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests (to track status + read rejection feedback)
CREATE POLICY "role_requests_select_own"
  ON public.role_requests FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Users can only insert requests for themselves with status = 'pending'
-- and only non-admin roles (prevents self-granting admin)
CREATE POLICY "role_requests_insert"
  ON public.role_requests FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND requested_role IN ('business_owner', 'transporter', 'tourist_guide')
  );

-- Only admins may update (to approve/reject)
CREATE POLICY "role_requests_update"
  ON public.role_requests FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No hard deletes — rows are the audit trail
CREATE POLICY "role_requests_delete"
  ON public.role_requests FOR DELETE
  USING (false);
