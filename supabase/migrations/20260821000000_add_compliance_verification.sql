-- ------------------------------------------------------------
-- RNT (Registro Nacional de Turismo) compliance verification.
--
-- Written as a plain additive layer on top of the CURRENT LIVE schema,
-- not the historical migration files in this directory (which have
-- drifted — e.g. `experiences` was renamed to `services` live, and
-- several newer tables/columns exist live that predate this file).
-- Column lists for businesses/tourist_guides/transporters below were
-- confirmed directly against the live database before writing this.
--
-- Product decisions (already made, not re-litigated here):
--  * New registrations are hard-gated: admin will not approve a
--    business/guide/transporter without a reviewed compliance document.
--  * Independent moto-taxi drivers cannot legally obtain an individual
--    RNT, so they get a reduced requirement: SOAT + driver's license only.
--  * Verification is manual — an admin reviews an uploaded document and
--    flips `*_status`/`verification_status`. No automated check.
--  * Existing rows get a grace period: they keep operating, they are
--    simply marked 'pending_review' (the DEFAULT) until an admin reviews
--    them, rather than being locked out retroactively.
--
-- Deliberately NOT storing an "expired" status: expiry is computed at
-- display/query time from the `*_expiry_date`/`*_expiry` columns vs
-- now(), not stored, so there is no cron/trigger to keep in sync.
-- ------------------------------------------------------------

-- ==============================================================
-- businesses: RNT tracking
-- ==============================================================
ALTER TABLE public.businesses
  ADD COLUMN rnt_number text,
  ADD COLUMN rnt_expiry_date date,
  ADD COLUMN rnt_document_path text,
  ADD COLUMN rnt_status text NOT NULL DEFAULT 'pending_review'
    CHECK (rnt_status IN ('pending_review', 'verified', 'rejected')),
  ADD COLUMN rnt_verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN rnt_verified_at timestamptz;

COMMENT ON COLUMN public.businesses.rnt_status IS
  'Manual admin review outcome for the uploaded RNT document. '
  'Defaults to pending_review so existing rows are grandfathered in '
  '(grace period) instead of being retroactively locked out.';

-- ==============================================================
-- tourist_guides: RNT + Tarjeta Profesional tracking
-- ==============================================================
ALTER TABLE public.tourist_guides
  ADD COLUMN rnt_number text,
  ADD COLUMN rnt_expiry_date date,
  ADD COLUMN rnt_document_path text,
  ADD COLUMN tarjeta_profesional_number text,
  ADD COLUMN tarjeta_profesional_document_path text,
  ADD COLUMN verification_status text NOT NULL DEFAULT 'pending_review'
    CHECK (verification_status IN ('pending_review', 'verified', 'rejected')),
  ADD COLUMN verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN verified_at timestamptz;

-- No expiry column for Tarjeta Profesional: Colombia's Tarjeta
-- Profesional de Guía de Turismo has permanent validity and is only
-- revoked by disciplinary sanction, not a renewal date.
COMMENT ON COLUMN public.tourist_guides.tarjeta_profesional_document_path IS
  'Scanned Tarjeta Profesional de Guía de Turismo. No expiry date column '
  'on purpose: this credential does not expire, it is only revoked by '
  'disciplinary sanction (verified via legal research).';

-- ==============================================================
-- transporters: cooperative / independent tiers + documents
-- ==============================================================
ALTER TABLE public.transporters
  ADD COLUMN transport_tier text NOT NULL DEFAULT 'independent'
    CHECK (transport_tier IN ('cooperative', 'independent')),
  ADD COLUMN cooperative_name text,
  ADD COLUMN cooperative_rnt_number text,
  ADD COLUMN cooperative_habilitacion_number text,
  ADD COLUMN cooperative_document_path text,
  ADD COLUMN driver_license_number text,
  ADD COLUMN driver_license_expiry date,
  ADD COLUMN driver_license_document_path text,
  ADD COLUMN soat_expiry_date date,
  ADD COLUMN soat_document_path text,
  ADD COLUMN verification_status text NOT NULL DEFAULT 'pending_review'
    CHECK (verification_status IN ('pending_review', 'verified', 'rejected')),
  ADD COLUMN verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN verified_at timestamptz;

