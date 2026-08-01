-- Replace 'beach' with 'plaza' as a valid place type.
-- Manaure does not have a beach; a central plaza is more representative.

-- Update any existing rows that used 'beach' before applying the new constraint.
UPDATE public.places SET type = 'plaza' WHERE type = 'beach';

-- Replace the CHECK constraint.
ALTER TABLE public.places DROP CONSTRAINT IF EXISTS places_type_check;
ALTER TABLE public.places
  ADD CONSTRAINT places_type_check
  CHECK (type IN ('waterfall', 'river', 'viewpoint', 'plaza', 'park', 'other'));
