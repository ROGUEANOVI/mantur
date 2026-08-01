# ManTur — Project Status Handoff

> Update this file at the end of each session. At the start of the next session, read this file first.
> GitHub: https://github.com/ROGUEANOVI/mantur (renamed from `vayatur`)

---

## PRs history

| # | Branch | Scope | Status |
|---|--------|-------|--------|
| 1 | feat/auth-flow | Login, signup, protected routes, RLS | ✅ merged |
| 2 | feat/businesses-schema | businesses, places, experiences, commission_config | ✅ merged |
| 3 | feat/listing-pages | Public /negocios, /lugares, /negocios/[id] | ✅ merged |
| 4 | feat/mi-negocio | Business owner panel, auth bug fixes | ✅ merged |
| 5 | feat/bookings-schema | bookings + transactions schema + RLS | ✅ merged |
| 6 | feat/booking-flow | Tourist booking flow, simulated payment | ✅ merged |
| 7 | feat/admin-panel | Business approval, commission management | ✅ merged |
| 8 | feat/public-pages | Make listings publicly accessible | ✅ merged |
| 9 | feat/admin-lugares | Place CRUD in admin panel | ✅ merged |
| 10 | feat/public-landing | Landing page, nav, multi-business, admin enhancements | ✅ merged |
| 11 | feat/image-uploads | Image uploads for businesses and places, carousel, compact cards | ✅ merged |
| 12 | feat/brand-identity | ManturLogo, color tokens, footer, hero gradient | ✅ merged |
| 13 | feat/admin-ux-and-categories | Admin UX redesign + business categories | ✅ merged |
| 14 | feat/role-requests | Role request flow + signup redesign | ✅ merged |
| 15 | fix/auto-create-business-on-role-approval | Auto-create business when business_owner role approved | ✅ merged |
| 16 | feat/multi-category-businesses | Multi-category support via business_category_links join table | ✅ merged |
| 17 | feat/transporters | Transporters phase — public listing, request flow, driver panel | ✅ merged |
| 18 | feat/transporters | Post-merge fixes: RLS policy for profile names, request modal, admin layout | ✅ merged |

---

## What was done in this session (session ending ~2026-07-31)

### PR #13 — feat/admin-ux-and-categories

**DB: `business_categories` table** (`20260731000000_create_business_categories.sql`)
- Columns: `id`, `name`, `slug` (unique), `is_active`, `sort_order`, `created_at`
- RLS: public SELECT on `is_active = true`; all writes via `service_role`
- Seeded with 7 categories: Resort, Restaurante, Finca, Picada, Casa de campo, Balneario, Otro

**DB: Place type `beach` → `plaza`** (`20260731100000_replace_beach_with_plaza_place_type.sql`)
- Migrates existing `type = 'beach'` rows to `plaza`
- Replaces CHECK constraint on `places.type`
- Valid types now: `waterfall | river | viewpoint | plaza | park | other`

**`/negocios` filter pills from DB** — `business_categories` queried server-side in parallel;
slug-validated before use; `BusinessCard` receives `categoryNames: Record<string, string>` prop.

**`/admin/categorias`** — new CRUD page:
- Lists all categories ordered by `sort_order`
- `CreateCategoryForm` (Client Component, `useActionState`): single name input, slug auto-generated
  server-side via NFD normalization → lowercase → underscores
- Toggle activate/deactivate (no delete — no FK guard yet)
- `sort_order` computed as `max(sort_order) + 1` to always append at end

**Admin layout redesign**:
- `PublicNav` on top (same as public pages)
- `AdminSidebar` (`src/components/layout/AdminSidebar.tsx`): `fixed` positioned, hover-to-expand
  (`w-14` → `w-56`, `transition-[width] duration-300`), labels fade in with `delay-100`,
  grouped nav items with `border-t` dividers, `border-t` at top completes the rectangle
- Content area: `lg:ml-14` fixed — sidebar is `fixed` so content never shifts
- Mobile: horizontal scrolling tab bar with `border-b-2` active indicator

**`/admin` dashboard enriched**:
- 6 stat cards (2-col mobile, 3-col desktop): pending businesses, active businesses,
  total bookings, confirmed revenue (COP, summed from paid transactions), total lugares,
  total users
- Commission pill with inline "Editar" link
- Two-column section (stacked on mobile, side-by-side on desktop):
  - Left: up to 3 pending businesses with inline Aprobar/Rechazar forms
  - Right: last 5 bookings with experience name, tourist, amount, status badge

**`/admin/negocios` + `/admin/lugares`**:
- Both pages now have title + subtitle header pattern
- "Nuevo lugar" button: `+` icon removed

