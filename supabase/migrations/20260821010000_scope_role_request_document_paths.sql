-- =============================================================
-- Closes a gap flagged by security review of the RNT compliance
-- verification feature (20260821000000_add_compliance_verification.sql):
--
-- role_requests_insert only checks `user_id = auth.uid()` — it places no
-- constraint on the *contents* of `metadata`. submitRoleRequest (the
-- Server Action) is careful to only ever store a document path under the
-- caller's own {auth.uid()}/ folder, but that's an application-level
-- guarantee, not a database one. Any authenticated user could call
-- `supabase.from('role_requests').insert(...)` directly (bypassing the
-- Server Action entirely, using their own session) with a forged
-- metadata.*_document_path — approveRoleRequest copies that value
-- verbatim and marks the row 'verified' the moment an admin clicks
-- Approve, so a forged path would silently defeat the entire compliance
-- workflow this feature exists to provide.
--
-- Fix: a CHECK constraint that requires every *_document_path key present
-- in metadata to be prefixed by the row's own user_id — enforced by
-- Postgres itself, so it holds regardless of which client calls the API.
-- Combined with the existing RLS policy (user_id must equal auth.uid()),
-- this makes it impossible to reference a path outside the caller's own
-- storage folder no matter how the row is inserted.
--
-- starts_with() is used instead of LIKE to avoid any LIKE-wildcard
-- escaping concerns (moot here since user_id is a UUID, but starts_with
-- is the more direct expression of intent regardless).
-- =============================================================

ALTER TABLE public.role_requests
  ADD CONSTRAINT role_requests_document_paths_scoped_to_user
  CHECK (
    (metadata->>'rnt_document_path' IS NULL
      OR starts_with(metadata->>'rnt_document_path', user_id::text || '/'))
    AND (metadata->>'tarjeta_profesional_document_path' IS NULL
      OR starts_with(metadata->>'tarjeta_profesional_document_path', user_id::text || '/'))
    AND (metadata->>'cooperative_document_path' IS NULL
      OR starts_with(metadata->>'cooperative_document_path', user_id::text || '/'))
    AND (metadata->>'driver_license_document_path' IS NULL
      OR starts_with(metadata->>'driver_license_document_path', user_id::text || '/'))
    AND (metadata->>'soat_document_path' IS NULL
      OR starts_with(metadata->>'soat_document_path', user_id::text || '/'))
  );
