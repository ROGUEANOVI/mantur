-- =============================================================
-- Structured package content + per-group price tiers
-- (docs/specs/SPEC-paquetes-tracking.md, phases 2 and 1.2)
--
-- Package pages receive paid traffic. Until now everything lived in one
-- free-text description; these columns let the detail page show a scannable
-- summary, itinerary, checklist, logistics and real group prices.
--
-- Packages are admin-owned catalog content: the existing packages_select
-- policy (public read of active packages) and the service_role-only write
-- posture cover the new columns. None of them hold personal data or money
-- movements — the tiers are published prices, not internal costs.
-- =============================================================

ALTER TABLE public.packages
  -- 1-2 sentence pitch shown under the title and on cards.
  ADD COLUMN summary text CHECK (char_length(summary) <= 280),
  -- Ordered steps or stops ("Pozo Azul — aguas cristalinas…").
  ADD COLUMN itinerary text[] NOT NULL DEFAULT '{}',
  ADD COLUMN includes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN what_to_bring text[] NOT NULL DEFAULT '{}',
  -- Free label, not a number: "1 día · 8:00 a. m. a 6:00 p. m." or
  -- "2 días / 1 noche" read better than an hours count.
  ADD COLUMN duration_label text CHECK (char_length(duration_label) <= 80),
  ADD COLUMN meeting_point text CHECK (char_length(meeting_point) <= 200),
  ADD COLUMN difficulty text CHECK (difficulty IN ('baja', 'media', 'alta')),
  ADD COLUMN min_people integer CHECK (min_people > 0),
  ADD COLUMN payment_info text CHECK (char_length(payment_info) <= 500),
  ADD COLUMN cancellation_policy text CHECK (char_length(cancellation_policy) <= 800),
  ADD CONSTRAINT packages_min_people_within_capacity CHECK (
    min_people IS NULL OR capacity IS NULL OR min_people <= capacity
  );

-- ------------------------------------------------------------
-- package_price_tiers
-- One published price per group-size range. amount_basis says whether the
-- amount is per person (Escapada: $235.000 c/u for 2) or for the whole group
-- (FullDay: $280.000 total for 2) — storing what was actually quoted avoids
-- rounding a group price into a fractional per-person one.
-- ------------------------------------------------------------

CREATE TABLE public.package_price_tiers (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   uuid          NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  min_people   integer       NOT NULL CHECK (min_people > 0),
  -- NULL = "or more".
  max_people   integer       CHECK (max_people >= min_people),
  amount       numeric(12,2) NOT NULL CHECK (amount > 0),
  amount_basis text          NOT NULL CHECK (amount_basis IN ('per_person', 'per_group')),
  created_at   timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT package_price_tiers_unique_min UNIQUE (package_id, min_people)
);

-- The unique (package_id, min_people) index already serves lookups by
-- package_id (leading column), so no extra index is needed.

ALTER TABLE public.package_price_tiers ENABLE ROW LEVEL SECURITY;

-- Public read, but only for active packages — same visibility as the
-- package itself (packages_select). Writes: service_role only (admin
-- Server Actions), no policy needed.
CREATE POLICY "package_price_tiers_select"
  ON public.package_price_tiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.packages p
      WHERE p.id = package_price_tiers.package_id
        AND p.is_active = true
    )
  );