---

---

## What was done in this session (session ending ~2026-07-31, continued)

### PR #14 — feat/role-requests (open, not yet merged)

**Goal**: Remove role selection from signup. Roles are self-requested after account creation and approved by admin.

**DB migration**: `20260731200000_add_tourist_guide_role_and_role_requests.sql`
- Adds `tourist_guide` to `user_role` enum
- Creates `role_requests` table: `id, user_id, requested_role, status (pending|approved|rejected), notes, metadata (JSONB), rejection_reason, reviewer_id, reviewed_at, created_at`
- RLS: users see own requests; INSERT only with `status = 'pending'`; admins can UPDATE; no DELETE
- **NOT YET APPLIED** — must be run in Supabase SQL Editor before merge

**Signup form redesign** (`src/components/auth/SignupForm.tsx`):
- Removed role selector cards entirely
- Added confirm-password field with Eye/EyeOff toggle
- Real-time strength indicator: 4 pills (min 8 chars, uppercase, digit, special char), appear after first keystroke
- Real-time match feedback: green "✓ Las contraseñas coinciden" / red "✗ no coinciden"
- Server-side regex validation: `PASSWORD_RE = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/`
- All new signups default to `role: 'tourist'`

**`/solicitar-rol`** (new route, requires auth):
- `src/app/(app)/solicitar-rol/layout.tsx` — adds `PublicNav` (same pattern as `mis-reservas`)
- `src/app/(app)/solicitar-rol/page.tsx` — hero with Bosque→Verde gradient, ManturLogo, personalized greeting; shows pending/rejected status banners or the form; shows "Ya eres parte" if non-tourist role already assigned
- `src/app/(app)/solicitar-rol/RoleRequestForm.tsx` — two-step UX:
  - Step 1: 3 value-prop cards (business_owner, transporter, tourist_guide) with hook/value/CTA
  - Step 2: role-specific fields
    - Business owner: business_name, category_slug (from DB), phone
    - Transporter: license_plate, vehicle_type, phone
    - Tourist guide: specialties (multi-checkbox), languages (multi-checkbox), experience_years, bio
- `src/app/(app)/solicitar-rol/actions.ts` — `submitRoleRequest`: auth check, validates role, checks no existing pending, builds metadata JSONB, inserts

**`/admin/solicitudes`** (new admin route):
- `src/app/(app)/admin/solicitudes/page.tsx` — filter tabs (pending/approved/rejected), role icon (Store/Car/Compass), user name, role label, date, role-specific metadata from JSONB. Pending: Approve form + RejectForm. Rejected: shows rejection_reason.
- `src/app/(app)/admin/solicitudes/RejectForm.tsx` — Client Component; expands inline to require written rejection reason before confirming

**Admin actions** (added to `src/app/(app)/admin/actions.ts`):
- `approveRoleRequest`: marks request approved, sets `profiles.role`, cancels other pending requests from same user
- `rejectRoleRequest`: marks request rejected with `rejection_reason`

**`PublicNav`** — tourist role section shows "Únete" amber link (`text-accent`) to `/solicitar-rol`

**`AdminSidebar`** — "Solicitudes" nav item added (uses `Users` icon from Lucide)

**Copy files touched**:
- `src/lib/copy/auth.ts` — added `confirmPassword`, `passwordRules`, `passwordMismatch`, updated `weakPassword`; removed `roleLabel`/`roles` section
- `src/lib/copy/landing.ts` — added `joinMantur: 'Únete'`
- `src/lib/copy/roleRequests.ts` (new) — roleCards with hook/value/cta, form field labels, vehicle types, specialties, languages, status messages

---

---

## What was done in this session (session ending ~2026-08-01)

### PRs #17 + #18 — Phase 4 Transporters (complete)

**DB migrations applied in production:**
- `20260801100000_create_transporters.sql` — `transporters` + `transport_requests` tables, full RLS
- `20260801200000_profiles_authenticated_read.sql` — adds `profiles_select_authenticated` policy
  (`TO authenticated USING true`) so PostgREST relational joins return other users' `full_name`
  (the existing `profiles_select_own` policy only allowed reading your own row, causing all
  joined profile names to appear as null for other users)

**New pages and components:**
- `/transportistas` (public) — uses `createAdminClient` so names resolve regardless of auth state;
  "Solicitar traslado" opens a `Dialog` (shadcn/base-ui) with driver info + form inline
- `/transporte/solicitar` — standalone fallback form page (tourist-only, role guard layout)
- `/mis-viajes` — tourist transport history; shows transporter contact when status=accepted;
  transporters are redirected to `/mi-perfil-transporte` from the layout
