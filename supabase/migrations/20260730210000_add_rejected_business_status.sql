-- Add 'rejected' to businesses.status CHECK constraint.
-- Previously only 'pending', 'active', 'inactive' were allowed, which made
-- admin rejection silently fail. 'rejected' is semantically distinct from
-- 'inactive' (never approved vs. previously active and suspended).

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_status_check;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'rejected'));
