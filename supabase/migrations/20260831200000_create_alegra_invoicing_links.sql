-- =============================================================
-- Migration: 20260831200000_create_alegra_invoicing_links
--
-- Foundational schema for the Alegra electronic-invoicing integration (see
-- docs/wompi-alegra-integration-plan.md §6). Adds the two link columns
-- needed to create an Alegra invoice once a Wompi payment is confirmed:
--
--   1. profile_contact_details.alegra_contact_id — caches the Alegra
--      contact id created for a tourist so repeat bookings don't
--      re-create the same contact. Lives on profile_contact_details (not
--      profiles) because profiles has a broad `USING (true)` SELECT policy
--      for authenticated users (see 20260814000000) — colocating with the
--      table that already holds owner/admin-only PII keeps that guarantee
--      intact without a new table.
--
--      Also stores alegra_contact_identification — the legal ID the cached
--      contact was matched/created for. SECURITY REVIEW FINDING: without
--      this, a cached contact id would be reused forever for a given
--      tourist_id regardless of which identification the CURRENT
--      transaction actually carries — a legitimate identification collision
--      (a typo at checkout, a shared family document number, two different
--      real people's cédulas colliding in Alegra's own data) would silently
--      and PERMANENTLY attach every future invoice for this ManTur account
--      to a different real person's Alegra contact/tax identity. Storing
--      the identification alongside the id lets the caller (see
--      src/app/api/webhooks/wompi/route.ts's syncAlegraInvoice()) re-check
--      it against the current transaction before reusing the cache, and
--      re-resolve the contact instead of blindly trusting a stale match.
--   2. transactions.alegra_invoice_id / alegra_invoice_status — links a
--      paid transaction to its Alegra invoice. transactions is already
--      admin-only RLS (service_role and admins only), so no new policy is
--      needed here.
--
-- Deliberately NOT storing a document/cédula number on our own side: the
-- tourist's legal ID (type + number) is read directly from Wompi's own
-- transaction.updated webhook payload (`billing_data.legal_id_type` /
-- `billing_data.legal_id`) at the moment a payment is confirmed — Wompi's
-- checkout already collects it for card processing, so no new form or
-- profile field is needed. See the code comment in
-- src/lib/alegra/contacts.ts for the reasoning on why this field is trusted
-- only for this narrow, low-stakes purpose (invoice metadata) and never for
-- anything security- or money-critical.
-- =============================================================

ALTER TABLE public.profile_contact_details
  ADD COLUMN alegra_contact_id             text,
  ADD COLUMN alegra_contact_identification text;

ALTER TABLE public.transactions
  ADD COLUMN alegra_invoice_id     text,
  ADD COLUMN alegra_invoice_status text
    CHECK (alegra_invoice_status IN ('pending', 'emitted', 'rejected'));
