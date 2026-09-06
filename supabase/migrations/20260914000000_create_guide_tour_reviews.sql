-- =============================================================
-- Migration: 20260914000000_create_guide_tour_reviews
--
-- Closes a long-pending item (CLAUDE.md "Tourist guide enhancements"):
-- no review/rating system exists for guide_tours. bookings.status='completed'
-- is a valid CHECK value referenced in copy/dashboards but NOTHING in this
-- repo ever assigns it (no Server Action, trigger, or RPC) — building that
-- transition machinery is out of scope here, so eligibility to review is
-- computed directly instead: a 'confirmed' booking whose booking_date has
-- already passed. Simpler, and doesn't invent infrastructure this feature
-- doesn't actually need.
--
-- One review per booking_id (not per tourist×tour), so a legitimate repeat
-- booking of the same tour can be reviewed again. No admin-facing edit for
-- the reviewer in this v1 — only public SELECT, self INSERT, admin-only
-- UPDATE/DELETE (moderation). Average/count are computed at read time by
-- the caller (see src/app/(public)/guias/[slug]/page.tsx) rather than
-- denormalized — this app's traffic doesn't justify trigger-maintained
-- aggregate columns.
--
-- Public reviews are deliberately anonymous (no tourist name exposed) —
-- no page in this app exposes a tourist's name publicly today; same
-- reasoning that moved `phone` off `profiles` into `profile_contact_details`
-- to avoid over-exposing it via joins.
--
-- Depends on:
--   20260802000000_create_tourist_guides (guide_tours)
--   20260730200000_create_bookings_transactions (bookings)
--   20260729000000_create_profiles (profiles)
-- =============================================================

CREATE TABLE public.guide_tour_reviews (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  guide_tour_id  uuid        NOT NULL REFERENCES public.guide_tours(id) ON DELETE CASCADE,
  -- UNIQUE: one review per booking, not per tourist/tour — a legitimate
  -- repeat booking of the same tour can be reviewed again.
  booking_id     uuid        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  tourist_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating         smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text        CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Drives both the public /guias/[slug] "reviews for this tour" query and the
-- rating aggregation computed there.
CREATE INDEX guide_tour_reviews_guide_tour_id_idx ON public.guide_tour_reviews (guide_tour_id);

ALTER TABLE public.guide_tour_reviews ENABLE ROW LEVEL SECURITY;

-- Public: reviews are a trust signal on the guide's public profile — no
-- sensitive data is ever stored here (no tourist name/contact info).
CREATE POLICY "guide_tour_reviews_select"
  ON public.guide_tour_reviews FOR SELECT
  USING (true);

-- Defense-in-depth, same reasoning as refund_requests_insert (see
-- 20260909000000_tighten_refund_requests_insert_check.sql): the real write
-- path (createGuideTourReview in src/app/(app)/mis-reservas/actions.ts) uses
-- the admin/service_role client and re-derives every one of these checks
-- itself, so this only blocks a stray direct client-SDK insert that doesn't
-- meet the real eligibility: the caller owns the booking, the booking is for
-- this exact guide_tour, it's 'confirmed' (never a pending/cancelled one),
-- and the tour date has actually passed.
CREATE POLICY "guide_tour_reviews_insert"
  ON public.guide_tour_reviews FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = guide_tour_reviews.booking_id
        AND tourist_id = auth.uid()
        AND guide_tour_id = guide_tour_reviews.guide_tour_id
        AND status = 'confirmed'
        AND booking_date < CURRENT_DATE
    )
  );

-- Status transitions (moderation) are admin-only — no self-edit in this v1.
CREATE POLICY "guide_tour_reviews_update"
  ON public.guide_tour_reviews FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "guide_tour_reviews_delete"
  ON public.guide_tour_reviews FOR DELETE
  USING (public.is_admin());
