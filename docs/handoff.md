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
- `src/app/(app)/mi-negocio/page.tsx` — business overview with status badge; shows `CreateBusinessForm` if no business yet; shows active bookings count
- `src/app/(app)/mi-negocio/experiencias/page.tsx` — experience list with toggle
- `src/app/(app)/mi-negocio/experiencias/nueva/page.tsx` — create experience form
- `src/app/(app)/mi-negocio/actions.ts` — Server Actions: `createBusiness`, `updateBusiness`, `createExperience`, `updateExperience`, `toggleExperienceStatus`; all guarded by `getAuthenticatedOwner()` + UUID regex + `Number.isFinite` price validation

### Phase 3 — Bookings schema (PR #5, merged + migration applied ✅)
- Migration: `supabase/migrations/20260730200000_create_bookings_transactions.sql`
- `bookings`: experience_id, tourist_id, business_id (denormalized for RLS), people_count, booking_date, total_amount, status (`pending_payment|confirmed|cancelled|completed`); `CHECK (booking_date >= CURRENT_DATE)`
- `transactions`: booking_id (UNIQUE), wompi_reference/link_id/link_url (nullable for future Wompi integration), status, amount_in_cents, currency, commission_rate, commission_amount_cents
- `validate_booking_business_id()` trigger — enforces denormalized `business_id` integrity on INSERT/UPDATE
- Indexes: `bookings_tourist_id_idx`, `bookings_business_id_idx`
- RLS bookings: tourists own rows; business owners see bookings for their experiences; admin all
- RLS transactions: admin/service_role only

### Phase 3 — Booking flow (PR #6, merged ✅)
- `src/app/(app)/reservas/actions.ts` — `createBooking` Server Action:
  - Validates `role = 'tourist'` from DB before any operation
  - Price read from DB, never from FormData — cannot be tampered
  - `booking_date` validated in Bogotá timezone (`America/Bogota`) to avoid UTC drift for evening bookings
  - Commission via `get_commission_rate('experience')` RPC (service_role only)
  - Stores `commission_rate` + `commission_amount_cents` in transaction at booking time
  - Simulated payment: booking → `confirmed`, transaction → `paid` (Wompi integration deferred)
  - Best-effort compensating DELETE on transaction failure (post-MVP: wrap in Postgres RPC for atomicity)
- `src/lib/copy/bookings.ts` — Spanish copy for all booking UI
- `src/components/reservas/BookingForm.tsx` — Client Component with `useActionState`, live total preview, native date/number inputs
- `src/app/(app)/reservas/nueva/page.tsx` — Server Component wrapper fetching experience + business name
- `src/app/(app)/reservas/[bookingId]/confirmacion/page.tsx` — status-driven confirmation page (icon + title change by status)
- `src/app/(app)/mis-reservas/page.tsx` — tourist's booking history, tappable cards linked to confirmation
- Modified `negocios/[id]/page.tsx` — "Reservar" Link on each ExperienceCard
- Modified `mi-negocio/page.tsx` — active bookings count stat card

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
bookings                → id, experience_id, tourist_id, business_id, people_count,
                          booking_date, total_amount, status, created_at, updated_at
transactions            → id, booking_id (UNIQUE), wompi_reference, wompi_link_id, wompi_link_url,
                          status, amount_in_cents, currency, commission_rate,
                          commission_amount_cents, created_at, updated_at
storage: business-images bucket
```

Migrations applied:
- `supabase/migrations/20260729000000_create_profiles.sql`
- `supabase/migrations/20260730000000_create_businesses_places_experiences.sql`
- `supabase/migrations/20260730200000_create_bookings_transactions.sql`

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
- **`useActionState`** (React 19) for form state with Server Actions; adapter wrapper `bookingFormAction(_prevState, formData)` needed for async Server Actions
- **`Number.isFinite()`** over `isNaN()` in `parsePrice()` — rejects `Infinity`
- **`.select('id')`** on update/toggle Server Actions to detect silent RLS blocks (0 rows updated)
- **`@base-ui/react` has no `asChild` prop** — use `<Link>` with Tailwind classes directly instead of `<Button asChild>`
- **PGRST116** = real 404 (no rows); distinguish from transient errors for proper `notFound()` vs `throw`
- **Money logic is server-only** — `price` is display-safe on client but all write/calculation in Server Actions
- **Bogotá timezone** for booking date validation: `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())` — avoids UTC drift after 7 pm local
- **Supabase nested join type workaround**: `.select('experiences(name, businesses(name))')` returns arrays in TS types but single objects at runtime — cast with `as unknown as Type`
- **`business_id` is denormalized** in `bookings` to avoid a JOIN through `experiences` in RLS policies for business owners
- **Commission stored at booking time** in `transactions.commission_rate` + `commission_amount_cents` — never recalculated retroactively
- **Simulated payment for MVP** — Wompi fields (`wompi_reference`, `wompi_link_id`, `wompi_link_url`) are nullable in schema so future integration requires no migration

---

## Technical debt (post-MVP)

| Priority | Item |
|----------|------|
| M-1 | Wrap `bookings` + `transactions` inserts in a Postgres RPC for atomicity — current best-effort DELETE rollback can leave orphan rows if the delete itself fails |
| L-1 | Add DB-level capacity enforcement (SELECT FOR UPDATE inside RPC) to prevent concurrent overbooking — current app-layer check is a race condition |

---

## Next session — Phase 5: Admin panel (minimum viable)

Phase 5 before Phase 4 because admin approval is needed for the marketplace to function in production (businesses stay `pending` until approved).

### Scope
1. **Business approval** — admin sees all `pending` businesses, can approve (`status → active`) or reject (`status → rejected`)
2. **Commission management** — admin can update `commission_config.rate` per `service_type`

### Route structure
- `/admin` — admin layout with role guard (redirect non-admin to `/`)
- `/admin/negocios` — list of businesses filterable by status; approve/reject actions
- `/admin/comisiones` — read + update commission rates per service type

### Files to read at session start
- `docs/handoff.md` (this file)
- `CLAUDE.md` — project rules
- `src/app/(app)/mi-negocio/actions.ts` — `getAuthenticatedOwner` pattern to follow for `getAuthenticatedAdmin`
- `src/app/(app)/mi-negocio/page.tsx` — stat card UI pattern
- `supabase/migrations/20260730000000_create_businesses_places_experiences.sql` — `prevent_business_status_escalation` trigger and `commission_config` table

### Phase 4 — Transporters (after Phase 5)
- `transporters` table (driver profile, availability status)
- `transport_requests` table (tourist requests a ride; transporter accepts/rejects)
- Public page: `/transportistas`
- Tourist flow: `/transporte/nueva` → request; `/mis-viajes` → history
- Transporter flow: `/mi-perfil-transporte` → manage availability, incoming requests

---

## Repository

- GitHub: https://github.com/ROGUEANOVI/vayatur
- Main branch: `main`
- PR #1: feat(auth): add login, signup and protected routes — **merged** ✅
- PR #2: feat(db): businesses, places, experiences and commission_config schema — **merged** ✅
- PR #3: feat(ui): add public listing pages for negocios and lugares — **merged** ✅
- PR #4: feat(mi-negocio): add business owner self-management panel — **merged** ✅
- PR #5: feat(bookings): add bookings and transactions schema with RLS — **merged** ✅
- PR #6: feat(booking-flow): add tourist booking flow — **merged** ✅
