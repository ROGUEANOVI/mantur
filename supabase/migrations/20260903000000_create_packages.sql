-- =============================================================
-- Migration: 20260903000000_create_packages
--
-- Fase 1 of Paquetes/Tours (ManTur as its own tour operator — see
-- docs/wompi-alegra-integration-plan.md §7/§7.0/§7.1). Schema only:
-- no Server Actions, no pages, no application code exist yet against
-- these tables. `/admin/paquetes`, `/paquetes`, `/paquetes/[id]` and
-- the pre-reserva flow are future work built on top of this schema.
--
-- 1. packages — ManTur's own bookable inventory (a curated bundle of
--    services/guide tours it resells at a fixed price). Not owned by
--    any business/profile — this is the operator's own product, not
--    a listing. Public SELECT for active rows only, same posture as
--    service_types: admin writes go through createAdminClient()
--    (service_role bypasses RLS), so no write policy is needed.
--
-- 2. package_items — junction row: one provider component (a service
--    OR a guide tour, transport is excluded from Fase 1 per §7.1) of
--    a package, carrying internal_cost_cents — the direct cost ManTur
--    negotiated with that provider for their part, NOT a commission
--    percentage. This is the operator margin model: a package's
--    margin is base_price - Σ(internal_cost_cents), never a
--    commission_rate lookup. RLS is deliberately admin-only with NO
--    public SELECT at all (unlike packages): internal_cost_cents is
--    the negotiated cost ManTur pays each provider and must never
--    leak to a tourist. The future public "what's included" page
--    (§7.2, /paquetes/[id]) isn't built yet — when it is, it must
--    read through a separate view/RPC that excludes this column,
--    never this table directly.
--
-- 3. provider_availability — the two-phase pre-reserva mechanism
--    (§7.0): confirm availability with each package_item's provider
--    BEFORE charging the tourist, so a package sale never needs an
--    avoidable refund. provider_id is deliberately not a real FK
--    (same reasoning as provider_payouts.recipient_id in
--    20260830200000_create_provider_payouts_ledger.sql): provider_type
--    determines which of three different tables (businesses,
--    tourist_guides, transporters) provider_id belongs to, and one FK
--    column can't reference three parent tables. Fase 1 (built now):
--    an admin confirms with the provider by phone/WhatsApp and fills
--    this table themselves from /admin/paquetes (source defaults to
--    'admin_manual'). Fase 2 (NOT built now, no schema change needed
--    then): a provider gets a self-service calendar UI writing to
--    this same table under their own provider_id via a new RLS policy
--    (provider_availability_insert_own/_update_own, mirroring
--    business_payout_accounts_insert_own) with source =
--    'provider_self_service'. RLS here is admin-only for every
--    operation in this phase — this table is operational, never shown
--    to tourists.
--
-- 4. bookings alter — add package_id (nullable FK), widen
--    bookings_status_check to add 'pending_availability' (a package
--    pre-reserva starts here, before any payment — existing
--    service/guide-tour bookings never use this value), and widen the
--    two-way XOR (bookings_service_or_guide_tour_xor, renamed from
--    bookings_experience_or_guide_tour_xor in
--    20260818100000_rename_experiences_to_services.sql, never renamed
--    since) into a three-way "exactly one of service_id/guide_tour_id/
--    package_id" constraint — same shape as the two-way version, one
--    more disjunct. Same pattern already used once when guide_tour_id
--    was added as a second option in
--    20260802000000_create_tourist_guides.sql.
--
-- Depends on:
--   20260730200000_create_bookings_transactions
--     bookings, bookings_status_check, set_updated_at()
--   20260802000000_create_tourist_guides
--     guide_tours, the original XOR constraint
--   20260818100000_rename_experiences_to_services
--     services (renamed from experiences), the renamed XOR constraint
--   20260830200000_create_provider_payouts_ledger
--     provider_payouts.recipient_type/recipient_id — direct precedent
--     for provider_availability.provider_type/provider_id
-- =============================================================

