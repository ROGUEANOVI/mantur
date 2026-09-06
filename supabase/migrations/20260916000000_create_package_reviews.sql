-- =============================================================
-- Migration: 20260916000000_create_package_reviews
--
-- Extends the review/rating system built for guide_tours
-- (20260914000000_create_guide_tour_reviews.sql) to Paquetes — a package's
-- reputation as ManTur's own curated product, deliberately kept separate
-- from the reputation of the individual services/guide_tours bundled inside
-- it (no row here ever writes into guide_tour_reviews or a hypothetical
-- service review table). Same eligibility computation as guide_tour_reviews
-- (no 'completed' status machinery exists in this repo — see that
-- migration's own comment): a 'confirmed' booking whose booking_date has
-- already passed.
--
-- Two tables:
--   1. package_reviews — one overall/global rating + optional comment per
--      booking (one review per booking_id, not per tourist×package, same
--      reasoning as guide_tour_reviews: a legitimate repeat booking of the
--      same package can be reviewed again).
--   2. package_item_reviews — optional per-item breakdown: a tourist may
--      additionally rate individual package_items (e.g. "the waterfall
--      tour was great, the lunch was just okay") without that rating ever
--      touching the underlying service/guide_tour's own reputation.
--      package_items has NO SELECT policy at all (it carries
--      internal_cost_cents, the negotiated cost ManTur pays each provider,
--      which must never reach a tourist) — this table stores only
--      package_item_id + rating, never any cost column, so it's safe to be
--      public-select on its own.
--
-- If an admin later removes a package_item, its historical per-item ratings
-- go with it (ON DELETE CASCADE) — the item no longer exists to be rated
-- against, same trade-off already accepted elsewhere in this schema
-- (e.g. provider_payouts.recipient_id's polymorphic-reference posture).
--
-- Depends on:
--   20260903000000_create_packages (packages, package_items, bookings.package_id)
--   20260730200000_create_bookings_transactions (bookings)
--   20260729000000_create_profiles (profiles, is_admin())
--   20260914000000_create_guide_tour_reviews (direct precedent for shape/RLS)
-- =============================================================

CREATE TABLE public.package_reviews (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id   uuid        NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  -- UNIQUE: one review per booking, not per tourist/package — a legitimate
  -- repeat booking of the same package can be reviewed again.
  booking_id   uuid        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  tourist_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Overall/global rating for the package as a whole.
  rating       smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      text        CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Drives the public /paquetes/[slug] rating aggregation, computed at read
-- time by the caller rather than denormalized (same reasoning as
-- guide_tour_reviews — this app's traffic doesn't justify trigger-maintained
-- aggregate columns).
CREATE INDEX package_reviews_package_id_idx ON public.package_reviews (package_id);

ALTER TABLE public.package_reviews ENABLE ROW LEVEL SECURITY;

-- Public: reviews are a trust signal on the package's public page — no
-- sensitive data is ever stored here (no tourist name/contact info, same
-- posture as guide_tour_reviews).
CREATE POLICY "package_reviews_select"
  ON public.package_reviews FOR SELECT
  USING (true);

-- Defense-in-depth, same reasoning as guide_tour_reviews_insert: the real
-- write path (createPackageReview in src/app/(app)/mis-reservas/actions.ts)
-- uses the admin/service_role client and re-derives every one of these
-- checks itself, so this only blocks a stray direct client-SDK insert that
-- doesn't meet the real eligibility.
--
-- Uses (now() AT TIME ZONE 'America/Bogota')::date, NOT bare CURRENT_DATE —
-- same fix already applied to guide_tour_reviews_insert (CURRENT_DATE
-- resolves in the database session's timezone, UTC by default on Supabase,
-- which would disagree with the app's own bogotaDateString() for the last
-- ~5 hours of every Bogotá day).
CREATE POLICY "package_reviews_insert"
  ON public.package_reviews FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = package_reviews.booking_id
        AND tourist_id = auth.uid()
        AND package_id = package_reviews.package_id
        AND status = 'confirmed'
        AND booking_date < (now() AT TIME ZONE 'America/Bogota')::date
    )
  );

-- Status transitions (moderation) are admin-only — no self-edit in this v1,
-- same as guide_tour_reviews.
CREATE POLICY "package_reviews_update"
  ON public.package_reviews FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "package_reviews_delete"
  ON public.package_reviews FOR DELETE
  USING (public.is_admin());


-- ------------------------------------------------------------
-- package_item_reviews — optional per-item breakdown of a package_review.
-- ------------------------------------------------------------
CREATE TABLE public.package_item_reviews (
  id                 uuid     DEFAULT gen_random_uuid() PRIMARY KEY,
  package_review_id  uuid     NOT NULL REFERENCES public.package_reviews(id) ON DELETE CASCADE,
  package_item_id    uuid     NOT NULL REFERENCES public.package_items(id) ON DELETE CASCADE,
  rating             smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  -- At most one rating per item per review (a tourist rates a given item
  -- once within their own review of the package).
  UNIQUE (package_review_id, package_item_id)
);

-- Drives the per-item rating shown next to each "Qué incluye" bullet on
-- /paquetes/[slug].
CREATE INDEX package_item_reviews_item_id_idx ON public.package_item_reviews (package_item_id);

ALTER TABLE public.package_item_reviews ENABLE ROW LEVEL SECURITY;

-- Public: carries only package_item_id + rating, never internal_cost_cents
-- or any other column from package_items — safe to be public-select even
-- though package_items itself has no SELECT policy at all.
CREATE POLICY "package_item_reviews_select"
  ON public.package_item_reviews FOR SELECT
  USING (true);

-- Defense-in-depth, same posture as package_reviews_insert above: the real
-- write path re-derives this itself via the admin client. Requires the
-- caller to own the parent package_review AND that package_item_id
-- actually belongs to that review's own package — blocks a stray insert
-- from attaching an item-level rating to an item from a different package.
CREATE POLICY "package_item_reviews_insert"
  ON public.package_item_reviews FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.package_reviews pr
      WHERE pr.id = package_item_reviews.package_review_id
        AND pr.tourist_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.package_items pi
      JOIN public.package_reviews pr ON pr.id = package_item_reviews.package_review_id
      WHERE pi.id = package_item_reviews.package_item_id
        AND pi.package_id = pr.package_id
    )
  );

CREATE POLICY "package_item_reviews_update"
  ON public.package_item_reviews FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "package_item_reviews_delete"
  ON public.package_item_reviews FOR DELETE
  USING (public.is_admin());
