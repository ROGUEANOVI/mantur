-- =============================================================
-- Booking acquisition source (docs/specs/SPEC-paquetes-tracking.md §4.2/5.1)
--
-- Where a sale came from, so ManTur can tell how much each ad channel
-- actually sold — not just how many clicks it got.
--   * Web package requests fill it from the visitor's first-touch UTMs.
--   * Manual WhatsApp sales: the admin picks it ("¿Cómo nos conoció?") and
--     can paste the campaign tag the WhatsApp message carries.
--
-- Marketing metadata only: no personal data, no money. Existing bookings
-- RLS covers the new columns (tourists already only see their own rows).
-- =============================================================

ALTER TABLE public.bookings
  ADD COLUMN acquisition_source text CHECK (acquisition_source IN (
    'meta_ads',        -- paid Meta (Facebook/Instagram) ads, incl. click-to-WhatsApp
    'google_ads',      -- paid Google Search
    'instagram',       -- organic Instagram
    'facebook',        -- organic Facebook
    'tiktok',
    'google_organic',  -- Google search / Maps, unpaid
    'referral',        -- recommended by someone
    'returning',       -- past customer
    'other'
  )),
  -- utm_campaign (e.g. mt_ventas_fullday_202611) or the source tag the
  -- WhatsApp message carried. Same safe charset the client enforces.
  ADD COLUMN acquisition_campaign text CHECK (
    char_length(acquisition_campaign) <= 150
    AND acquisition_campaign ~ '^[A-Za-z0-9_.~+:-]+$'
  );

-- Only server paths (service_role) set the channel: a tourist inserting
-- straight through the client SDK can't pre-label their own booking.
-- Recreated with every condition from 20261111100000 plus the new columns.
DROP POLICY "bookings_insert" ON public.bookings;
CREATE POLICY "bookings_insert"
  ON public.bookings FOR INSERT
  WITH CHECK (
    tourist_id = auth.uid()
    AND status = 'pending_payment'
    AND registered_by IS NULL
    AND catalog_total_amount IS NULL
    AND price_adjustment_reason IS NULL
    AND acquisition_source IS NULL
    AND acquisition_campaign IS NULL
  );
