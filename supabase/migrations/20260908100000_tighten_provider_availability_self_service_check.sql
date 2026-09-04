-- Follow-up to 20260908000000: that migration's INSERT/UPDATE WITH CHECK
-- clauses only verified provider_type/provider_id ownership, never the
-- source/resolved_by columns. A non-admin caller could bypass the
-- application's Server Actions entirely (setBusinessAvailability/
-- setGuideAvailability always write source='provider_self_service' and
-- resolved_by=auth.uid()) and hit PostgREST directly with
-- source='admin_manual' and an arbitrary resolved_by — forging a row that
-- reads as if an admin had confirmed it, even though only their own
-- provider_id was involved. Caught by an automated push security review.
--
-- Fix: for the non-admin branch, WITH CHECK now also pins source and
-- resolved_by to the caller's own truthful values. is_admin() keeps a full
-- bypass (mirrors every other admin-authored policy in this project).
--
-- USING on UPDATE is deliberately left as ownership-only (unchanged): a
-- provider must still be able to override a date an admin previously wrote
-- 'admin_manual' for their own business/guide — the new constraint applies
-- to the row they leave *behind*, not which rows they may touch.

DROP POLICY "provider_availability_insert_own" ON public.provider_availability;
DROP POLICY "provider_availability_update_own" ON public.provider_availability;

CREATE POLICY "provider_availability_insert_own"
  ON public.provider_availability FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      (
        (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
        OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
      )
      AND source = 'provider_self_service'
      AND resolved_by = auth.uid()
    )
  );

CREATE POLICY "provider_availability_update_own"
  ON public.provider_availability FOR UPDATE
  USING (
    (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
    OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()
    OR (
      (
        (provider_type = 'business' AND provider_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
        OR (provider_type = 'guide' AND provider_id IN (SELECT id FROM public.tourist_guides WHERE profile_id = auth.uid()))
      )
      AND source = 'provider_self_service'
      AND resolved_by = auth.uid()
    )
  );
