# VayaTur — Project Status Handoff

> Update this file at the end of each session. At the start of the next session, read this file first.

---

## Completed

### Phase 1 — Auth flow (PR #1, merged to `main`)
- Supabase: `profiles` table with `user_role` enum, `handle_new_user` trigger, `is_admin()` SECURITY DEFINER function, `prevent_role_escalation` trigger
- RLS on `profiles`: SELECT and UPDATE for own row or admin only; no INSERT/DELETE policies (trigger handles INSERT)
- Middleware (`middleware.ts`): refreshes session on every request, redirects authenticated users from /login and /signup to /
- Route groups: `(auth)/` for login/signup, `(app)/` for protected routes
- Server Actions (`src/app/(auth)/actions.ts`): `signIn`, `signUp` (with admin client to update role), `signOut`
- Admin client (`src/lib/supabase/admin.ts`): uses `service_role`, server-only, bypasses RLS
- Spanish copy (`src/lib/copy/auth.ts`): all UI strings separated from logic
- UI: auth layout with tropical gradient, forms with shadcn/ui, role selector with cards
- Home placeholder (`(app)/page.tsx`): "Explora Manaure" + sign-out button

### Phase 2 — Content entities schema (PR #2, open — not yet applied to Supabase)
- Migration: `supabase/migrations/20260730000000_create_businesses_places_experiences.sql`
- New helper functions: `get_my_role()`, `get_commission_rate()` (SECURITY DEFINER), `prevent_business_status_escalation()`, `set_commission_updated_by()`
- `businesses`: owner-managed listings, admin approval workflow (pending → active), self-approval blocked at both INSERT and UPDATE via trigger
- `places`: public read, admin-write only — static tourist attractions
- `experiences`: price is `numeric(10,2)`, clients may display it but must never write/calculate it client-side
- `commission_config`: admin-only table; server actions read rates via `get_commission_rate()` (EXECUTE revoked from PUBLIC, granted to service_role only)
- Storage bucket `business-images`: public read, upload restricted to `business_owner`/`admin`, UPDATE/DELETE guarded by `owner = auth.uid()`

---

## Current schema (tables in production — Supabase)

```
auth.users              → Supabase managed
profiles                → id (FK auth.users), role (user_role), full_name, avatar_url, phone
```

**Pending (PR #2 must be applied first):**
```
businesses              → id, owner_id (FK profiles), name, description, type, address, phone,
                          images[], verified, status, lat, lng
places                  → id, name, description, type, images[], lat, lng
experiences             → id, business_id (FK businesses), name, description, price, capacity,
                          duration_minutes, images[], status
commission_config       → id, service_type (UNIQUE), rate, updated_by, updated_at
storage: business-images bucket
```

Migrations applied: `supabase/migrations/20260729000000_create_profiles.sql`
Pending:            `supabase/migrations/20260730000000_create_businesses_places_experiences.sql`

---

## Stack and key configuration

| Item | Value |
|------|-------|
| Next.js | 16.2.12 (App Router) |
| React | 19.2.8 |
| Tailwind | v4.3.3 |
| shadcn/ui | v4 Vega preset (Inter font, Base UI primitives) |
| @supabase/ssr | 0.12.4 |
| @supabase/supabase-js | 2.111.0 |
| Supabase keys | JWT legacy format (`eyJ...`) — do NOT use `sb_publishable_` format |
| Confirm email | **Disabled** in Supabase Dashboard (Auth → Sign In / Providers) |

Supabase project ref and actual keys are in `.env.local` (git-ignored, never commit).

---

## Key decisions (do not re-derive)

- **Admin client** with `service_role` is used in `signUp` Server Action to update `role` post-signup, because RLS blocks UPDATE on a freshly-created profile row
- **`is_admin()`** is SECURITY DEFINER STABLE to avoid infinite RLS recursion
- **`prevent_role_escalation`** is a trigger rather than RLS WITH CHECK because RLS cannot compare `NEW.role` to `OLD.role`
- **`prevent_business_status_escalation`** fires on both INSERT and UPDATE — blocks non-admins from bypassing the admin approval workflow at create time too
- **`get_commission_rate()`** has EXECUTE revoked from PUBLIC and granted only to `service_role` — clients cannot call it via Supabase RPC endpoint
- **Business/place type values** are English canonical keys (e.g. `resort`, `waterfall`); Spanish labels belong in `src/lib/copy/businesses.ts`
- **Server Components by default**; Client Components only for forms (LoginForm, SignupForm)
- **`useActionState`** (React 19) for form state with Server Actions
- **Spanish copy** always in `src/lib/copy/{domain}.ts`, never hardcoded in components

---

## Next session — Phase 2: Apply migration + listing pages

**Step 0 (manual):** Apply `supabase/migrations/20260730000000_create_businesses_places_experiences.sql` in Supabase Dashboard → SQL Editor. Verify:
- Tables: businesses, places, experiences, commission_config
- Storage bucket: business-images
- commission_config has 3 seeded rows at 10.00

**Branch to create:** `feat/listing-pages`

**Tasks in order:**

1. **`src/lib/copy/businesses.ts`** — Spanish labels for business types, place types, and experience fields
2. **ui-agent** — Public listing pages:
   - `src/app/(app)/negocios/page.tsx` — grid of verified active businesses
   - `src/app/(app)/negocios/[id]/page.tsx` — business detail with its experiences
   - `src/app/(app)/lugares/page.tsx` — list of tourist attractions
   - `loading.tsx` per route for skeleton states
3. **ui-agent** — `mi-negocio` panel (business_owner only):
   - `src/app/(app)/mi-negocio/layout.tsx` — role guard (redirect non-owners to /)
   - `src/app/(app)/mi-negocio/page.tsx` — business overview
   - `src/app/(app)/mi-negocio/experiencias/page.tsx` — experience CRUD list
   - `src/app/(app)/mi-negocio/experiencias/nueva/page.tsx` — create experience form
   - `src/app/(app)/mi-negocio/actions.ts` — Server Actions: createBusiness, updateBusiness, createExperience, updateExperience, toggleExperienceStatus

**Files relevant to read at session start:**
- `docs/handoff.md` (this file)
- `docs/product-spec.md` — full product specification
- `CLAUDE.md` — project rules
- `supabase/migrations/` — existing migrations (types, functions already defined)

---

## Repository

- GitHub: https://github.com/ROGUEANOVI/vayatur
- Main branch: `main`
- PR #1: feat(auth): login, signup and protected routes — **merged** ✅
- PR #2: feat(db): businesses, places, experiences and commission_config schema — **open, pending merge + migration apply**
