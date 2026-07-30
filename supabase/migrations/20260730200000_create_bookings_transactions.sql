-- =============================================================
-- Migration: 20260730200000_create_bookings_transactions
-- Creates: bookings, transactions tables with full RLS
--   - validate_booking_business_id() trigger (integrity guard)
--   - Indexes on bookings.tourist_id, bookings.business_id
--
-- Depends on: 20260730000000_create_businesses_places_experiences
--   - public.businesses table
--   - public.experiences table
--   - public.profiles table
--   - public.is_admin()        SECURITY DEFINER helper
--   - public.set_updated_at()  trigger function
-- =============================================================

-- ------------------------------------------------------------
-- 1. Table: bookings
-- A tourist books an experience at a business.
--
-- total_amount is computed server-side at booking creation time
-- (price × people_count from the experiences table) and stored
-- here so downstream payment records have a stable reference
-- even if the experience price changes later.
--
-- business_id is intentionally denormalized from experiences to
-- allow the RLS SELECT policy to check business ownership with a
-- simple equality predicate rather than a two-hop join
-- (bookings → experiences → businesses), which would add cost to
-- every query on a high-traffic table.
-- ------------------------------------------------------------
CREATE TABLE public.bookings (
  id            uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  experience_id uuid          NOT NULL REFERENCES public.experiences(id),
  tourist_id    uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Denormalized from experiences for RLS efficiency; see note above.
  business_id   uuid          NOT NULL REFERENCES public.businesses(id),
  people_count  integer       NOT NULL CHECK (people_count > 0),
  -- CHECK prevents past-date bookings at the DB level as a second guard
  -- (Server Action validates first; this catches any future code path that skips it).
  booking_date  date          NOT NULL CHECK (booking_date >= CURRENT_DATE),
  -- price × people_count, fixed at creation time by a Server Action.
  -- numeric avoids floating-point rounding; see CLAUDE.md §money.
  total_amount  numeric(12,2) NOT NULL CHECK (total_amount > 0),
  -- pending_payment → confirmed (after successful Wompi payment)
  --                 → cancelled (by tourist or admin before capture)
  --                 → completed (experience delivered)
  -- Status transitions are server-only; no client UPDATE is ever valid.
  status        text          NOT NULL DEFAULT 'pending_payment'
                              CHECK (status IN ('pending_payment','confirmed','cancelled','completed')),
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Guard the denormalized business_id column: reject any INSERT or UPDATE
-- where business_id does not match the parent experience's business_id.
-- Prevents data-quality bugs and wrong RLS attribution (a mismatched
-- business_id could hide bookings from the correct owner or expose them
-- to the wrong one).
CREATE OR REPLACE FUNCTION public.validate_booking_business_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  expected_business_id uuid;
BEGIN
  SELECT business_id INTO expected_business_id
  FROM public.experiences
  WHERE id = NEW.experience_id;

  IF expected_business_id IS NULL THEN
    RAISE EXCEPTION 'experience % does not exist', NEW.experience_id;
  END IF;

  IF NEW.business_id IS DISTINCT FROM expected_business_id THEN
    RAISE EXCEPTION 'business_id % does not match experience % (expected %)',
      NEW.business_id, NEW.experience_id, expected_business_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_validate_business_id
  BEFORE INSERT OR UPDATE OF business_id, experience_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_business_id();

-- Indexes on the two columns used by the RLS SELECT policy and common filters.
-- PostgreSQL does not create indexes automatically for plain FK columns.
CREATE INDEX bookings_tourist_id_idx  ON public.bookings (tourist_id);
CREATE INDEX bookings_business_id_idx ON public.bookings (business_id);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Tourists see their own bookings.
-- Business owners see bookings for any of their businesses
-- (subquery hits the businesses table; business_id is indexed via FK).
-- Admins see everything.
CREATE POLICY "bookings_select"
  ON public.bookings FOR SELECT
  USING (
    tourist_id = auth.uid()
    OR business_id IN (
      SELECT id FROM public.businesses WHERE owner_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Tourists may only insert bookings where tourist_id matches their uid
-- AND the initial status is always 'pending_payment'.
-- Defense-in-depth: the Server Action uses the admin client (service_role)
-- which bypasses RLS entirely, but this policy blocks any accidental
-- direct client-SDK insert from ever landing a booking in a wrong state
-- or impersonating another tourist.
-- Note: FOR INSERT policies only evaluate WITH CHECK (USING is not
-- applicable for new-row operations); both conditions live here.
CREATE POLICY "bookings_insert"
  ON public.bookings FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND status = 'pending_payment'
  );

-- Status transitions (pending_payment → confirmed/cancelled/completed)
-- are driven exclusively by the Wompi webhook handler or a Server Action
-- running under the admin client.  No client-originated UPDATE is valid.
CREATE POLICY "bookings_update"
  ON public.bookings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Hard deletes are admin-only to preserve the audit trail.
-- Cancellation is handled by setting status='cancelled', not by deletion,
-- so that the booking row (and linked transaction) remain for records.
CREATE POLICY "bookings_delete"
  ON public.bookings FOR DELETE
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 2. Table: transactions
-- Payment records linked 1:1 with a booking.
--
-- amount_in_cents uses bigint (integer centavos) rather than
-- numeric because Wompi's API works in integer centavos and
-- integer arithmetic eliminates any risk of decimal rounding.
--
-- All four RLS policies are admin-only: transactions contain
-- sensitive Wompi references (payment IDs, redirect URLs) and
-- must never be directly readable or writable by client code.
-- Server Actions and the webhook handler use the service_role
-- client, which bypasses RLS entirely.  The policies here serve
-- as a hard backstop against any accidental anon/user key access.
-- ------------------------------------------------------------
CREATE TABLE public.transactions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- UNIQUE enforces 1:1 relationship with bookings at the DB level.
  -- Prevents a second transaction row if a payment link is re-created
  -- for the same booking (abandoned checkout / retry scenario).
  booking_id      uuid        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  -- Wompi's own transaction identifier; null until Wompi processes
  -- the payment.  UNIQUE prevents duplicate webhook deliveries from
  -- inserting two transaction rows for the same Wompi event.
  wompi_reference text        UNIQUE,
  -- Payment-link fields populated at checkout-session creation time.
  wompi_link_id   text,
  wompi_link_url  text,
  -- pending → paid    (Wompi APPROVED event)
  --         → failed  (Wompi DECLINED / ERROR event)
  --         → voided  (refunded or cancelled before capture)
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','paid','failed','voided')),
  -- Stored in integer centavos (COP) to match the Wompi API contract.
  amount_in_cents         bigint       NOT NULL CHECK (amount_in_cents > 0),
  currency                text         NOT NULL DEFAULT 'COP',
  -- Commission rate and amount are captured at creation time so that
  -- historical transactions remain auditable even after an admin changes
  -- the rate in commission_config.  Both are immutable after INSERT.
  commission_rate         numeric(5,2) NOT NULL,
  commission_amount_cents bigint       NOT NULL CHECK (commission_amount_cents >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- All four operations are restricted to admins only.
-- Clients never interact with this table directly; they read booking
-- status (on the bookings table) which the webhook updates atomically
-- alongside the transaction record via the service_role client.
CREATE POLICY "transactions_select"
  ON public.transactions FOR SELECT
  USING (public.is_admin());

CREATE POLICY "transactions_insert"
  ON public.transactions FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "transactions_update"
  ON public.transactions FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "transactions_delete"
  ON public.transactions FOR DELETE
  USING (public.is_admin());
