-- =============================================================
-- Manual package sales (admin-registered WhatsApp deals)
--
-- Since 2026-11-11 packages sell through ManTur's WhatsApp, open to any
-- visitor — most of whom have no ManTur account. The admin registers each
-- closed (or half-closed) sale from /admin/reservas/nueva with enough
-- customer + payment data to invoice it manually in Alegra.
--
-- 1. bookings: tourist_id becomes optional (package bookings only), plus
--    catalog-vs-agreed price audit columns and registered_by.
-- 2. bookings_booking_date_check is replaced by an INSERT-only trigger.
-- 3. booking_guest_contacts: customer data for account-less sales.
-- 4. transactions: manual payment method / reference / paid_at.
-- 5. create_manual_package_sale(): atomic booking + guest + transaction.
-- 6. mark_package_booking_paid(): now records the manual payment data.
-- =============================================================

-- ------------------------------------------------------------
-- 1. bookings
-- ------------------------------------------------------------

ALTER TABLE public.bookings
  ALTER COLUMN tourist_id DROP NOT NULL;

-- Only ManTur's own package sales may lack a tourist account. Every
-- service/guide-tour/transport booking still requires one, exactly as
-- before. Existing RLS policies compare tourist_id = auth.uid(), which is
-- never true for NULL, so account-less rows stay invisible to every
-- non-service_role reader.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_tourist_or_package CHECK (tourist_id IS NOT NULL OR package_id IS NOT NULL);

ALTER TABLE public.bookings
  -- Server-computed catalog total (base_price × quantity rule) at the time
  -- of a manual sale. NULL for every booking not registered manually.
  ADD COLUMN catalog_total_amount numeric(12,2) CHECK (catalog_total_amount > 0),
  -- Why the agreed total differs from the catalog one (discount, combo...).
  ADD COLUMN price_adjustment_reason text CHECK (char_length(price_adjustment_reason) BETWEEN 3 AND 300),
  -- Admin who registered the sale by hand. NULL for tourist-created rows.
  ADD COLUMN registered_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- RLS doesn't restrict columns: without this, a tourist inserting directly
-- through the client SDK (bookings_insert) could set registered_by — forging
-- "admin-registered" provenance and skipping the past-date guard below —
-- or the price-audit columns. Only service_role paths may set them.
DROP POLICY "bookings_insert" ON public.bookings;
CREATE POLICY "bookings_insert"
  ON public.bookings FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND status = 'pending_payment'
    AND registered_by IS NULL
    AND catalog_total_amount IS NULL
    AND price_adjustment_reason IS NULL
  );

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_price_adjustment_has_reason CHECK (
    catalog_total_amount IS NULL
    OR total_amount = catalog_total_amount
    OR price_adjustment_reason IS NOT NULL
  );

-- ------------------------------------------------------------
-- 2. Past-date guard: CHECK -> BEFORE INSERT trigger
-- A CHECK using CURRENT_DATE is re-evaluated on every UPDATE of the row, so
-- any later change to a booking whose date has passed (marking it paid,
-- completed, cancelled) would fail. The original intent was only "never
-- create a booking in the past" — an INSERT-time trigger says exactly
-- that. Admin-registered sales (registered_by set) are exempt so late
-- sales can still be recorded for accounting.
-- ------------------------------------------------------------

ALTER TABLE public.bookings
  DROP CONSTRAINT bookings_booking_date_check;

