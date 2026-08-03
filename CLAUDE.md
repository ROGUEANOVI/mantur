# CLAUDE.md

This file is the persistent project memory for Claude Code. Read it fully
before starting any task.

## Project

**ManTur** — a tourism marketplace for Manaure Balcón del Cesar (Cesar,
Colombia), connecting three actors transactionally: tourists, business
owners, and local transporters (motocarro drivers).

Domain: mantur.co  
GitHub: https://github.com/ROGUEANOVI/mantur  
Production: deployed on Vercel

Reference (informational only, not to be copied as-is): a prior directory-only
MVP at https://github.com/everever1617-art/turma (Next.js + Firebase). We are
rebuilding from scratch with a relational data model on Supabase.

## Brand identity (finalized)

**Logo**: Pin de destino — a teardrop/map-pin SVG filled green with white
mountain line art inside (Serranía del Perijá) and an amber sun dot.
Component: `src/components/shared/ManturLogo.tsx` — accepts `size` prop
(`sm` | `md` | `lg`). Use this component everywhere the brand mark appears;
never hardcode the SVG inline in page/layout files.

**Color palette** — all tokens are set in `src/app/globals.css`:

| Name | Hex | Token |
|------|-----|-------|
| Verde ManTur | `#0e7a54` | `--primary` |
| Ámbar Caribe | `#e8a020` | `--accent` |
| Bosque | `#0a2b1e` | `--foreground` (dark text) |
| Azul Noche | `#0d1f2d` | `--background` (dark mode) |
| Salvia | `#5ba88a` | secondary green |
| Niebla | `#f5faf7` | `--background` (light mode) |

Always use Tailwind tokens (`text-primary`, `bg-accent`, `bg-background`, etc.)
in components — never hardcode hex values except in the SVG pin inside
`ManturLogo.tsx` and `globals.css`.

**Tagline**: "Turismo con alma local" — scalable to any Colombian municipality.
Source of truth for all copy: `src/lib/copy/` files.

## Language conventions

- **All code, comments, commit messages, variable/function/table names in
  English.**
- User-facing UI copy is in **Spanish** (end users are in Colombia).
- Keep these separated: never hardcode Spanish strings inside business logic
  — use a small `i18n`/copy layer even if we only ship Spanish for the MVP.

## Non-negotiable principles

1. **Money logic is server-only.** Commission calculations, payment amounts,
   and transaction status are resolved in Server Actions or Route Handlers.
   Never trust or compute financial values on the client.
2. **RLS (Row Level Security) is mandatory** on every Supabase table holding
   user or transactional data. No table ships without its RLS policy in the
   same migration.
3. **Commission rate is configurable data, not a constant.** It lives in the
   `commission_config` table, never hardcoded in application code.
4. **Mobile-first UI.** Most real users will be on a phone with intermittent
   connectivity.
5. **Every migration is reviewed before being applied**, even in local dev.
6. Prefer Server Components by default; use Client Components only where
   interactivity is required (forms, realtime updates, search).

## Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui Vega
- Supabase: Postgres, Auth, Storage, Realtime, RLS
- Wompi (Colombian payment gateway) — sandbox mode for the MVP
- Vercel for hosting

## What has been built (phases complete)

### Phase 1 — Auth (PRs #1, #4 — merged)
Login, signup, protected routes, role-based access, RLS on `profiles`,
admin client for role assignment, middleware session refresh.

### Phase 2 — Content schema + listings (PRs #2, #3, #8 — merged)
`businesses`, `places`, `experiences`, `commission_config` tables + RLS.
Public listing pages (`/negocios`, `/lugares`, `/negocios/[id]`).
Storage bucket `business-images`.

### Phase 2 — Business owner panel (PR #4 — merged)
`/mi-negocio` — multi-business panel, create/edit/deactivate, experience CRUD.
Image upload via `ImageManager` + `browser-image-compression`.

