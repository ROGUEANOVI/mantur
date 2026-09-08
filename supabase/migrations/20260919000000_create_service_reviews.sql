-- =============================================================
-- Migration: 20260919000000_create_service_reviews
--
-- Closes the last parity gap: guide tours (guide_tour_reviews), packages
-- (package_reviews/package_item_reviews), and transporters
-- (transporter_reviews) all have a review/rating system; business services
-- never did. Calco exacto de guide_tour_reviews
-- (20260914000000_create_guide_tour_reviews.sql), swapping guide_tour_id
-- for service_id — same eligibility computation (no bookings.status =
-- 'completed' transition exists anywhere in this repo, so "the service
-- happened" is computed directly from booking_date having already passed
-- on a 'confirmed' booking), same anonymous-review posture, same one
-- review per booking_id (not per tourist×service).
--
-- Honest caveat carried over from planning (see project memory
-- manual_operation_pivot): direct in-platform booking+payment for business
-- services has been disabled since the Phase 13 manual-ops pivot
-- (createBooking exists, nothing in the public UI calls it) — same as
-- guide tours, this table has no live path to new eligible rows until
-- service payment is reactivated. Built now for parity across all four
-- actor types, same reasoning already applied to guide_tour_reviews.
--
-- Depends on:
--   20260818100000_rename_experiences_to_services (services)
--   20260730200000_create_bookings_transactions (bookings)
--   20260729000000_create_profiles (profiles, is_admin())
--   20260914000000_create_guide_tour_reviews (direct precedent for shape/RLS)
-- =============================================================

CREATE TABLE public.service_reviews (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id     uuid        NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  -- UNIQUE: one review per booking, not per tourist/service — a legitimate
  -- repeat booking of the same service can be reviewed again.
  booking_id     uuid        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  tourist_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating         smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text        CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Drives both the public service detail page's "reviews for this service"
-- query and the rating aggregation computed there.
CREATE INDEX service_reviews_service_id_idx ON public.service_reviews (service_id);

ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;

-- Public: reviews are a trust signal on the service's public page — no
-- sensitive data is ever stored here (no tourist name/contact info).
CREATE POLICY "service_reviews_select"
  ON public.service_reviews FOR SELECT
  USING (true);

-- Defense-in-depth, same reasoning as guide_tour_reviews_insert: the real
-- write path (createServiceReview in src/app/(app)/mis-reservas/actions.ts)
-- uses the admin/service_role client and re-derives every one of these
-- checks itself, so this only blocks a stray direct client-SDK insert that
-- doesn't meet the real eligibility: the caller owns the booking, the
-- booking is for this exact service, it's 'confirmed' (never a
-- pending/cancelled one), and the service date has actually passed.
--
-- Uses (now() AT TIME ZONE 'America/Bogota')::date, NOT bare CURRENT_DATE —
-- same fix already applied to guide_tour_reviews_insert (CURRENT_DATE
-- resolves in the database session's timezone, UTC by default on Supabase,
-- which would disagree with the app's own bogotaDateString() for the last
-- ~5 hours of every Bogotá day).
CREATE POLICY "service_reviews_insert"
  ON public.service_reviews FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = service_reviews.booking_id
        AND tourist_id = auth.uid()
        AND service_id = service_reviews.service_id
        AND status = 'confirmed'
        AND booking_date < (now() AT TIME ZONE 'America/Bogota')::date
    )
  );

-- Status transitions (moderation) are admin-only — no self-edit in this v1,
-- same as guide_tour_reviews/package_reviews/transporter_reviews.
CREATE POLICY "service_reviews_update"
  ON public.service_reviews FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "service_reviews_delete"
  ON public.service_reviews FOR DELETE
  USING (public.is_admin());
