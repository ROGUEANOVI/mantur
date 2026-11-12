-- =============================================================
-- Migration: 20261112200000_create_tourism_events
--
-- Home page "events" banner: tourism events in Manaure (festivals, fairs,
-- cultural nights...) that ManTur promotes, curated by admins from
-- /admin/eventos and rotated in a banner between the hero and the
-- packages showcase.
--
-- 1. tourism_events — admin-owned editorial content, same posture as
--    packages and places: public SELECT of active rows only, writes go
--    through createAdminClient() (service_role bypasses RLS), so no write
--    policy is needed. No user data and no money live here.
--
--    Each event carries one call to action (cta_type):
--      whatsapp — ManTur's WhatsApp with a prefilled message
--      package  — a related ManTur package (package_id)
--      external — an external https link (external_url), e.g. the
--                 municipality's official announcement
--      none     — informational only
--    package_id is ON DELETE SET NULL and deliberately NOT forced by a
--    CHECK: deleting a package must never be blocked by an event that
--    points at it. The banner falls back to WhatsApp when the linked
--    package is gone or inactive; the Server Action still requires a
--    package when the admin picks cta_type = 'package'.
--
-- 2. Storage bucket event-images — public read, admin-only write, copied
--    from 20260903100000_add_package_media_buckets.sql with
--    package→event.
--
-- Depends on:
--   20260730000000_create_businesses_places_experiences
--     places, public.get_my_role(), public.set_updated_at()
--   20260903000000_create_packages (packages)
-- =============================================================

-- ------------------------------------------------------------
-- 1. Table: tourism_events
-- ------------------------------------------------------------
CREATE TABLE public.tourism_events (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title          text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 90),
  summary        text        CHECK (char_length(summary) <= 220),
  -- Calendar dates in Colombia time. ends_on NULL = single-day event.
  starts_on      date        NOT NULL,
  ends_on        date,
  -- Free text so admins can write "Desde las 7:00 p. m." or "Todo el día".
  time_label     text        CHECK (char_length(time_label) <= 60),
  location_label text        CHECK (char_length(location_label) <= 90),
  place_id       uuid        REFERENCES public.places (id) ON DELETE SET NULL,
  image_url      text,
  cta_type       text        NOT NULL DEFAULT 'whatsapp'
                             CHECK (cta_type IN ('whatsapp', 'package', 'external', 'none')),
  package_id     uuid        REFERENCES public.packages (id) ON DELETE SET NULL,
  external_url   text        CHECK (external_url ~ '^https://'),
  is_active      boolean     NOT NULL DEFAULT true,
  -- Lower values rotate first; ties fall back to starts_on in the query.
  sort_order     integer     NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tourism_events_dates_order CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT tourism_events_external_needs_url
    CHECK (cta_type <> 'external' OR external_url IS NOT NULL)
);

CREATE TRIGGER tourism_events_set_updated_at
  BEFORE UPDATE ON public.tourism_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FK columns indexed so deleting a place/package doesn't scan this table.
CREATE INDEX tourism_events_place_id_idx   ON public.tourism_events (place_id)   WHERE place_id IS NOT NULL;
CREATE INDEX tourism_events_package_id_idx ON public.tourism_events (package_id) WHERE package_id IS NOT NULL;

ALTER TABLE public.tourism_events ENABLE ROW LEVEL SECURITY;

-- Public read (active events only) — same shape as packages_select.
CREATE POLICY "tourism_events_select"
  ON public.tourism_events FOR SELECT
  USING (is_active = true);

-- Admin write via service_role (createAdminClient bypasses RLS).

-- ------------------------------------------------------------
-- 2. Storage bucket: event-images
-- Public read, admin-only write. 5 MB limit, JPEG/PNG/WebP only.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "event_images_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

CREATE POLICY "event_images_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-images'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "event_images_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-images'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "event_images_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-images'
    AND public.get_my_role() = 'admin'
  );
