# ManTur — Project Status Handoff

> Update this file at the end of each session. At the start of the next session, read this file first.
> GitHub: https://github.com/ROGUEANOVI/mantur (renamed from `vayatur`)

---

## ⚠️ Immediate action required for next session

**There are uncommitted code changes on `main`** from the brand identity work done in the last session. Before any new feature work, move these to a branch and open PR #12:

```bash
git checkout -b feat/brand-identity
git add src/components/shared/ManturLogo.tsx \
        src/components/layout/PublicNav.tsx \
        src/app/globals.css \
        src/app/(auth)/layout.tsx \
        src/app/(public)/layout.tsx \
        src/app/(public)/page.tsx \
        src/lib/copy/landing.ts
git commit -m "feat(brand): add ManturLogo component and integrate into navbar

Pin de destino logo (green teardrop + white mountain line art + amber sun dot)
implemented as reusable ManturLogo component (sm/md/lg sizes). Integrated into
PublicNav and auth layout. Auth layout gradient updated to Bosque/Azul Noche.
Landing hero gradient updated to ManTur palette."
git commit -m "chore(brand): update design tokens to ManTur palette

Map all five ManTur brand colors to OKLCH CSS custom properties in globals.css:
--primary (Verde ManTur #0e7a54), --accent (Ámbar #e8a020), --background light
(Niebla #f5faf7), --background dark (Azul Noche #0d1f2d), --foreground (Bosque
#0a2b1e). Footer now uses tagline from landing copy."
git push -u origin feat/brand-identity
# then open PR on GitHub
```

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
| **12** | **feat/brand-identity** | **ManturLogo, color tokens, footer, hero gradient** | **🔴 uncommitted** |

---

## What was done in this session (session ending ~2026-07-31)

### Brand rename: VayaTur → ManTur (committed to main, ddd9efb)
- All UI copy, metadata, package.json `name`, CLAUDE.md updated
- Domain: `mantur.co`
- GitHub repo renamed from `vayatur` to `mantur`

### Brand identity exploration (artifact, not in codebase)
Explored 3 logo concepts. Final decision:
- **Logo**: Pin de destino — green teardrop pin, white Serranía mountain line art inside, amber sun dot
- **Wordmark A**: "Man" in Verde ManTur + "Tur" in Ámbar Caribe (font-black, letter-spacing -0.03em)
- **Tagline**: "Turismo con alma local"
- **Dark mode background**: Azul Noche `#0d1f2d` (not the forest green)
- Brand guide artifact: https://claude.ai/code/artifact/c3b1b879-d670-4916-8bc7-259237ec7a4a

### Code changes — feat/brand-identity (uncommitted, on main)

**New file: `src/components/shared/ManturLogo.tsx`**
- Reusable component, props: `size?: 'sm' | 'md' | 'lg'`
- Renders pin SVG + "Man"/"Tur" wordmark bicolor
- Used in `PublicNav` (md) and auth layout (lg)
- clipPath `id="mt-pin-clip"` — safe since rendered once per page

**`src/app/globals.css`** — ManTur color tokens mapped to OKLCH:
- `--primary` → Verde ManTur `#0e7a54` → `oklch(0.50 0.135 162)`
- `--accent` → Ámbar Caribe `#e8a020` → `oklch(0.72 0.17 70)`
- `--background` light → Niebla `#f5faf7` → `oklch(0.984 0.006 152)`
- `--background` dark → Azul Noche `#0d1f2d` → `oklch(0.145 0.028 225)`
- `--foreground` → Bosque `#0a2b1e` → `oklch(0.175 0.044 158)`
- `--border` → green-tinted `~#cce5d8` → `oklch(0.875 0.024 158)`

**`src/components/layout/PublicNav.tsx`** — brand text replaced with `<ManturLogo size="md" />`

**`src/app/(auth)/layout.tsx`**:
- Logo changed from text "ManTur" to `<ManturLogo size="lg" />`
- Gradient updated from generic `emerald/teal/cyan` to `from-[#0a2b1e] via-[#0d1f2d] to-[#091b27]`

