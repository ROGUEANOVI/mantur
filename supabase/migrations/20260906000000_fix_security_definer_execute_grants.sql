-- =============================================================
-- Migration: 20260906000000_fix_security_definer_execute_grants
--
-- CRITICAL FIX. Every SECURITY DEFINER RPC in this project that was meant
-- to be service_role-only (i.e. callable only from a Server Action via
-- createAdminClient(), never directly by a client) has, since the day it
-- was created, ALSO been directly callable by the anon and authenticated
-- Postgres roles via PostgREST — e.g. POST /rest/v1/rpc/mark_provider_
-- payout_result with the anon (publishable) key, bypassing every bit of
-- app-layer validation the calling Server Action normally does first.
--
-- Root cause: this project's Postgres instance has a database-level
-- default privilege (`ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated`, set up by Supabase's own project
-- bootstrap) that fires automatically on every `CREATE FUNCTION` in the
-- public schema — regardless of what the function's own migration does
-- afterward. Every affected migration already contains a `REVOKE EXECUTE
-- ... FROM PUBLIC` line, correctly stating the *intent* that the function
-- be locked down — but revoking from the PUBLIC pseudo-role does NOT
-- revoke a privilege that was separately granted by name to anon/
-- authenticated via that default-privilege rule. PUBLIC and a named-role
-- grant are independent ACL entries; revoking one never touches the
-- other. This was verified directly against the live project:
-- `information_schema.routine_privileges` showed EXECUTE for both anon
-- and authenticated on every one of the functions below, despite their
-- migrations' REVOKE FROM PUBLIC statements.
--
-- Confirmed NOT affected / intentionally left alone:
--   - public.is_admin(), public.get_my_role() — RLS policies across the
--     whole schema call these inside USING/WITH CHECK clauses; revoking
--     EXECUTE from authenticated would break RLS evaluation for every
--     authenticated request against every table with such a policy.
--   - public.slugify(text) — pure, side-effect-free string transform, no
--     data access, never had a REVOKE statement (its own migration never
--     intended it to be locked down).
--   - public.rls_auto_enable() — a Supabase platform DDL event-trigger
--     function (not created by any migration in this repo), only ever
--     invoked by the event trigger system itself; harmless/no-op if
--     called directly since it depends on pg_event_trigger_ddl_commands()
--     DDL-command context that doesn't exist outside a real DDL event.
--
-- Verified every legitimate call site in the app already uses
-- createAdminClient() (service_role) exclusively for every function
-- listed below (grepped the whole src/ tree) — service_role already has
-- its own explicit GRANT from each function's original migration and is
-- entirely unaffected by revoking anon/authenticated, so this fix cannot
-- break any existing app behavior.
--
-- Fix, in two parts:
--   1. Explicit `REVOKE EXECUTE ... FROM anon, authenticated` on every
--      currently-existing function whose own migration already declared
--      service_role-only intent (list below, signatures confirmed live
--      via pg_get_function_identity_arguments()).
--   2. `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM
--      anon, authenticated` for the `postgres` role in the `public`
--      schema, so this bug class cannot silently recur for a future
--      migration that adds a new service_role-only RPC and (reasonably)
--      assumes `REVOKE ... FROM PUBLIC` is sufficient, the same mistake
--      every prior migration in this project made. This only changes the
--      default applied to FUTURE `CREATE FUNCTION` calls — it does not
--      touch privileges already granted on existing functions (that's
--      part 1's job), so public.is_admin()/get_my_role()/slugify() above
--      keep exactly the access they have today. A migration that
--      deliberately wants a new function broadly callable (e.g. a future
--      RLS-internal helper) will need an explicit `GRANT EXECUTE ... TO
--      authenticated` afterward from now on, instead of relying on this
--      implicit (and dangerous) default.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Revoke from anon/authenticated on every existing service_role-only RPC
-- ------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_commission_rate(text)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.unique_slug(text, text, uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_booking_with_transaction(
  uuid, integer, date, numeric, text, bigint, text, numeric, bigint, text, uuid, uuid, uuid, uuid, text
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.apply_wompi_webhook_transaction_update(
  uuid, text, text, bigint, text, text
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enqueue_provider_payout(uuid, text, uuid, bigint)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_provider_payout_result(uuid, text, text, text)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_provider_payout_for_send(uuid, uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_provider_payout_resolved_manually(uuid, uuid, text)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_provider_payout_from_webhook(text, text, text)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_refund_percentage(numeric)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_refund_request_processed(uuid, text, uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_refund_request_for_void(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cascade_refund_to_booking(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.revert_refund_request_void_claim(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_refund_request_void_by_wompi_reference(text)
  FROM anon, authenticated;

-- Fase 4 (package pre-reserva) RPCs, added earlier in this same session
-- (20260905000000_add_package_prereserva_rpcs.sql) — already REVOKEd from
-- PUBLIC there, same gap as every function above. Included here rather
-- than amending that already-applied migration.
REVOKE EXECUTE ON FUNCTION public.create_package_prereserva(
  uuid, uuid, integer, date, numeric, text
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_package_prereserva(uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_package_booking_paid(uuid)
  FROM anon, authenticated;

-- ------------------------------------------------------------
-- 2. Close the gap for future migrations
-- ------------------------------------------------------------

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
