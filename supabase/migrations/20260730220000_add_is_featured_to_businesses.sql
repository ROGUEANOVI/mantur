-- Add featured flag to businesses.
-- Admin toggles this manually; no RLS change needed (column is on an already-public-readable table).
ALTER TABLE public.businesses
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;
