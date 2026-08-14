-- =============================================================
-- Migration: 20260814000000_move_profiles_phone_to_contact_details
--
-- Closes an RLS gap introduced by 20260801200000_profiles_authenticated_read.
--
-- That migration added:
--   CREATE POLICY "profiles_select_authenticated"
--     ON public.profiles FOR SELECT TO authenticated USING (true);
-- so PostgREST relational embeds (e.g. guide_tours(tourist_guides(profiles(
-- full_name)))) could resolve another user's profile row when joined from a
-- table whose own RLS is broader than profiles_select_own. Its comment
-- claimed this was safe because "sensitive columns (phone) are not queried
-- in the affected pages" — but RLS is row-level, not column-level. USING
-- (true) grants read access to EVERY column of EVERY profile row for any
-- authenticated user, including `phone`, regardless of what the app layer
-- chooses to SELECT. Any logged-in user could open the browser console and
-- call `supabase.from('profiles').select('phone')` directly with their own
-- (anon-key) session and read every registered user's phone number. That is
-- a real, currently exploitable gap, not a theoretical one.
--
-- Why not a column-level GRANT/REVOKE instead? PostgREST/Supabase serves
-- every authenticated caller through the SAME shared Postgres role
-- (`authenticated`) — there is no per-user Postgres role to hang a
-- "authenticated can SELECT phone only sometimes" grant off. Column
-- privileges are role-wide: they compose with RLS's row filter (a role
-- needs both column privilege AND a matching row policy to read a value),
-- but they do not know *which* row policy matched, so they cannot
-- distinguish "my own row" from "someone else's row". REVOKE (phone) FROM
-- authenticated would also block the profile owner's own /mi-perfil read of
-- their own phone. The only way to give "owner sees their own phone, nobody
-- else sees anybody's phone, and full_name/avatar_url keep working through
-- the existing profiles(...) embeds" that is actually enforced by Postgres
-- (not by an app-layer convention) is to physically move the sensitive
-- column out of the table the broad policy applies to.
--
-- This migration:
--   1. Creates profile_contact_details (1:1 with profiles) to hold `phone`,
--      with its own strict owner-or-admin RLS and no broad SELECT policy.
--   2. Backfills existing non-empty phone values out of profiles.
--   3. Drops profiles.phone — the column no longer exists to leak.
--   4. Re-creates profiles_select_authenticated with an updated comment:
--      it is now safe *by construction* (profiles has no sensitive column
--      left), not because current pages happen not to query one.
--
-- Unavoidable app-code follow-up (included in this change, not just the
-- migration): src/app/(app)/mi-perfil/page.tsx and actions.ts are the only
-- call sites that read/write profiles.phone anywhere in the app (verified
-- by grepping the whole src/ tree) — they now target
-- profile_contact_details instead. No other page selects profiles.phone,
-- and no page embeds profiles(...) expecting a phone column, so every other
-- call site (mis-reservas, mis-viajes, reservas/[id]/confirmacion,
-- mi-perfil-guia, mi-perfil-transporte) keeps working unmodified — they only
-- ever select full_name through the profiles(...) / profiles!tourist_id(...)
-- embeds, and full_name still lives on profiles.
-- =============================================================

-- ------------------------------------------------------------
-- 1. profile_contact_details — sensitive, owner/admin-only extension
-- ------------------------------------------------------------
CREATE TABLE public.profile_contact_details (
  profile_id  uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profile_contact_details_set_updated_at
  BEFORE UPDATE ON public.profile_contact_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 2. Backfill: only rows that actually had a phone set.
-- ------------------------------------------------------------
INSERT INTO public.profile_contact_details (profile_id, phone)
SELECT id, phone
FROM public.profiles
WHERE phone IS NOT NULL AND phone <> '';

-- ------------------------------------------------------------
-- 3. Drop the sensitive column from the broadly-readable table.
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN phone;

-- ------------------------------------------------------------
-- 4. RLS on profile_contact_details
-- Deliberately narrow: no `USING (true)` policy exists here, unlike
-- profiles. Only the owner or an admin may read or write a row.
-- ------------------------------------------------------------
ALTER TABLE public.profile_contact_details ENABLE ROW LEVEL SECURITY;

-- SELECT: own row, or any row if caller is admin (mirrors profiles_select_own).
CREATE POLICY "profile_contact_details_select_own"
  ON public.profile_contact_details FOR SELECT
  USING (profile_id = auth.uid() OR public.is_admin());

-- INSERT: a user creates their own contact row the first time they save a
-- phone number in /mi-perfil (there is no auto-create trigger for this
-- table, unlike profiles, since phone is optional and often left unset).
CREATE POLICY "profile_contact_details_insert_own"
  ON public.profile_contact_details FOR INSERT
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- UPDATE: own row, or any row if caller is admin.
CREATE POLICY "profile_contact_details_update_own"
  ON public.profile_contact_details FOR UPDATE
  USING  (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- DELETE: no policy → only service_role can delete directly. Cascade from
-- profiles deletion (which cascades from auth.users deletion) is handled at
-- the DB level via the FK above.

-- ------------------------------------------------------------
-- 5. Re-document profiles_select_authenticated.
-- Behavior is unchanged (still USING (true) for authenticated), but the
-- policy is dropped and re-created so its comment stops claiming safety
-- rests on "current pages don't query phone" — phone no longer exists on
-- this table, so the policy is safe by construction, enforced by the
-- schema, not by an app-layer convention.
-- ------------------------------------------------------------
-- Lets PostgREST relational embeds (e.g. tourist_guides(profiles(full_name)))
-- resolve other users' rows for authenticated callers. Safe because profiles
-- no longer holds any sensitive column — phone lives in
-- profile_contact_details, which has its own owner/admin-only RLS below.
-- Do not add a sensitive column back onto profiles without revisiting this
-- policy (or moving the new column to profile_contact_details instead).
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
