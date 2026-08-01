-- Allow any authenticated user to read all profile rows.
--
-- The existing profiles_select_own policy (auth.uid() = id OR is_admin()) was
-- preventing PostgREST relational joins from returning other users' full_name
-- when fetching e.g. transporters(profiles(full_name)) — the join respects RLS
-- on the joined table, so only the current user's own profile row was visible.
--
-- Display info (full_name, avatar_url, role) is safe to expose to authenticated
-- users in a marketplace context. Sensitive columns (phone) are not queried in
-- the affected pages. Multiple SELECT policies are OR-ed by Postgres; this policy
-- augments, not replaces, the existing profiles_select_own policy.
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
