# VayaTur — Project Status Handoff

> Update this file at the end of each session. At the start of the next session, read this file first.

---

## Completed

### Phase 1 — Auth flow (PR #1, merged ✅)
- Supabase: `profiles` table with `user_role` enum (`tourist|business_owner|transporter|admin`), `handle_new_user` trigger, `is_admin()` / `set_updated_at()` SECURITY DEFINER functions, `prevent_role_escalation` trigger
- RLS on `profiles`: SELECT and UPDATE for own row or admin; trigger handles INSERT
- Middleware: refreshes session on every request, redirects authenticated users away from /login and /signup
- Route groups: `(auth)/` for login/signup, `(app)/` for protected routes
- Server Actions (`src/app/(auth)/actions.ts`): `signIn`, `signUp` (admin client upsert with role allowlist validation), `signOut`
- Admin client (`src/lib/supabase/admin.ts`): uses `SUPABASE_SERVICE_ROLE_KEY`, server-only
- Spanish copy (`src/lib/copy/auth.ts`)
- UI: auth layout with tropical gradient, forms with shadcn/ui, role selector with cards

### Phase 1 — Auth bug fix (merged in PR #4 ✅)
- `prevent_role_escalation` now exempts `auth.uid() IS NULL` (service_role context)
- `signUp` switched from `update()` to `upsert()` with explicit error handling
- Server-side allowlist validation for `role` field before admin upsert (prevents `role=admin` self-escalation)
- `handle_new_user` and `is_admin` hardened to `SET search_path = ''`

### Phase 2 — Content schema (PR #2, merged + migration applied ✅)
- Migration: `supabase/migrations/20260730000000_create_businesses_places_experiences.sql`
- Helper functions: `get_my_role()`, `get_commission_rate()` (EXECUTE revoked from PUBLIC, service_role only), `prevent_business_status_escalation()`, `set_commission_updated_by()`
- `businesses`: owner listings, admin approval workflow (`pending → active`), self-approval blocked at INSERT and UPDATE via trigger, `type` CHECK: `resort/restaurant/farm/eatery/other`
- `places`: public read, admin-write, static tourist attractions, `type` CHECK: `waterfall/river/viewpoint/beach/park/other`
- `experiences`: `price numeric(10,2)`, display-safe for clients but write/calculate server-side only
- `commission_config`: admin-only table seeded at 10.00 for `experience/transport/business`
- Storage bucket `business-images`: public read, upload restricted to `business_owner`/`admin`

### Phase 2 — Public listing pages (PR #3, merged ✅)
- `src/app/(app)/negocios/page.tsx` — grid of verified active businesses
- `src/app/(app)/negocios/[id]/page.tsx` — detail page with experiences list; distinguishes `PGRST116` (real 404) from transient errors
- `src/app/(app)/lugares/page.tsx` — static tourist attractions list
- `src/lib/copy/businesses.ts` — `miNegocioCopy` and `businessesCopy` (type maps, UI strings)

### Phase 2 — Business owner panel (PR #4, merged ✅)
- `src/app/(app)/mi-negocio/layout.tsx` — role guard, redirects non-`business_owner` to `/`
- `src/app/(app)/mi-negocio/page.tsx` — business overview with status badge; shows `CreateBusinessForm` if no business yet
- `src/app/(app)/mi-negocio/experiencias/page.tsx` — experience list with toggle
- `src/app/(app)/mi-negocio/experiencias/nueva/page.tsx` — create experience form
- `src/app/(app)/mi-negocio/actions.ts` — Server Actions: `createBusiness`, `updateBusiness`, `createExperience`, `updateExperience`, `toggleExperienceStatus`; all guarded by `getAuthenticatedOwner()` + UUID regex + `Number.isFinite` price validation

---

## Current schema (all applied in production)

```
auth.users              → Supabase managed
profiles                → id (FK auth.users), role (user_role), full_name, avatar_url, phone
businesses              → id, owner_id (FK profiles), name, description, type, address, phone,
                          images[], verified, status, lat, lng
places                  → id, name, description, type, images[], lat, lng
experiences             → id, business_id (FK businesses), name, description, price,
                          capacity, duration_minutes, images[], status
commission_config       → id, service_type (UNIQUE), rate, updated_by, updated_at
storage: business-images bucket
```

Migrations applied:
- `supabase/migrations/20260729000000_create_profiles.sql`
- `supabase/migrations/20260730000000_create_businesses_places_experiences.sql`

