-- Place-images bucket: public read, admin-only write.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'place-images',
  'place-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "place_images_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'place-images');

CREATE POLICY "place_images_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'place-images'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "place_images_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'place-images'
    AND public.get_my_role() = 'admin'
  );

CREATE POLICY "place_images_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'place-images'
    AND public.get_my_role() = 'admin'
  );