-- ------------------------------------------------------------
-- 1. Table: packages
-- ManTur's own curated inventory, sold at a fixed base_price — not
-- computed by summing package_items' costs (that sum is the internal
-- cost side of the margin, not the sale price). No owner_id: unlike
-- businesses/services/guide_tours, a package belongs to ManTur itself
-- as the operator, not to any profile.
-- ------------------------------------------------------------
CREATE TABLE public.packages (
  id           uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text          NOT NULL,
  description  text,
  -- numeric avoids floating-point rounding for Colombian peso amounts;
  -- see CLAUDE.md §money. Fixed sale price to the tourist.
  base_price   numeric(12,2) NOT NULL CHECK (base_price >= 0),
  -- Same domain as service_types.pricing_unit — drives the total-amount
  -- formula the same way it already does for services.
  pricing_unit text          NOT NULL CHECK (pricing_unit IN ('per_person','per_night','fixed')),
  capacity     integer       CHECK (capacity > 0),
  is_active    boolean       NOT NULL DEFAULT true,
  -- Same flexible per-type extra-fields bag already used by
  -- service_types/services (e.g. itinerary details, meeting point).
  attributes   jsonb         NOT NULL DEFAULT '{}',
  images       text[]        NOT NULL DEFAULT '{}',
  videos       text[]        NOT NULL DEFAULT '{}',
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER packages_set_updated_at
  BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

-- Public read (active packages only) — same shape as service_types_select.
CREATE POLICY "packages_select"
  ON public.packages FOR SELECT
  USING (is_active = true);

-- Admin write via service_role (createAdminClient bypasses RLS).
-- No additional policy needed; service_role ignores RLS by default.
-- (Same posture as service_types — see the future /admin/paquetes,
-- modeled on /admin/categorias.)


-- ------------------------------------------------------------
-- 2. Table: package_items
-- One provider component (a service OR a guide tour) included in a
-- package. Transport is deliberately excluded from Fase 1 (§7.1).
-- ------------------------------------------------------------
CREATE TABLE public.package_items (
  id                  uuid   DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id          uuid   NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  service_id          uuid   REFERENCES public.services(id)    ON DELETE RESTRICT,
  guide_tour_id       uuid   REFERENCES public.guide_tours(id) ON DELETE RESTRICT,
  -- Exactly one of service_id/guide_tour_id — same shape as
  -- bookings_service_or_guide_tour_xor, scoped to this table.
  CONSTRAINT package_items_service_or_guide_tour_xor CHECK (
    (service_id IS NOT NULL AND guide_tour_id IS NULL)
    OR (service_id IS NULL  AND guide_tour_id IS NOT NULL)
  ),
  -- What ManTur pays the provider for their part of the package —
  -- a negotiated direct cost, NOT a commission_config percentage.
  -- bigint centavos, same unit convention as transactions.amount_in_cents.
  internal_cost_cents bigint  NOT NULL CHECK (internal_cost_cents >= 0),
  quantity_included   integer NOT NULL DEFAULT 1 CHECK (quantity_included > 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- package_id is used by the future /admin/paquetes package_items manager
-- and by the payout-fan-out logic (§7.1) that reads all items for a sold
-- package.
CREATE INDEX package_items_package_id_idx ON public.package_items (package_id);

ALTER TABLE public.package_items ENABLE ROW LEVEL SECURITY;

-- Deliberately NO SELECT policy at all — this table is admin-only
-- (service_role only), including for public/authenticated reads. Unlike
-- packages, internal_cost_cents is the cost ManTur negotiated with each
-- provider and must never be visible to the public, including via a
-- future authenticated tourist session. The public "what's included"
-- detail page (§7.2, /paquetes/[id]) isn't built yet; when it is, it
-- must read through a separate view/RPC that excludes internal_cost_cents,
-- never query this table directly. No write policy either, for the same
-- reason every other admin-owned table in this codebase has none:
-- service_role bypasses RLS by default.


-- ------------------------------------------------------------
-- 3. Table: provider_availability
-- The two-phase pre-reserva mechanism (§7.0): confirm each provider's
-- availability before charging the tourist for a package.
-- ------------------------------------------------------------
CREATE TABLE public.provider_availability (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_type text        NOT NULL CHECK (provider_type IN ('business','guide','transporter')),
  -- Intentionally not a FK: provider_type determines which of three
  -- different tables (businesses, tourist_guides, transporters)
  -- provider_id belongs to, and a single FK column can't reference
  -- three different parent tables — same precedent as
  -- provider_payouts.recipient_id (20260830200000_create_provider_payouts_ledger.sql).
  provider_id   uuid        NOT NULL,
  date          date        NOT NULL,
  -- Default 'available': a provider is assumed free until explicitly
  -- marked otherwise — a row is only written when someone confirms the
  -- provider is NOT available on that date, matching how a real booking
  -- calendar actually works (absence of a row also means available).
  status        text        NOT NULL DEFAULT 'available'
                             CHECK (status IN ('available','unavailable')),
  -- Tracks who wrote the row. Today only 'admin_manual' is ever used
  -- (Fase 1: an admin confirms by phone/WhatsApp and fills this table
  -- from /admin/paquetes). 'provider_self_service' is reserved for
  -- Fase 2 — a future provider-facing calendar UI writing to this same
  -- table under their own RLS policy — no schema change needed then.
  source        text        NOT NULL DEFAULT 'admin_manual'
                             CHECK (source IN ('admin_manual','provider_self_service')),
  -- e.g. "confirmado por WhatsApp con Doña Mary el 2/sep".
  notes         text,
  -- Which admin confirmed this row. NULL once Fase 2 self-service exists
  -- and a provider writes their own row under provider_self_service.
  resolved_by   uuid        REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- A given provider has at most one availability decision per date.
  -- Once confirmed, that date is reusable by any future package that
  -- includes the same provider — the manual work decreases over time
  -- instead of repeating per pre-reserva (§7.0).
  UNIQUE (provider_type, provider_id, date)
);

CREATE TRIGGER provider_availability_set_updated_at
  BEFORE UPDATE ON public.provider_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.provider_availability ENABLE ROW LEVEL SECURITY;

-- Admin-only, no SELECT/INSERT/UPDATE/DELETE policy for anon/authenticated
-- at all in this phase — mirrors package_items' posture above. This table
-- is purely operational (who confirmed what with which provider) and is
-- never shown to tourists; Fase 2 will add a scoped
-- provider_availability_insert_own/_update_own policy pair (mirroring
-- business_payout_accounts_insert_own) when providers get their own
-- self-service calendar, at which point source='provider_self_service'
-- rows start appearing alongside 'admin_manual' ones in the same table.


-- ------------------------------------------------------------
-- 4. Extend bookings for package pre-reservas
-- ------------------------------------------------------------

-- package_id links a booking to the package being pre-reserved.
-- ON DELETE RESTRICT: an in-progress package booking must not disappear
-- silently if a package is removed — same policy already used for
-- guide_tour_id/business_id on this table.
ALTER TABLE public.bookings
  ADD COLUMN package_id uuid REFERENCES public.packages(id) ON DELETE RESTRICT;

CREATE INDEX bookings_package_id_idx ON public.bookings (package_id);

-- Widen the original inline CHECK on bookings.status
-- (20260730200000_create_bookings_transactions.sql), which PostgreSQL
-- auto-named bookings_status_check and which has never been renamed
-- since. 'pending_availability' is the new first state of a package
-- pre-reserva's lifecycle: pending_availability -> pending_payment (all
-- package_items' providers confirm) -> confirmed, or
-- pending_availability -> cancelled (at least one provider does not
-- confirm) with no money ever having moved (§7.0). Existing service/
-- guide-tour bookings never use this new value — they still start at
-- 'pending_payment' as before.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending_availability','pending_payment','confirmed','cancelled','completed'));

-- Widen the two-way XOR (service_id XOR guide_tour_id) into a three-way
-- "exactly one of service_id/guide_tour_id/package_id" constraint.
-- bookings_service_or_guide_tour_xor started as
-- bookings_experience_or_guide_tour_xor
-- (20260802000000_create_tourist_guides.sql) and was renamed to its
-- current name in 20260818100000_rename_experiences_to_services.sql,
-- with no further rename since — confirmed by searching every later
-- migration.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_service_or_guide_tour_xor;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_service_guide_or_package_xor
  CHECK (
    (service_id IS NOT NULL AND guide_tour_id IS NULL     AND package_id IS NULL)
    OR (service_id IS NULL     AND guide_tour_id IS NOT NULL AND package_id IS NULL)
    OR (service_id IS NULL     AND guide_tour_id IS NULL     AND package_id IS NOT NULL)
  );