**`src/app/(public)/layout.tsx`**:
- Footer now imports `landingCopy.footer` — two-line: tagline + rights
- Two separate `<p>` lines instead of one

**`src/app/(public)/page.tsx`**:
- Hero gradient: `emerald/teal/cyan` → `from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]`
- CTA primary button: `text-emerald-700` → `text-[#0e7a54]`
- Empty card placeholder: `from-emerald-100 to-teal-100` → `from-primary/10 to-primary/20`

**`src/lib/copy/landing.ts`**:
- `footer.tagline` → "Turismo con alma local · Manaure Balcón del Cesar, Colombia."

---

## Current schema (all migrations applied in production ✅)

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
```

**Storage buckets**:
- `business-images` — public read, business_owner/admin write
- `place-images` — public read, admin-only write

**Migrations applied (all ✅)**:
- `20260729000000_create_profiles.sql`
- `20260730000000_create_businesses_places_experiences.sql`
- `20260730200000_create_bookings_transactions.sql`
- `20260730230000_add_place_images_bucket.sql`

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
- **`deactivateBusiness` / `reactivateBusiness`**: ownership verified via user client, status update via admin client
- **`business_id` denormalized** in `bookings` to avoid JOIN in RLS for business owners
- **Commission stored at booking time** — never recalculated retroactively
- **Simulated payment** — Wompi fields nullable in schema, no migration needed for real integration
- **ManturLogo clipPath** — `id="mt-pin-clip"` is safe since the component renders once per page

---

## Technical debt (post-MVP)

| Priority | Item |
|----------|------|
| M-1 | Wrap `bookings` + `transactions` inserts in a Postgres RPC for atomicity |
| L-1 | Add DB-level capacity enforcement (SELECT FOR UPDATE) to prevent overbooking race condition |
| L-2 | Add PWA `manifest.json` with ManTur pin icon for home screen install |
| L-3 | Add Open Graph meta tags per page (og:image, og:title) for WhatsApp sharing |
| L-4 | Replace Next.js default favicon with ManTur pin SVG |

---

## Next session — ordered by priority

### 1. Create PR #12 — feat/brand-identity (FIRST THING)
See the "Immediate action required" section at the top. Run the git commands,
push the branch, open PR, merge.

### 2. Connect domain mantur.co to Vercel
1. In Vercel → Project → Settings → Domains: add `mantur.co` and `www.mantur.co`
2. Follow Vercel's DNS instructions for the domain registrar
3. After DNS propagates: in Supabase → Auth → URL Configuration update:
   - Site URL: `https://mantur.co`
   - Redirect URLs: add `https://mantur.co/**` and `https://www.mantur.co/**`

### 3. Phase 4 — Transporters (new branch: `feat/transporters`)
This is the third actor in the business model, not yet built:
- **DB**: `transporters` table (driver profile, vehicle info, availability status) + RLS
- **DB**: `transport_requests` table (tourist requests, transporter accepts/rejects) + RLS
- **Migration**: new file, reviewed before applying
- **Public page**: `/transportistas` — list available drivers
- **Tourist flow**: `/transporte/solicitar` → create request; `/mis-viajes` → history
- **Transporter flow**: `/mi-perfil-transporte` → manage availability + incoming requests
- Use `db-schema-agent` to design the schema before writing any code

### 4. Experience image uploads (new branch: `feat/experience-images`)
- Add `/mi-negocio/[id]/experiencias/[expId]/editar` page
- Reuse `ImageManager` + `uploadBusinessImage` pattern targeting `experiences.images[]`

### 5. Favicon + PWA + Open Graph
Can bundle in a single `chore/pwa-meta` branch:
- `public/favicon.svg` — ManTur pin, green background
- `public/manifest.json` — PWA manifest with pin icons
- `src/app/layout.tsx` — add `<meta>` og tags + link to manifest
