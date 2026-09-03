-- =============================================================
-- Migration: 20260903100000_add_package_media_buckets
--
-- Fase 2b of Paquetes/Tours (docs/wompi-alegra-integration-plan.md §7.2).
-- packages.images/videos have existed since Fase 1
-- (20260903000000_create_packages.sql) but nothing writes to them yet —
-- this adds the two Storage buckets the admin media-upload actions
-- (src/app/(app)/admin/paquetes/actions.ts) need. Same posture as
-- place-images/place-videos (public read, admin-only write — packages
-- are ManTur's own inventory, maintained by admins only, same as places):
-- copied verbatim from 20260730230000_add_place_images_bucket.sql and
-- 20260807100000_add_videos_and_video_buckets.sql §5 with place→package.
--
-- Depends on:
--   20260903000000_create_packages (packages table, images/videos columns)
--   20260730000000_create_businesses_places_experiences (public.get_my_role())
-- =============================================================

-- ------------------------------------------------------------
-- 1. Storage bucket: package-images
-- Public read, admin-only write. 5 MB limit, JPEG/PNG/WebP only.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'package-images',
  'package-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "package_images_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'package-images');

CREATE POLICY "package_images_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'package-images'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "package_images_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'package-images'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "package_images_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'package-images'
    AND public.get_my_role() = 'admin'
  );

-- ------------------------------------------------------------
-- 2. Storage bucket: package-videos
-- Public read, admin-only write. 50 MB limit, MP4/WebM/QuickTime only.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'package-videos',
  'package-videos',
  true,
  52428800,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "package_videos_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'package-videos');

CREATE POLICY "package_videos_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'package-videos'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "package_videos_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'package-videos'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "package_videos_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'package-videos'
    AND public.get_my_role() = 'admin'
  );
