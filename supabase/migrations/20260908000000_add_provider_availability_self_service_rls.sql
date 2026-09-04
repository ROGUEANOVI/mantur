-- Fase 6 of Paquetes/Tours: lets a business owner or tourist guide manage
-- their own provider_availability rows directly, instead of relying on an
-- admin to confirm dates by WhatsApp. The table (20260903000000) already
-- carries a source='provider_self_service' value and a comment naming this
-- exact policy pair as the planned next step, modeled on
-- business_payout_accounts_insert_own/_update_own
-- (20260830000000_create_booking_transaction_rpc_and_payout_accounts.sql).
--
-- provider_id has no FK (it can point at businesses OR tourist_guides
-- depending on provider_type — see the table's own column comment), so
-- every policy branches on provider_type before resolving ownership.
-- transporter is intentionally left out: transport never participates in
-- packages (see package_items' schema comment), so there is no ownership
-- path for it and a transporter row can only ever be written by an admin.
--
-- The existing admin path (setProviderAvailability in
-- src/app/(app)/admin/paquetes/solicitudes/actions.ts) uses
-- createAdminClient() (service_role), which bypasses RLS entirely — these
-- policies are purely additive and change nothing about how the admin
-- queue already works.

CREATE POLICY "provider_availability_select_own"
  ON public.provider_availability FOR SELECT
  USING (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR public.is_admin()
  );

CREATE POLICY "provider_availability_insert_own"
  ON public.provider_availability FOR INSERT
  WITH CHECK (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR public.is_admin()
  );

CREATE POLICY "provider_availability_update_own"
  ON public.provider_availability FOR UPDATE
  USING (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR public.is_admin()
  );

-- No DELETE policy: a provider corrects a mistake by flipping status back
-- to 'available' (upsert), never by removing the row — same posture as
-- business_payout_accounts.