### Phase 3 — Bookings + payment (PRs #5, #6 — merged)
`bookings` + `transactions` schema with RLS. Tourist booking flow with
simulated Wompi payment. `/mis-reservas` history. Commission stored at booking
time via `get_commission_rate()` RPC (service_role only).

### Phase 3 — Admin panel (PR #7 — merged)
`/admin` — business approval/rejection, commission rate management.
`/admin/negocios`, `/admin/comisiones`, `/admin/lugares`.

### Phase 3 — Public landing + nav (PR #10 — merged)
Landing page, `PublicNav` with mobile menu, active-state `NavLink`,
user avatar. Multi-business panel enhancements.

### Phase 3 — Image uploads (PR #11 — merged)
`BusinessImageCarousel`, compact horizontal listing cards, `ImageManager` for
both businesses and places. Storage bucket `place-images`.

### Phase 3 — Brand identity (PR #12 — merged)
`ManturLogo` component, brand color tokens in `globals.css`, tagline «Turismo
con alma local», landing hero gradient + decorative circles, auth layout
redesign with Bosque/Azul Noche gradient. Listing pages (`/negocios`,
`/lugares`): debounced search, centered pill filters, responsive 1→2→3 column
card grid, section-specific hero silhouettes (town skyline / mountain range),
server-side pagination via `PaginationNav`. New shared components:
`ManturLogo`, `SearchInput`, `PaginationNav`. Favicon: `src/app/icon.svg`.

### Phase 3 — Admin UX + categories (PR #13 — merged)
`business_categories` table + RLS + seed data (7 categories). `/admin/categorias`
CRUD page (create with auto-slug, activate/deactivate). Filter pills on
`/negocios` driven from DB instead of hardcoded constants. Admin layout
redesigned: `PublicNav` on top, collapsible `AdminSidebar` (hover-to-expand,
`fixed` positioned, groups with dividers), mobile horizontal tab bar.
`/admin` dashboard enriched with 6 stat cards (including confirmed revenue
and user count), quick approve/reject queue for pending businesses, recent
bookings list. Place type `beach` replaced by `plaza`.

### Phase 3 — Role request flow + business auto-create fix (PRs #14, #15 — merged)
Removed role selection from signup — all new accounts start as `tourist`.
New `role_requests` table + RLS. New `tourist_guide` user_role enum value.
`/solicitar-rol` — marketing "Únete a ManTur" page with brand hero and
three value-proposition cards (business owner, transporter, tourist guide),
two-step UX (card selection → role-specific form). Role-specific metadata
captured: business_name + category + phone (business owner); license plate +
vehicle type + phone (transporter); specialties + languages + bio (tourist
guide). `PublicNav` shows "Únete" amber link for tourist role.
`/admin/solicitudes` — admin panel to review/approve/reject role requests
with `RejectForm` that requires a written reason. `approveRoleRequest` action
promotes user role in `profiles` and cancels other pending requests from same user.
Signup form redesigned with confirm-password field, visibility toggles,
real-time strength indicator (8 chars, uppercase, digit, special char).
Migration: `20260731200000_add_tourist_guide_role_and_role_requests.sql`.

### Phase 3 — Multi-category businesses (PR #16 — merged)
`business_category_links` join table (composite PK, `ON DELETE CASCADE` on
`business_id`, `ON DELETE RESTRICT` on `category_id`). RLS: public SELECT;
INSERT/DELETE for business owner or admin. Migration:
`20260801000000_create_business_category_links.sql`.
`/mi-negocio` create/edit forms: multi-checkbox category selector driven from
`business_categories` DB (replaces the 5-button type selector).
`/solicitar-rol` business_owner step: multi-checkbox instead of single select.
`/negocios` filter: uses join table instead of `eq('type', slug)`;
`BusinessCard` shows up to 2 category pills. `businesses.type` kept as legacy
field (`'other'` for new records) — no longer user-facing.

