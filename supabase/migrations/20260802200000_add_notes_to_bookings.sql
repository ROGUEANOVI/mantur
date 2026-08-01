-- Add notes column to bookings for tourist-to-guide coordination.
-- Nullable text: only guide_tour bookings use this field in the current UI,
-- but leaving it open for experience bookings in future iterations.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS notes text;
