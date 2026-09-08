-- =============================================================
-- Migration: 20260918000000_create_transporter_reviews
--
-- Extends the review/rating system built for guide_tours
-- (20260914000000_create_guide_tour_reviews.sql) and packages
-- (20260916000000_create_package_reviews.sql) to transporters.
--
-- Key difference from those two: guide_tour_reviews/package_reviews are
-- eligibility-gated on bookings.status='confirmed' (a *paid* booking), since
-- that's where a completed sale lives for those two. Transport has no live
-- payment path — createTransportBooking() (20260917000000_add_transport_
-- payments.sql) exists but is deliberately dormant (no public UI calls it).
-- The real, live completion signal for a ride is instead
-- transport_requests.status = 'completed' (set by markCompleted() in
-- src/app/(app)/mi-perfil-transporte/actions.ts), which happens today
-- regardless of whether the ride was ever paid for in-platform. Gating on
-- that instead of bookings means reviews work immediately, independent of
-- the transport-payments dormancy decision.
--
-- One review per transport_request_id (UNIQUE), not per tourist×transporter
-- — a tourist who rides with the same transporter again can review that
-- ride again too. Public SELECT (trust signal on /transportistas), no
-- tourist name exposed (same posture as guide_tour_reviews/package_reviews
-- — no page in this app exposes a tourist's name publicly).
--
-- Depends on:
--   20260801100000_create_transporters (transporters, transport_requests)
--   20260729000000_create_profiles (profiles, is_admin())
-- =============================================================

CREATE TABLE public.transporter_reviews (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  transporter_id        uuid        NOT NULL REFERENCES public.transporters(id) ON DELETE CASCADE,
  -- UNIQUE: one review per completed ride, not per tourist/transporter —
  -- a legitimate repeat ride with the same transporter can be reviewed again.
  transport_request_id  uuid        NOT NULL UNIQUE REFERENCES public.transport_requests(id) ON DELETE RESTRICT,
  tourist_id            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating                smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment               text        CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Drives the public /transportistas rating aggregation, computed at read
-- time by the caller rather than denormalized (same reasoning as
-- guide_tour_reviews/package_reviews).
CREATE INDEX transporter_reviews_transporter_id_idx ON public.transporter_reviews (transporter_id);

ALTER TABLE public.transporter_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transporter_reviews_select"
  ON public.transporter_reviews FOR SELECT
  USING (true);

-- Defense-in-depth, same posture as guide_tour_reviews_insert/
-- package_reviews_insert: the real write path (createTransporterReview in
-- src/app/(app)/transporte/actions.ts) uses the admin/service_role client
-- and re-derives every one of these checks itself, so this only blocks a
-- stray direct client-SDK insert that doesn't meet the real eligibility.
-- No Bogotá-timezone concern here (unlike booking_date elsewhere) — this
-- compares against a status already reached, not a date boundary.
CREATE POLICY "transporter_reviews_insert"
  ON public.transporter_reviews FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.transport_requests
      WHERE id = transporter_reviews.transport_request_id
        AND tourist_id = auth.uid()
        AND transporter_id = transporter_reviews.transporter_id
        AND status = 'completed'
    )
  );

-- Status transitions (moderation) are admin-only — no self-edit in this v1,
-- same as guide_tour_reviews/package_reviews.
CREATE POLICY "transporter_reviews_update"
  ON public.transporter_reviews FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "transporter_reviews_delete"
  ON public.transporter_reviews FOR DELETE
  USING (public.is_admin());
