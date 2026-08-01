-- =============================================================
-- Migration: 20260801000000_create_business_category_links
-- Creates the many-to-many join table that links businesses to
-- business_categories.  A single business may carry multiple
-- category tags; a category may tag many businesses.
--
-- Depends on:
--   - public.businesses         (20260730000000)
--   - public.business_categories (20260731000000)
--   - public.is_admin()         (20260729000000)
-- =============================================================

-- ------------------------------------------------------------
-- 1. Table: business_category_links
-- No surrogate PK — the composite (business_id, category_id)
-- pair is the natural primary key and already unique by design.
--
-- ON DELETE CASCADE on business_id: when a business is hard-
-- deleted (admin-only), its category tags are removed automatically
-- so no orphaned rows remain.
--
-- ON DELETE RESTRICT on category_id: prevents an admin from
-- deleting a category that is still referenced by at least one
-- business.  The category must either be deactivated (is_active=false)
-- rather than deleted, or every business using it must be re-tagged
-- first.  This mirrors the intent of the is_active flag and avoids
-- silent data loss on the businesses side.
-- ------------------------------------------------------------
CREATE TABLE public.business_category_links (
  business_id  uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id  uuid        NOT NULL REFERENCES public.business_categories(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, category_id)
);

-- The composite PK index already covers queries that filter on
-- business_id first (most common pattern: "what categories does
-- this business have?").  This additional index covers the reverse
-- direction: "which businesses belong to this category?" — needed
-- for the category filter pills on the /negocios listing page.
CREATE INDEX business_category_links_category_id_idx
  ON public.business_category_links (category_id);

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
ALTER TABLE public.business_category_links ENABLE ROW LEVEL SECURITY;

-- SELECT: fully public.
-- Category tags are displayed on public-facing listing cards on
-- /negocios and must be readable by unauthenticated visitors.
-- The businesses table's own RLS ensures that sensitive business
-- data is not exposed; this table exposes only UUIDs and a timestamp.
CREATE POLICY "bcl_select_public"
  ON public.business_category_links FOR SELECT
  USING (true);

-- INSERT: business owner may tag their own business; admins may tag any.
--
-- The EXISTS subquery verifies ownership by joining to businesses
-- without granting the caller visibility into business rows they
-- would not otherwise see via the businesses SELECT policy.
--
-- Admins (role = 'admin') are additionally allowed here so that
-- explicit JWT-authenticated admin client calls (e.g., the admin
-- panel creating a business on behalf of an owner via approveRoleRequest)
-- work without switching to service_role.  Calls using service_role
-- bypass RLS entirely, so this policy does not affect them.
CREATE POLICY "bcl_insert"
  ON public.business_category_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- DELETE: same ownership check as INSERT.
-- Business owners change their category set by deleting the old
-- link and inserting a new one.  No UPDATE is ever needed on a
-- join table row (there are no mutable payload columns beyond
-- created_at, which is immutable).
-- Admins may remove any link — for example, when retiring a
-- category that is still tagged to a business (after re-tagging
-- the business with a replacement category).
CREATE POLICY "bcl_delete"
  ON public.business_category_links FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Note: No UPDATE policy is defined.  There are no payload columns
-- on this join table that warrant in-place mutation.  The intended
-- workflow is delete-then-insert, which is covered by the policies
-- above.  Omitting an UPDATE policy means any UPDATE attempt will
-- be denied by the implicit RLS default-deny rule.
