-- Landing page "Paquetes" showcase: lets the admin choose which packages
-- lead the home page and in what order. Both columns are display-only
-- metadata on admin-owned content — no money, no user data — so the
-- existing packages_select policy (public read of active packages) and the
-- service_role-only write posture already cover them; no RLS change needed.
--
-- Constant defaults make ADD COLUMN a metadata-only change in Postgres 11+,
-- so this does not rewrite the table.

ALTER TABLE public.packages
  ADD COLUMN is_featured boolean NOT NULL DEFAULT false,
  -- Lower values show first. Ties fall back to name in the query.
  ADD COLUMN sort_order  integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0);

-- No index: the table holds a handful of admin-curated rows and the landing
-- query reads all active ones anyway — a sequential scan is cheaper here.
