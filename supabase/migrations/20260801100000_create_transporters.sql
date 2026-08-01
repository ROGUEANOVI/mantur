-- Creates transporters (driver profiles) and transport_requests tables with full RLS.
-- Transporters are auto-created on role approval via the approveRoleRequest server action.

-- ── transporters ────────────────────────────────────────────────────────────

CREATE TABLE public.transporters (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id    uuid        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_type  text        NOT NULL CHECK (vehicle_type IN ('motocarro','moto','camioneta','otro')),
  license_plate text        NOT NULL,
  phone         text        NOT NULL,
  is_available  boolean     NOT NULL DEFAULT false,
  bio           text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transporters_is_available_idx ON public.transporters (is_available);

ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;

-- Public: see available drivers. Own row: transporter sees own regardless of availability.
CREATE POLICY "transporters_select" ON public.transporters FOR SELECT
  USING (is_available = true OR profile_id = auth.uid() OR public.is_admin());

-- Inserts are service_role only (via approveRoleRequest Server Action). No user INSERT policy.

-- Transporter edits their own row; admin edits all.
CREATE POLICY "transporters_update" ON public.transporters FOR UPDATE
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "transporters_delete" ON public.transporters FOR DELETE
  USING (public.is_admin());

-- ── transport_requests ──────────────────────────────────────────────────────

CREATE TABLE public.transport_requests (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tourist_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  transporter_id     uuid        REFERENCES public.transporters(id) ON DELETE RESTRICT,
  origin             text        NOT NULL,
  destination        text        NOT NULL,
  requested_datetime timestamptz NOT NULL,
  people_count       integer     NOT NULL DEFAULT 1 CHECK (people_count > 0),
  notes              text,
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','accepted','completed','cancelled')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transport_requests_tourist_id_idx     ON public.transport_requests (tourist_id);
CREATE INDEX transport_requests_transporter_id_idx ON public.transport_requests (transporter_id);
CREATE INDEX transport_requests_status_idx         ON public.transport_requests (status);

ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;

-- Tourist sees their own. Any transporter sees all (to pick pending ones). Admin sees all.
CREATE POLICY "transport_requests_select" ON public.transport_requests FOR SELECT
  USING (
    tourist_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.transporters WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

-- Only tourists can create requests; must be pending with no transporter assigned.
CREATE POLICY "transport_requests_insert" ON public.transport_requests FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND public.get_my_role() = 'tourist'
    AND status = 'pending'
    AND transporter_id IS NULL
  );

-- Tourists can cancel their own pending requests.
CREATE POLICY "transport_requests_tourist_cancel" ON public.transport_requests FOR UPDATE
  USING (tourist_id = auth.uid() AND status = 'pending')
  WITH CHECK (status = 'cancelled');

-- Admin can update any request.
CREATE POLICY "transport_requests_admin_update" ON public.transport_requests FOR UPDATE
  USING (public.is_admin());

-- Transporter acceptance and status progression use service_role in Server Actions.

-- No hard deletes: rows are the audit trail.
CREATE POLICY "transport_requests_delete" ON public.transport_requests FOR DELETE
  USING (false);