CREATE OR REPLACE FUNCTION public.bookings_reject_past_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.registered_by IS NULL
     AND NEW.booking_date < (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'booking_date_in_past' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_reject_past_date
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_reject_past_date();

-- ------------------------------------------------------------
-- 3. booking_guest_contacts
-- Personal data (name, phone, ID document, email) of an account-less
-- customer. RLS enabled with NO policies: only service_role (admin Server
-- Actions via createAdminClient) can read or write — same posture as
-- package_items.
-- ------------------------------------------------------------

CREATE TABLE public.booking_guest_contacts (
  booking_id      uuid        PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  full_name       text        NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  -- Normalized Colombian mobile (10 digits, no country code) — see
  -- normalizeColombianPhone in src/lib/phone.ts.
  phone           text        NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  -- Same identification codes Alegra/DIAN use (src/lib/alegra/contacts.ts).
  document_type   text        CHECK (document_type IN ('CC', 'CE', 'NIT', 'PP')),
  document_number text        CHECK (document_number ~ '^[A-Za-z0-9-]{5,20}$'),
  email           text        CHECK (char_length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_guest_contacts_document_pair CHECK (
    (document_type IS NULL) = (document_number IS NULL)
  )
);

ALTER TABLE public.booking_guest_contacts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. transactions: manual payment data
-- Separate from payment_method_type, which holds Wompi's own value and
-- drives the refund-destination logic (mis-reservas).
-- ------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN manual_payment_method text
    CHECK (manual_payment_method IN ('bank_transfer', 'nequi_daviplata', 'cash', 'wompi_link')),
  ADD COLUMN manual_payment_reference text CHECK (char_length(manual_payment_reference) <= 100),
  ADD COLUMN paid_at timestamptz;

-- ------------------------------------------------------------
-- 5. create_manual_package_sale()
-- One function call = one DB transaction: a failure in any insert rolls
-- back the others. Amounts arrive already validated and computed by the
-- admin Server Action (createManualPackageSale) — this only enforces
-- structural invariants. No provider availability re-check: the admin
-- already confirmed it over WhatsApp before closing the sale.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_manual_package_sale(
  p_registered_by          uuid,
  p_package_id             uuid,
  p_tourist_id             uuid,
  p_guest_full_name        text,
  p_guest_phone            text,
  p_guest_document_type    text,
  p_guest_document_number  text,
  p_guest_email            text,
  p_quantity               integer,
  p_booking_date           date,
  p_catalog_total_amount   numeric,
  p_total_amount           numeric,
  p_price_adjustment_reason text,
  p_notes                  text,
  p_is_paid                boolean,
  p_payment_method         text,
  p_payment_reference      text,
  p_paid_at                timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  IF p_registered_by IS NULL THEN
    RAISE EXCEPTION 'missing_registered_by';
  END IF;

  -- Exactly one customer source: a registered tourist or guest data.
  IF (p_tourist_id IS NULL) = (p_guest_full_name IS NULL) THEN
    RAISE EXCEPTION 'missing_customer';
  END IF;

  IF p_is_paid AND (p_payment_method IS NULL OR p_paid_at IS NULL) THEN
    RAISE EXCEPTION 'missing_payment_data';
  END IF;

  INSERT INTO public.bookings (
    package_id, tourist_id, quantity, booking_date, total_amount, status, notes,
    catalog_total_amount, price_adjustment_reason, registered_by
  )
  VALUES (
    p_package_id, p_tourist_id, p_quantity, p_booking_date, p_total_amount,
    CASE WHEN p_is_paid THEN 'confirmed' ELSE 'pending_payment' END,
    p_notes, p_catalog_total_amount, p_price_adjustment_reason, p_registered_by
  )
  RETURNING id INTO v_booking_id;

  IF p_tourist_id IS NULL THEN
    INSERT INTO public.booking_guest_contacts (
      booking_id, full_name, phone, document_type, document_number, email
    )
    VALUES (
      v_booking_id, p_guest_full_name, p_guest_phone, p_guest_document_type,
      p_guest_document_number, p_guest_email
    );
  END IF;

  -- commission 0 for packages, same as confirm_package_prereserva(): ManTur
  -- sells its own inventory; its margin lives in package_items costs.
  INSERT INTO public.transactions (
    booking_id, status, amount_in_cents, currency, commission_rate, commission_amount_cents,
    manual_payment_method, manual_payment_reference, paid_at
  )
  VALUES (
    v_booking_id,
    CASE WHEN p_is_paid THEN 'paid' ELSE 'pending' END,
    round(p_total_amount * 100), 'COP', 0, 0,
    CASE WHEN p_is_paid THEN p_payment_method END,
    CASE WHEN p_is_paid THEN p_payment_reference END,
    CASE WHEN p_is_paid THEN p_paid_at END
  );

  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_package_sale(
  uuid, uuid, uuid, text, text, text, text, text, integer, date, numeric, numeric, text, text,
  boolean, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_package_sale(
  uuid, uuid, uuid, text, text, text, text, text, integer, date, numeric, numeric, text, text,
  boolean, text, text, timestamptz
) TO service_role;

-- ------------------------------------------------------------
-- 6. mark_package_booking_paid(): record manual payment data
-- Signature changes, so DROP + CREATE (CREATE OR REPLACE can't add
-- parameters). The new parameters default to NULL so the semantics for
-- any caller passing only the booking id are unchanged.
-- ------------------------------------------------------------

DROP FUNCTION public.mark_package_booking_paid(uuid);

CREATE FUNCTION public.mark_package_booking_paid(
  p_booking_id uuid,
  p_payment_method text DEFAULT NULL,
  p_payment_reference text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL
     OR v_booking.package_id IS NULL
     OR v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'invalid_booking_state';
  END IF;

  -- Only a still-pending transaction: never overwrite a row that is already
  -- paid (e.g. one settled through Wompi).
  UPDATE public.transactions
  SET status = 'paid',
      manual_payment_method = p_payment_method,
      manual_payment_reference = p_payment_reference,
      paid_at = COALESCE(p_paid_at, now())
  WHERE booking_id = p_booking_id
    AND status = 'pending';

  UPDATE public.bookings
  SET status = 'confirmed'
  WHERE id = p_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_package_booking_paid(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_package_booking_paid(uuid, text, text, timestamptz)
  TO service_role;
