-- =============================================================
-- Migration: 20260807100000_add_videos_and_video_buckets
-- Adds video support alongside the existing photo support on
-- businesses, experiences, and places: a `videos text[]` column
-- on each table, plus two new Storage buckets (`business-videos`,
-- shared by businesses and experiences the same way
-- `business-images` already is, and `place-videos`) with RLS
-- policies mirroring their image-bucket counterparts.
--
-- Depends on: 20260730000000_create_businesses_places_experiences
--   - public.get_my_role() helper
--   - businesses, experiences, places tables
-- =============================================================

-- ------------------------------------------------------------
-- 1. Column: businesses.videos
-- ------------------------------------------------------------
ALTER TABLE public.businesses ADD COLUMN videos text[] NOT NULL DEFAULT '{}';

-- ------------------------------------------------------------
-- 2. Column: experiences.videos
-- ------------------------------------------------------------
ALTER TABLE public.experiences ADD COLUMN videos text[] NOT NULL DEFAULT '{}';

-- ------------------------------------------------------------
-- 3. Column: places.videos
-- ------------------------------------------------------------
ALTER TABLE public.places ADD COLUMN videos text[] NOT NULL DEFAULT '{}';

-- ------------------------------------------------------------
-- 4. Storage bucket: business-videos
-- Public bucket (videos are embedded in public-facing pages),
-- shared by both businesses and experiences records, mirroring
-- how business-images is shared today. File-size cap: 50 MB.
-- Only MP4, WebM, and QuickTime (MOV) are allowed to prevent
-- upload of arbitrary files under a video route.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-videos',
  'business-videos',
  true,
  52428800,
  ARRAY['video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: storage.objects already has RLS enabled by
-- Supabase by default, so we only need to add policies.

-- Anyone (including unauthenticated visitors) may download videos
-- because the bucket is public-facing (used in listing pages).
CREATE POLICY "business_videos_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-videos');

-- Only authenticated business_owners and admins may upload.
-- `owner` is explicitly checked to match auth.uid() (Supabase sets this
-- automatically, but the explicit check is a robust belt-and-suspenders guard).
CREATE POLICY "business_videos_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'business-videos'
    AND auth.uid() IS NOT NULL
    AND (owner = auth.uid() OR public.get_my_role() = 'admin')
    AND public.get_my_role() IN ('business_owner', 'admin')
  );

-- Only the file owner or an admin may overwrite an existing object.
-- `owner` is set automatically by Supabase to auth.uid() at INSERT time.
CREATE POLICY "business_videos_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'business-videos'
    AND (owner = auth.uid() OR public.get_my_role() = 'admin')
  );

-- Only the file owner or an admin may delete an object.
CREATE POLICY "business_videos_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'business-videos'
    AND (owner = auth.uid() OR public.get_my_role() = 'admin')
  );

-- ------------------------------------------------------------
-- 5. Storage bucket: place-videos
-- Public bucket, admin-only write (places are static informational
-- content maintained by admins, same as place-images). File-size
-- cap: 50 MB. Only MP4, WebM, and QuickTime (MOV) are allowed.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'place-videos',
  'place-videos',
  true,
  52428800,
  ARRAY['video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "place_videos_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'place-videos');

CREATE POLICY "place_videos_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'place-videos'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "place_videos_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'place-videos'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "place_videos_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'place-videos'
    AND public.get_my_role() = 'admin'
  );