---

## Stack and key configuration

| Item | Value |
|------|-------|
| Next.js | 16.2.12 (App Router) |
| React | 19.2.8 |
| Tailwind | v4.3.3 |
| shadcn/ui | v4 Vega preset (Inter font, Base UI primitives — no `asChild` prop) |
| @supabase/ssr | 0.12.4 |
| @supabase/supabase-js | 2.111.0 |
| Supabase keys | JWT legacy format (`eyJ...`) — do NOT use `sb_publishable_` format |
| Confirm email | **Disabled** in Supabase Dashboard |

Supabase project ref: `ndozquvwgvxmtabqaaba`. Keys in `.env.local` (git-ignored).

---

## Key decisions (do not re-derive)

- **Admin client** with `service_role` is used in `signUp` Server Action to upsert `role` + `full_name`; `prevent_role_escalation` allows `auth.uid() IS NULL` to let this through
- **`is_admin()`** is SECURITY DEFINER STABLE to avoid infinite RLS recursion
- **`prevent_role_escalation`** is a trigger rather than RLS WITH CHECK because RLS cannot compare `NEW.role` to `OLD.role`; exempts `auth.uid() IS NULL` (service_role)
- **`prevent_business_status_escalation`** fires on both INSERT and UPDATE — blocks non-admins from bypassing the admin approval workflow; exempts `auth.uid() IS NULL`
- **`get_commission_rate()`** EXECUTE revoked from PUBLIC, granted only to `service_role`
- **Business/place type values** are English canonical keys; Spanish labels in `src/lib/copy/businesses.ts`
- **Server Components by default**; Client Components only for interactive forms
- **`useActionState`** (React 19) for form state with Server Actions
- **`Number.isFinite()`** over `isNaN()` in `parsePrice()` — rejects `Infinity`
- **`.select('id')`** on update/toggle Server Actions to detect silent RLS blocks (0 rows updated)
- **`@base-ui/react` has no `asChild` prop** — use `<Link>` with Tailwind classes directly instead of `<Button asChild>`
- **PGRST116** = real 404 (no rows); distinguish from transient errors for proper `notFound()` vs `throw`
- **Money logic is server-only** — `price` is display-safe on client but all write/calculation in Server Actions

---

## Next session — Phase 3: Bookings + Wompi payments

### New tables needed
- `bookings`: tourist books an experience; links to `transaction`
- `transactions`: Wompi payment record (reference, status, amount)

### Booking flow
1. Tourist clicks "Reservar" on `/negocios/[id]`
2. Booking form: select date, number of people
3. Server Action: validate capacity, calculate total (`price × people`, commission server-side), create `booking` + `transaction` (status: `pending_payment`), create Wompi sandbox payment link
4. Redirect tourist to Wompi payment page
5. Wompi calls webhook `/api/webhooks/wompi` with result
6. Webhook verifies signature, updates `transaction.status` + `booking.status`
7. Tourist lands on `/reservas/[id]/confirmacion`

### Pages
- `/negocios/[id]` — add "Reservar" button (already has the placeholder copy)
- `/reservas/nueva?exp=[expId]` — booking form (date + people)
- `/reservas/[bookingId]/confirmacion` — confirmation page
- `/mis-reservas` — tourist's booking history

### Wompi sandbox
- API base: `https://sandbox.wompi.co/v1`
- Env vars needed: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`
- Payment link flow (no redirect required for sandbox testing)
- Webhook endpoint: `src/app/api/webhooks/wompi/route.ts`

### Files relevant to read at session start
- `docs/handoff.md` (this file)
- `CLAUDE.md` — project rules
- `supabase/migrations/` — existing migrations
- `src/app/(app)/negocios/[id]/page.tsx` — where "Reservar" button lives
- `src/app/(auth)/actions.ts` — Server Action pattern to follow
- `src/app/(app)/mi-negocio/actions.ts` — `parsePrice`, `getAuthenticatedOwner` pattern

---

## Repository

- GitHub: https://github.com/ROGUEANOVI/vayatur
- Main branch: `main`
- PR #1: feat(auth): add login, signup and protected routes — **merged** ✅
- PR #2: feat(db): businesses, places, experiences and commission_config schema — **merged** ✅
- PR #3: feat(ui): add public listing pages for negocios and lugares — **merged** ✅
- PR #4: feat(mi-negocio): add business owner self-management panel — **merged** ✅
