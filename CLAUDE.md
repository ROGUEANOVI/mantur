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

## Pending / Phase 4

- **Transporters**: `transporters` table, `transport_requests`, public
  `/transportistas` page, tourist request flow, driver availability flow.
  This is the third actor in the CLAUDE.md spec — not yet built.
- **Experience image uploads**: add `/mi-negocio/[id]/experiencias/[expId]/editar`
  with `ImageManager` reusing the business image pattern.
- **PWA manifest** (`manifest.json` + icons using the pin logo) for home screen
  install on Android/iOS.
- **Open Graph / meta tags**: og:image, og:title per page for WhatsApp/social
  sharing — use the pin logo on Bosque background.
- **Connect domain `mantur.co`** to Vercel; update Supabase Auth redirect URLs.

## Data model (v1 — English names, relational)

- `profiles` — extends `auth.users`; `role`: `tourist` | `business_owner` |
  `transporter` | `admin`
- `businesses` — restaurants, balnearios, fincas; owned by a `profile`
- `places` — static touristic attractions (informational)
- `experiences` — bookable activities tied to a `business`, has price & capacity
- `transporters` — motocarro drivers; availability status (NOT YET BUILT)
- `transport_requests` — a tourist requests a ride; a transporter accepts/rejects
  (NOT YET BUILT)
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