- `/mi-perfil-transporte` — availability toggle, pending queue (atomic first-accept-wins via
  service_role UPDATE with `.eq('status','pending')` guard), accepted requests with mark-complete
- `/admin/transportes` — status filter tabs (segmented control matching solicitudes/negocios),
  shows tourist + transporter names, formatted datetime, `max-w-lg` layout aligned with other admin pages
- `AvailabilityToggle.tsx` — Client Component using `useActionState`
- `TransportRequestForm.tsx` — Client Component using `useActionState`
- `TransporterCardWithModal.tsx` — Client Component: card + Dialog trigger; redirects non-tourists to login
- `src/components/ui/dialog.tsx` — shadcn Dialog added (uses `@base-ui/react` already installed)

**`approveRoleRequest` (admin/actions.ts):** added transporter branch — reads `license_plate`,
`vehicle_type`, `phone` from `role_requests.metadata` and auto-inserts `transporters` row via
service_role (same pattern as business_owner in PR #15)

**PublicNav:** "Transportadores" in main nav; tourist gets "Mis traslados"; transporter gets "Mi panel"
**AdminSidebar:** "Transportes" item added (Car icon)

**Key decisions for transporters:**
- `transport_requests.transporter_id` is nullable — set only when a transporter accepts (first-wins)
- Transporter acceptance uses `createAdminClient()` — RLS UPDATE policy only covers own-row availability
  toggle, not cross-user claim; service_role bypasses this safely
- `profiles_select_own` is not replaced — the new authenticated policy is additive (OR semantics)
- `/transportistas` uses admin client (Server Component) — safe because it only exposes the
  `is_available = true` filtered subset with `.eq('is_available', true)` still explicit in the query
- Transport requests are general (any transporter can accept), not targeted at a specific driver;
  modal shows driver context but a note clarifies any active driver may respond

---

## Current schema (all migrations applied in production ✅ except new PR #13 ones)

```
auth.users              → Supabase managed
profiles                → id (FK auth.users), role (user_role), full_name, avatar_url, phone
businesses              → id, owner_id (FK profiles), name, description, type, address, phone,
                          images[], verified, status, is_featured, lat, lng
places                  → id, name, description, type (waterfall|river|viewpoint|plaza|park|other),
                          images[], lat, lng
experiences             → id, business_id (FK businesses), name, description, price,
                          capacity, duration_minutes, images[], status
commission_config       → id, service_type (UNIQUE), rate, updated_by, updated_at
bookings                → id, experience_id, tourist_id, business_id, people_count,
                          booking_date, total_amount, status, created_at, updated_at
transactions            → id, booking_id (UNIQUE), wompi_reference, wompi_link_id, wompi_link_url,
                          status, amount_in_cents, currency, commission_rate,
                          commission_amount_cents, created_at, updated_at
business_categories     → id, name, slug (UNIQUE), is_active, sort_order, created_at
role_requests           → id, user_id (FK profiles), requested_role, status (pending|approved|rejected),
                          notes, metadata (JSONB), rejection_reason, reviewer_id, reviewed_at, created_at
transporters            → id, profile_id (UNIQUE FK profiles), vehicle_type, license_plate, phone,
                          is_available, bio, created_at, updated_at
transport_requests      → id, tourist_id (FK profiles), transporter_id (nullable FK transporters),
                          origin, destination, requested_datetime, people_count, notes,
                          status (pending|accepted|completed|cancelled), created_at, updated_at
```

**Storage buckets**:
- `business-images` — public read, business_owner/admin write
- `place-images` — public read, admin-only write

**Migrations applied (production)**:
- `20260729000000_create_profiles.sql` ✅
- `20260730000000_create_businesses_places_experiences.sql` ✅
- `20260730200000_create_bookings_transactions.sql` ✅
- `20260730210000_add_rejected_business_status.sql` ✅
- `20260730220000_add_is_featured_to_businesses.sql` ✅
- `20260730230000_add_place_images_bucket.sql` ✅
- `20260731000000_create_business_categories.sql` ✅ (applied this session)
- `20260731100000_replace_beach_with_plaza_place_type.sql` ✅ (applied this session)
- `20260731200000_add_tourist_guide_role_and_role_requests.sql` ✅ (applied — PR #14 merged)
- `20260801000000_create_business_category_links.sql` ✅ (applied — PR #16 merged)
- `20260801100000_create_transporters.sql` ✅ (applied — PR #17 merged)
- `20260801200000_profiles_authenticated_read.sql` ✅ (applied — PR #18 merged)

---

## Stack and key configuration

| Item | Value |
|------|-------|
| Next.js | 16.2.12 (App Router) |
| React | 19.2.8 |
| Tailwind | v4.3.3 |
| shadcn/ui | v4 Vega preset (Base UI primitives — no `asChild` prop) |
| @supabase/ssr | 0.12.4 |
| @supabase/supabase-js | 2.111.0 |
| Supabase keys | JWT legacy format (`eyJ...`) — do NOT use `sb_publishable_` format |
| Confirm email | **Disabled** in Supabase Dashboard |

Supabase project ref: `ndozquvwgvxmtabqaaba`. Keys in `.env.local` (git-ignored).

---

## Key decisions (do not re-derive)

- **Admin client** with `service_role` is used in `signUp` to upsert `role` + `full_name`; `prevent_role_escalation` allows `auth.uid() IS NULL` to let this through
- **`is_admin()`** is SECURITY DEFINER STABLE to avoid infinite RLS recursion
- **`prevent_business_status_escalation`** fires on INSERT and UPDATE — blocks non-admins from bypassing approval; exempts `auth.uid() IS NULL`
- **`get_commission_rate()`** EXECUTE revoked from PUBLIC, granted only to `service_role`
- **Business/place type values** are English canonical keys; Spanish labels in copy files
- **`business_categories` has no FK from `businesses.type`** — plain text column intentionally; adding FK is post-MVP (would require migrating existing data and blocking deletes)
- **`AdminSidebar` is `fixed`** (not sticky/flex) so the content area never shifts; content uses `lg:ml-14` fixed offset matching collapsed sidebar width
- **Server Components by default**; Client Components only for interactive forms
- **`useActionState`** (React 19) for form state; adapter wrapper needed for async Server Actions
- **`Number.isFinite()`** over `isNaN()` in `parsePrice()` — rejects `Infinity`
- **`.select('id')`** on update Server Actions to detect silent RLS blocks (0 rows)
- **`@base-ui/react` has no `asChild` prop** — use `<Link>` with Tailwind classes directly
- **PGRST116** = real 404; distinguish from transient errors for `notFound()` vs `throw`
- **Money is server-only** — `price` is display-safe on client but all writes/calculations in Server Actions
- **Bogotá timezone** for booking date: `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())`
- **Nested join type workaround**: `.select('experiences(businesses(name))')` returns arrays in TS types but single objects at runtime — cast with `as unknown as Type`
- **Image upload pattern**: Server Action verifies ownership/role → uploads via admin client → updates `images text[]`; `ImageManager` compresses to WebP client-side first
- **`business_id` denormalized** in `bookings` to avoid JOIN in RLS for business owners
- **Commission stored at booking time** — never recalculated retroactively
- **Simulated payment** — Wompi fields nullable in schema, no migration needed for real integration
- **ManturLogo clipPath** — `id="mt-pin-clip"` is safe since the component renders once per page
- **Lucide icons cannot be passed as props from Server→Client** — define `NAV_ITEMS` with Icon refs inside the Client Component (`AdminSidebar.tsx`), not in the Server layout

---

## Technical debt (post-MVP)

| Priority | Item |
|----------|------|
| M-1 | Wrap `bookings` + `transactions` inserts in a Postgres RPC for atomicity |
| M-2 | Add FK from `businesses.type` to `business_categories.slug` + migrate existing data |
| L-1 | Add DB-level capacity enforcement (SELECT FOR UPDATE) to prevent overbooking race condition |
| L-2 | Add PWA `manifest.json` with ManTur pin icon for home screen install |
| L-3 | Add Open Graph meta tags per page (og:image, og:title) for WhatsApp sharing |

---

## Next session — ordered by priority

### 1. Experience image uploads (new branch: `feat/experience-images`)
- Add `/mi-negocio/[id]/experiencias/[expId]/editar` page
- Reuse `ImageManager` + `uploadBusinessImage` pattern targeting `experiences.images[]`

### 2. Update Supabase Auth redirect URLs for mantur.co
Domain `mantur.co` is already connected to Vercel via Cloudflare. Pending:
- Supabase → Auth → URL Configuration:
  - Site URL: `https://mantur.co`
  - Redirect URLs: add `https://mantur.co/**` and `https://www.mantur.co/**`

### 5. Favicon + PWA + Open Graph
Can bundle in a single `chore/pwa-meta` branch:
- `public/favicon.svg` — ManTur pin, green background
- `public/manifest.json` — PWA manifest with pin icons
- `src/app/layout.tsx` — add `<meta>` og tags + link to manifest