COMMENT ON COLUMN public.transporters.transport_tier IS
  'independent = individual moto-taxi driver, reduced requirement '
  '(SOAT + driver license only, since an individual RNT is not legally '
  'obtainable for them). cooperative = affiliated with a formal transport '
  'company (e.g. TransManaure), requires the cooperative''s own RNT + '
  'Ministerio de Transporte habilitación in addition to the driver''s own '
  'license and SOAT.';

-- Widen the live vehicle_type CHECK to add 'buseta': TransManaure (the
-- formal tourist transport cooperative operating here) runs 6-8
-- passenger busetas and 4-passenger cars, not just motorcycles.
-- Constraint name confirmed live via
--   select conname from pg_constraint where conrelid = 'public.transporters'::regclass and contype = 'c';
-- -> transporters_vehicle_type_check (do not assume this name from the
-- historical migration files, given the documented schema drift).
ALTER TABLE public.transporters
  DROP CONSTRAINT transporters_vehicle_type_check;

ALTER TABLE public.transporters
  ADD CONSTRAINT transporters_vehicle_type_check
    CHECK (vehicle_type IN ('motocarro', 'moto', 'camioneta', 'buseta', 'otro'));

-- ==============================================================
-- No RLS policy changes on businesses / tourist_guides / transporters.
--
-- Confirmed live before writing this migration:
--   1. RLS in Postgres is table-level, not column-level — a policy's
--      USING/WITH CHECK expression governs which ROWS are visible/
--      writable, and applies uniformly to every column of that row.
--      There is no mechanism in `pg_policies` to scope a policy to a
--      subset of columns.
--   2. Checked information_schema.column_privileges for `businesses`,
--      `tourist_guides`, and `transporters`: every existing column
--      carries identical SELECT/INSERT/UPDATE/REFERENCES grants for
--      `anon`/`authenticated` (Supabase's default blanket table GRANT).
--      There is no per-column REVOKE anywhere that would need to be
--      extended to these new columns.
-- Therefore the existing owner-or-admin UPDATE policies and the
-- existing SELECT policies on all three tables already cover the new
-- compliance columns with no further action needed.
-- ==============================================================

-- ==============================================================
-- Storage bucket: compliance-documents
--
-- The FIRST private bucket in this project. Every other bucket
-- (business-images, place-images, business-videos, place-videos,
-- avatars) is public:true because they hold marketing photos/videos
-- meant to be publicly viewable. This bucket holds scanned government
-- IDs, RNT certificates, SOAT policies, and professional cards —
-- documents that must never be reachable via a guessable public URL —
-- so reads must go through `createSignedUrl`, not a public CDN path.
--
-- Path convention enforced by RLS (not just app-level convention):
--   {profile_id}/{doc_type}-{timestamp}.{ext}
-- `storage.foldername(name)` splits the object path on '/' and
-- returns it as an array, so `(storage.foldername(name))[1]` is the
-- first path segment. This is the same technique used elsewhere for
-- bucket-scoped storage RLS (see the `bucket_id = '...'` pattern in
-- 20260730000000_create_businesses_places_experiences.sql and
-- 20260807000000_add_avatars_bucket.sql), extended here with a
-- folder-ownership check since documents are private per-user.
-- ==============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compliance-documents',
  'compliance-documents',
  false,
  8388608,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Only the uploading user may create an object under their own
-- {auth.uid()}/... folder. Prevents one user uploading a document
-- into another user's folder even though the bucket itself is private.
CREATE POLICY "compliance_documents_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'compliance-documents'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reads are private: the document owner can see their own uploads
-- (e.g. to confirm what they submitted), and admins can see everything
-- (to review and approve/reject). No one else — not even other
-- authenticated users — can read another user's compliance document,
-- and the bucket being public:false means there is no unauthenticated
-- CDN path at all regardless of this policy.
CREATE POLICY "compliance_documents_owner_or_admin_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'compliance-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- Updates (overwriting an existing document) are admin-only. Uploaders
-- are expected to upload a new object (new timestamp in the filename)
-- rather than overwrite, so a compliance document's content can't be
-- silently swapped after an admin has reviewed it under that path.
CREATE POLICY "compliance_documents_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'compliance-documents'
    AND public.is_admin()
  );

-- Deletes are admin-only, for the same audit-trail reason: a user
-- should not be able to remove evidence of a rejected/expired document
-- from under an admin's feet.
CREATE POLICY "compliance_documents_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'compliance-documents'
    AND public.is_admin()
  );
