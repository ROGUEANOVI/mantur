-- =============================================================
-- Migration: 20260819000000_create_favorites
-- Creates a generic favorites (wishlist) table so authenticated
-- users can save businesses or places for later.
--
-- Depends on:
--   - public.profiles (20260729000000)
-- =============================================================

-- ------------------------------------------------------------
-- 1. Entity type enum
-- Discriminator for the polymorphic entity_id column below.
-- Follows the same style as public.user_role (20260729000000).
-- ------------------------------------------------------------
CREATE TYPE public.favorite_entity_type AS ENUM (
  'business',
  'place'
);

-- ------------------------------------------------------------
-- 2. Table: favorites
--
-- entity_id intentionally has NO foreign key to businesses/places.
-- Postgres cannot express a single FK that conditionally points at
-- one of two tables based on the entity_type discriminator without
-- a trigger, and this project's convention is to keep such triggers
-- out unless they are load-bearing. businesses/places rows in this
-- app are only ever soft-deactivated (status / is_active columns),
-- never hard-deleted, so an orphaned favorite row pointing at a
-- vanished entity is not expected to occur in practice; if it ever
-- does, it is an accepted risk (the UI simply won't be able to
-- resolve the entity and can skip it) rather than something that
-- needs a cleanup trigger.
-- ------------------------------------------------------------
CREATE TABLE public.favorites (
  id          uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid                  NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type favorite_entity_type  NOT NULL,
  entity_id   uuid                  NOT NULL,
  created_at  timestamptz           NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

-- Supports both the per-listing-page batch lookup ("of these N
-- businesses/places, which ones has this user already favorited?")
-- and the /mis-favoritos page's per-type lookup ("all of this
-- user's favorited businesses" / "... places"). The UNIQUE
-- constraint above already creates a composite index on
-- (user_id, entity_type, entity_id) that satisfies queries filtering
-- on all three columns, but a narrower (user_id, entity_type) index
-- better serves the common "all favorites of one type for this user"
-- query pattern without needing entity_id in the predicate.
CREATE INDEX favorites_user_id_entity_type_idx
  ON public.favorites (user_id, entity_type);

-- ------------------------------------------------------------
-- 3. RLS
--
-- Unlike businesses/places (public-readable), favorites are
-- private per-user data — a user's wishlist should not be
-- visible to other users, including other roles. All of
-- SELECT/INSERT/DELETE are scoped strictly to auth.uid() = user_id.
-- No role check: any authenticated user, regardless of role, may
-- maintain their own favorites list.
-- ------------------------------------------------------------
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- SELECT: only the owning user can read their own favorites.
CREATE POLICY "favorites_select_own"
  ON public.favorites FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: only the owning user can add to their own favorites.
CREATE POLICY "favorites_insert_own"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- DELETE: only the owning user can remove their own favorites.
CREATE POLICY "favorites_delete_own"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Note: No UPDATE policy is defined. The app's toggle logic is
-- delete-if-exists-else-insert, never an update — there are no
-- mutable payload columns on this row (entity_type/entity_id are
-- part of the unique identity, created_at is immutable). Omitting
-- an UPDATE policy means any UPDATE attempt is denied by RLS's
-- implicit default-deny rule, matching business_category_links'
-- convention (20260801000000).
