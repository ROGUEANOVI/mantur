-- Add phone column to tourist_guides.
-- The original migration (20260802000000) was applied without this column.
-- tourist_guides rows are created exclusively via approveRoleRequest (service_role),
-- so DEFAULT '' is correct — existing rows (if any) get an empty string.
ALTER TABLE public.tourist_guides
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
