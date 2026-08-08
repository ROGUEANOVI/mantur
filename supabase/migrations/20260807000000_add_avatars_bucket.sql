-- ------------------------------------------------------------
-- Storage bucket: avatars
-- Public bucket (avatars are shown in the nav, listings, etc.).
-- File-size cap: 2 MB — avatars are small and client-compressed
-- to webp before upload, unlike the 5 MB galleries.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: storage.objects already has RLS enabled by
-- Supabase by default, so we only need to add policies.

-- Anyone (including unauthenticated visitors) may view avatars —
-- they're shown on public pages (guide profiles, reviews, etc.).
CREATE POLICY "avatars_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Only the authenticated uploader may create their own avatar object.
-- `owner` is set automatically by Supabase to auth.uid() at INSERT time.
CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND owner = auth.uid()
  );

-- Only the file owner may overwrite an existing object.
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND owner = auth.uid()
  );

-- Only the file owner may delete their own avatar object.
CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND owner = auth.uid()
  );
