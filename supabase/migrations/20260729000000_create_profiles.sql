-- =============================================================
-- Migration: 20260729000000_create_profiles
-- Creates the profiles table (extends auth.users 1:1),
-- auto-creation trigger, updated_at trigger, role-escalation
-- guard trigger, and all RLS policies.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Role enum
-- ------------------------------------------------------------
CREATE TYPE public.user_role AS ENUM (
  'tourist',
  'business_owner',
  'transporter',
  'admin'
);

-- ------------------------------------------------------------
-- 2. Profiles table
-- ------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        user_role   NOT NULL DEFAULT 'tourist',
  full_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. updated_at trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 4. Auto-create profile row when auth.users gets a new entry
-- SECURITY DEFINER so the trigger runs as the function owner
-- (postgres role) and bypasses RLS on profiles.
-- SET search_path = public prevents search-path injection.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'tourist');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 5. Helper: is_admin()
-- SECURITY DEFINER so the function bypasses RLS when querying
-- profiles, avoiding infinite recursion in the SELECT policy.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- 6. Role-escalation guard
-- Non-admins cannot change their own role.
-- Lives in a trigger because RLS WITH CHECK cannot compare
-- NEW.role to OLD.role (it only receives the NEW row).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role <> OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'insufficient privileges to change role';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();

-- ------------------------------------------------------------
-- 7. RLS
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: own row, or any row if caller is admin
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

-- UPDATE: own row, or any row if caller is admin
-- Role changes are blocked separately by the trigger above.
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING  (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- INSERT: no policy → only service_role and SECURITY DEFINER
-- functions (handle_new_user trigger) can insert.

-- DELETE: no policy → only service_role can delete directly.
-- Cascade from auth.users deletion is handled at DB level.