### Phase 4 — Transporters (PRs #17, #18 — merged)
`transporters` + `transport_requests` tables + full RLS. Migration:
`20260801100000_create_transporters.sql`. `approveRoleRequest` auto-creates
`transporters` row from metadata on approval (license_plate, vehicle_type, phone).
`/transportistas` — public listing of available drivers (uses `createAdminClient`
to bypass RLS for names join; `TransporterCardWithModal` opens request form in a Dialog).
`/transporte/solicitar` — tourist-only request form (origin, destination, datetime,
people count, notes). `/mis-viajes` — tourist transport history with cancel action.
`/mi-perfil-transporte` — transporter panel: availability toggle (`AvailabilityToggle`
Client Component), pending request queue with atomic claim (`acceptTransportRequest`
uses service_role to guarantee first-one-wins), accepted requests list with mark-complete.
`/admin/transportes` — admin view with segmented control status filter tabs. `PublicNav`
shows Transportadores in main nav; tourist gets "Mis traslados" link; transporter gets
"Mi panel" link. Post-merge fixes (PR #18): RLS migration
`20260801200000_profiles_authenticated_read.sql` so PostgREST joins can read other
users' `full_name`; admin layout fix; RejectForm button size fix.

### Phase 5a — Experience image uploads (PR #19 — merged)
`/mi-negocio/[id]/experiencias/[expId]/editar` — two-section page: **Detalles**
(pre-populated `EditExperienceForm`, saves inline) + **Fotos** (`ImageManager`,
up to 5 images stored under `experiences/[id]/` in `business-images` bucket).
`uploadExperienceImage` / `deleteExperienceImage` server actions verify ownership
via `experience → business → owner_id` chain before using admin client.
`ExperienceCard` now shows a pencil "Editar" link.

### Phase 5b — Tourist guide flow (PRs #20 — merged)
`tourist_guides` + `guide_tours` tables + full RLS. Migrations:
`20260802000000_create_tourist_guides.sql`, `20260802100000_add_phone_to_tourist_guides.sql`,
`20260802200000_add_notes_to_bookings.sql`. `approveRoleRequest` auto-creates
`tourist_guides` row from metadata on approval (specialties, languages, bio, phone).
Public `/guias` listing + `/guias/[id]` profile with full tour descriptions and booking form.
Three-state booking access: `tourist` (form) / `guest` (→ login) / `other_role` (hidden).
`/mi-perfil-guia` panel: availability toggle, tour CRUD (`/tours/nueva`, `/tours/[id]/editar`
with `ImageManager`), recent bookings with tourist notes.
`/mi-perfil-guia/editar`: guide updates phone, bio, specialties, languages post-approval.
Booking notes field: tourist leaves coordination hints (hora, punto de encuentro).
Confirmation page: shows guide WhatsApp link (`wa.me/57...`) + tourist notes when booking a tour.
`/solicitar-rol`: tourist_guide step captures phone. Slug translation for specialties/languages
across all pages. `bookings.notes` column added. Commission rate 10% for `guide_tour`.

### Phase 5c — README (PR #23 — merged)
`README.md` added to repository root: project overview, stack, local setup
instructions (env vars, `npm install`, Supabase schema overview, contributing
conventions).

### Phase 5d — Open Graph + PWA (PRs #21, #22 — merged)
`src/app/opengraph-image.tsx` — edge-rendered 1200×630 default OG image
(Bosque gradient, pin SVG, ManTur wordmark, tagline in amber). `generateMetadata`
on `/negocios/[id]` and `/guias/[id]` with real entity name/description/image;
static `metadata` on `/negocios`, `/guias`, `/transportistas`. Title template
`'%s | ManTur'` in root layout. `themeColor` light/dark for browser chrome.
`src/app/manifest.ts` — PWA manifest (standalone, portrait, 3 shortcuts).
`src/app/apple-icon.tsx` — edge-rendered 180×180 maskable PNG icon.

## Pending / post-MVP

- **Domain `mantur.co`**: already connected to Vercel via Cloudflare; Supabase
  Auth redirect URLs already updated to include `https://mantur.co/**` ✅.
- **Tourist guide enhancements**: tour image carousels, calendar availability
  picker, review/rating system.
- **Real Wompi integration**: replace sandbox with production keys + webhook
  signature verification.

## Data model (v1 — English names, relational)

- `profiles` — extends `auth.users`; `role`: `tourist` | `business_owner` |
  `transporter` | `admin`
- `businesses` — restaurants, balnearios, fincas; owned by a `profile`
- `places` — static touristic attractions (informational)
- `experiences` — bookable activities tied to a `business`, has price & capacity
- `transporters` — motocarro drivers; vehicle info, availability status
- `transport_requests` — a tourist requests a ride; a transporter accepts/rejects
- `bookings` — a tourist books an `experience`; links to a `transaction`
- `transactions` — payment records (Wompi reference, status, amount)
- `commission_config` — commission percentage per service type, editable by admin
- `business_categories` — business category types (name, slug, sort_order, is_active); drives filter pills on `/negocios`

## Out of scope for the MVP

Real production payments (sandbox only), native push notifications, offline
mode, multi-business packaged itineraries, municipal institutional
partnership integration.

## Workflow

1. **Never commit directly to `main`.** All work goes on a feature branch:
   `feat/<description>`, `fix/<description>`, `chore/<description>`.
2. For any new feature, start in **Plan Mode** (`Shift+Tab`) — propose the
   plan before touching files.
3. Delegate to the relevant subagent in `.claude/agents/` when the task
   matches its description (see below).
4. After implementation, summarize what changed and why for review before
   moving to the next feature.
5. Docs and CLAUDE.md updates can go on `main` directly only when they are
   documentation-only changes with zero code impact.

## Git workflow: commits, branches, PRs

**Commit messages follow Conventional Commits.**

```
<type>(<scope>): <short summary, imperative mood, no period>

[optional body: why, not just what]

[optional footer: BREAKING CHANGE:, Refs: #12]
```

Allowed `type` values: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`,
`style`, `perf`. Common `scope` values for this project: `db`, `auth`,
`bookings`, `transport`, `payments`, `businesses`, `ui`, `config`, `brand`.

Examples:
```
feat(bookings): add booking creation server action
fix(payments): verify Wompi webhook signature before marking paid
feat(brand): add ManturLogo component and integrate into navbar
chore(brand): update design tokens to ManTur palette in globals.css
```

Never mention "Claude" or "AI-generated" in commit messages or PR text —
write them as any engineer would.

**Branch naming**: `<type>/<short-description>`, e.g. `feat/booking-flow`,
`feat/brand-identity`, `fix/webhook-signature`.

**One feature/task = one branch = one PR.** Do not bundle unrelated changes.

**Before opening a PR:**
1. Run `npm run build` locally and fix all failures.
2. If the change touches auth, payments, or money logic, run the
   `security-reviewer` subagent first and resolve its findings.
3. Write the PR description using `.github/PULL_REQUEST_TEMPLATE.md`.

**PR titles** also follow Conventional Commits format (`feat(bookings): ...`)
so they read well in the changelog/history.

## Subagents available in this repo

- `db-schema-agent` — designs/migrates Postgres schema + RLS policies
- `security-reviewer` — reviews any diff touching auth, payments, or money
  logic before it's considered done
- `ui-agent` — builds and reviews pages/components following the ManTur
  design system (mobile-first, tourism aesthetic, shadcn/ui Vega)

## Testing

Vitest (unit/integration) + Playwright (e2e). See `TESTING.md` for full conventions.

```bash
npm run test          # unit/integration
npm run test:e2e      # e2e
```

Tests live next to source (`foo.ts` → `foo.test.ts`) or under `e2e/`. Expectations:

- 100% test coverage is the goal — tests make vibe coding safe.
- When writing a new function, write a corresponding test.
- When fixing a bug, write a regression test.
- When adding error handling, write a test that triggers the error.
- When adding a conditional (if/else, switch), test both paths.
- Never commit code that makes existing tests fail.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
