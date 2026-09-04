# CLAUDE.md

This file is the persistent project memory for Claude Code. Read it fully
before starting any task.

## Project

**ManTur** — a tourism marketplace for Manaure Balcón del Cesar (Cesar,
Colombia), connecting four actors transactionally: tourists, business
owners, local transporters (motocarro drivers), and tourist guides. ManTur
also sells its own curated packages (`paquetes`) directly, acting as a tour
operator in its own right (see Phase 14).

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
- Wompi (Colombian payment gateway) — production checkout/payouts/refunds are
  live (Phase 12), currently dormant for business-service bookings under the
  manual-ops pivot (Phase 13) but still active for guide tours and packages
- Alegra (Colombian accounting/invoicing) — commission invoicing on payment
  confirmation
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

### Phase 6 — Test framework bootstrap + QA fixes (PR #23 — merged)
Vitest + Testing Library + Playwright bootstrapped. Fixed ISSUE-001 (mobile
menu overlay not dimming page content, with regression test) and ISSUE-002
(`themeColor` moved from `metadata` to the `viewport` export, as required by
Next.js). `parsePrice`/`parsePositiveInt` extracted out of a `'use server'`
file so they're importable directly in unit tests. CI bumped to Node 24
(jsdom 30 requires it).

### Phase 6 — Test coverage initiative (PRs #24–#42 — merged)
19 PRs adding unit/integration coverage across every Server Action file
(reservas, admin, auth, transporte-perfil, transporte-solicitud, mi-negocio,
mi-perfil-guia, solicitar-rol, admin/categorias, admin/negocios+lugares) and
every component directory (mi-negocio, admin forms, auth, layout, guias,
reservas/transporte, shared components, role-request form). Project reached
~100% test coverage; see `TESTING.md` for conventions.

### Phase 7 — Navbar role menu (PR #43 — merged)
Role-based nav links (Mi negocio / Mi panel / Mis reservas / etc.) moved out
of the flat `PublicNav` bar into a new avatar dropdown: `UserMenu` component
built on a new shadcn `dropdown-menu` primitive
(`src/components/ui/dropdown-menu.tsx`). Reduces nav clutter, especially on
mobile.

### Phase 7 — UI polish: canonical `min-h-11` class (PR #44 — merged)
Replaced arbitrary `min-h-[44px]` utility classes with the canonical Tailwind
`min-h-11` across the codebase — same value, consistent with the design
system's touch-target convention.

### Phase 7 — Featured businesses carousel arrows (PR #45 — merged)
Desktop prev/next arrow buttons added to the landing page's featured
businesses carousel.

### Phase 7 — Transporter request-ride gate fix (PR #46 — merged)
Fixed: the "Solicitar viaje" button on `/transportistas` was visible to
non-tourist roles; now hidden for `business_owner`/`transporter`/`admin`.

### Phase 7 — Public place detail page (PR #47 — merged)
`/lugares/[id]` — public detail page for a `place` (`BusinessImageCarousel`,
Google Maps link, type icon), with a `loading.tsx` skeleton. `PlaceCard`s on
`/lugares` and the landing page now link to it.

### Phase 7 — Profile editing (PR #48 — merged)
`/mi-perfil` — any authenticated user can edit their name, phone, and avatar.
New `avatars` storage bucket (migration `20260807000000_add_avatars_bucket.sql`),
`AvatarUploader` component (compressed upload via `browser-image-compression`,
same pattern as `ImageManager`), `EditProfileForm`. Linked from `UserMenu`/
`PublicNav`.

### Phase 8 — Video uploads for businesses, experiences, and places (PR #49 — merged)
`videos text[]` column added to `businesses`/`experiences`/`places`. New
storage buckets `business-videos` (shared by businesses + experiences, same
way `business-images` is) and `place-videos` — 50MB limit, video-only mime
types (MP4/WebM/QuickTime). Combined photo+video cap raised from 5 to 10 per
entity. Videos upload directly from the browser to Supabase Storage via a
signed URL (`request*VideoUpload` / `confirm*VideoUpload` Server Actions),
since a 50MB file exceeds Next.js/Vercel Server Action body limits;
`confirm*VideoUpload` validates the storage path belongs to the caller's own
entity and derives the public URL server-side rather than trusting a
client-supplied URL. New `MediaManager` component (photos + videos) replaces
`ImageManager` on the business/experience/place edit pages — `ImageManager`
itself is untouched and still serves guide tours. `BusinessImageCarousel`
plays video slides after photo slides. Migration:
`20260807100000_add_videos_and_video_buckets.sql`.

### Phase 9 — SEO foundations, slugs, and content pages (PRs #50–#58 — merged)
Brand asset refresh (`public/brand/*` SVG/PNG logo variants, favicon routes
at `src/app/icons/{192,512,512-maskable}`, `src/app/manifest.ts`). SEO
foundations: `src/app/robots.ts`, `src/app/sitemap.ts`, `Breadcrumbs`
component, JSON-LD helpers (`src/lib/seo/jsonLd.ts`). Public listing/detail
routes migrated from `[id]` to human-readable `[slug]` URLs — migration
`20260807200000_add_public_entity_slugs.sql`. `/descubre/*` local-SEO
content pages (cómo llegar, dónde comer, mejor época, naturaleza, qué hacer
en Manaure) added, copy in `src/lib/copy/descubre.ts`. Separately, a real
bookable activity detail page landed at
`/negocios/[slug]/actividades/[expId]`. Motion/UX polish: `Reveal`
scroll-reveal wrapper, `Avatar` component with initials fallback,
`BusinessImageCarousel` gesture/interaction improvements. Legal pages
(`/politica-de-privacidad`, `/terminos-y-condiciones`, `/acerca-de-nosotros`)
with copy in `src/lib/copy/legal.ts`. Landing page redesign with
`HeroSlideshow`.

### Phase 10 — Auth hardening (PRs #59–#66 — merged)
Google OAuth sign-in (`GoogleSignInButton`, `src/app/auth/callback/route.ts`).
Email confirmation via SMTP (`src/app/auth/confirm/route.ts`). Rate limiting
on auth/transport actions (`src/lib/rate-limit.ts`). Login form UX fix
extracted a shared `PasswordInput` component. Contact phone normalization
(`src/lib/phone.ts`) landed then was immediately superseded: phone moved off
`profiles` into a new `profile_contact_details` table (migration
`20260814000000_move_profiles_phone_to_contact_details.sql`) to stop
over-exposing it through PostgREST joins. Footer `SocialLinks` component.

### Phase 11 — Services rename, detail-page redesign, and RNT compliance (PRs #74–#91 — merged)
Form-field validation consistency (`fix/#74`), avatar fallback/cropping
(`#75`, `#76`), password reset flow (`#77`), login/signup redesign in an
Alegra-inspired layout (`#78`), Google-auth button copy (`#79`), local dev
environment fixes (`#80`).
**`experiences` renamed to `services`** with flexible per-type attribute
config (PR #81, migration `20260818100000_rename_experiences_to_services.sql`):
`services.price` → `base_price`, `bookings.experience_id` → `service_id`,
`bookings.people_count` → `quantity`; new `service_types` table (tour_activity,
lodging, event_rental, pasadia) + `business_category_service_type_suggestions`;
`commission_config.service_type` re-seeded per type (migration
`20260818000000_create_service_types.sql`). Admin nav became a slide-in
drawer (`#82`); service/category creation form hierarchy fixes (`#83`, `#84`).
Public listing heroes redesigned around a shared `HeroControlCard` +
`FilterPillsRail` + `AuroraHero`/`IllustratedHero` (`#85`). Detail pages
redesigned with a photo mosaic, `MediaGallery`, `FavoriteButton`, and split
layout — new `favorites` table (migration `20260819000000_create_favorites.sql`)
(`#86`). `/admin/guias` and `/admin/transportistas` management pages (`#87`).
RNT (Registro Nacional de Turismo) compliance verification for businesses,
guides, and transporters — document upload + admin verify/lock flow
(migration `20260821000000_add_compliance_verification.sql` and follow-ups)
(`#88`), with a same-day fix for the profiles embeds it broke (`#89`). Role
gating fixes: `/mi-perfil-guia`/`/mi-perfil-transporte` now redirect when the
caller's current role no longer matches (`#90`); "Solicitar traslado" hidden
on unavailable transporter cards (`#91`).

### Phase 12 — Real Wompi payments, Alegra invoicing, and refund engine (PRs #92–#109 — merged)
The big one (PR #92, ~6,200 lines): production Wompi checkout
(`src/lib/wompi/checkout.ts`), the webhook handler
(`src/app/api/webhooks/wompi/route.ts`, signature-verified — see
`.claude/rules/money-and-payments.md`), provider payout accounts
(`business_payout_accounts`, `tourist_guide_payout_accounts`,
`PayoutAccountForm`/`GuidePayoutAccountForm`), a full refund engine
(`refund_policy_config`, `refund_requests`, `RequestRefundForm`,
`refundEmails.ts`), and the `provider_payouts` ledger — all across migrations
`20260830000000` through `20260831100000`. Follow-ups: legal-entity naming +
Ley 679 child-protection notice + RNT/matrícula mercantil display (`#93`–`#95`);
Alegra commission-invoice creation on payment confirmation
(`src/lib/alegra/invoices.ts`, `#96` — see
`docs/wompi-alegra-integration-plan.md` §6.3.1) charging 19% IVA (`#98`);
business owner gets an email when a booking is confirmed
(`src/lib/email/bookingEmails.ts`'s `notifyBusinessOfBooking`, `#97`);
estimated Wompi fee tracked per transaction (`#99`); admin dashboard
redesigned with an attention queue + richer metrics (`#100`, fixed in `#104`);
Alegra invoice no longer silently skipped when Wompi collects no legal ID
(`#101`); business owners get a real per-booking detail list at
`/mi-negocio/[id]/reservas` — not just the aggregate count (`#102`); a
production incident fix deducts Wompi's non-refundable fee from manual
refunds (`#103` — see project memory `migration_apply_method` for the
deployment-process lesson learned here); in-app manual resolution for stuck
provider payouts (`#105`); refund payout instructions captured + void gated
by payment method (`#106`); payout-account dropdown/bank-id fixes (`#107`,
`#108`); provider payouts get an async confirmation via Wompi's own Payouts
webhook (`#109`).

### Phase 13 — Manual-operations pivot (PR #110 — merged)
Direct in-platform booking+payment disabled for business services (the
"Reservar" CTA removed from `/negocios/[slug]/servicios/[serviceId]`) —
ManTur had no real visibility into a business's actual availability, so a
tourist could book and pay for something ManTur couldn't confirm. See
project memory `manual_operation_pivot` for the full business rationale
(WhatsApp + bank transfer as the real sales channel; mantur.co as a trust
catalog). Guide-tour booking (`/guias/[slug]`'s `TourBookingForm`) was
deliberately **not** disabled — it's still directly bookable+payable today.

### Phase 14 — Paquetes: ManTur as its own tour operator (PRs #111–#120 — merged)
ManTur's own curated, fixed-price bundles — not a business/guide listing.
Fase 1 schema (`#111`, migration `20260903000000_create_packages.sql`):
`packages` (public, active-only SELECT), `package_items` (admin-only —
carries `internal_cost_cents`, the negotiated provider cost, which must never
leak to a tourist), and `provider_availability` (the two-phase pre-reserva
mechanism from `docs/wompi-alegra-integration-plan.md` §7.0 — confirm with
the provider before charging the tourist). `/admin/paquetes` CRUD (`#112`)
plus photo/video uploads (`#113`). Public `/paquetes` + `/paquetes/[slug]`
(`#114`), alongside a PostgREST-filter-injection fix on business search
(`#115`) and a hardening pass revoking anon/authenticated EXECUTE on
service-role-only RPCs (`#116`). Fase 4 pre-reserva flow (`#117`):
`/admin/paquetes/solicitudes` — admin confirms provider availability, then
`confirmPackagePrereserva`/`cancelPackagePrereserva`/`markPackageBookingPaid`
drive the tourist through `pending_availability` → confirmed → paid, each
step emailing the tourist (`packagePrereservaConfirmedEmail` etc. in
`bookingEmails.ts` — the first tourist-facing transactional emails in the
app). Providers get paid out per package_item on `markPackageBookingPaid`,
grouped and summed per unique provider (`#118`). Providers can now set their
own general availability calendar (`AvailabilityCalendar` component,
`/mi-negocio/[id]/disponibilidad`, `/mi-perfil-guia/disponibilidad`) instead
of relying solely on admin (`#119`), tightened by an RLS fix pinning
`source`/`resolved_by` server-side so a provider can't spoof an admin-sourced
row (`#120`).

### Phase 15 — UI consistency + guide booking notification (PRs #121–#122 — merged)
Consistent `cursor-pointer` on custom clickables and toast-only (no inline
banner) result messaging across forms (`#121` — see
`.claude/rules/components.md`). `notifyGuideOfBooking()` added to the Wompi
webhook, mirroring the existing `notifyBusinessOfBooking()`: a tourist guide
now gets an email when their tour booking is confirmed, closing the one gap
in that pair that was still live (guide-tour booking was never disabled by
the Phase 13 manual-ops pivot) (`#122`).

## Pending / post-MVP

- **Domain `mantur.co`**: already connected to Vercel via Cloudflare; Supabase
  Auth redirect URLs already updated to include `https://mantur.co/**` ✅.
- **Manual operation mode** (see project memory `manual_operation_pivot`):
  ManTur is currently running sales manually over WhatsApp + bank transfer,
  with mantur.co as a trust-building catalog rather than the transaction
  channel — a deliberate, reversible business decision, not a rollback.
  Direct in-platform booking+payment is disabled only for business services
  (Phase 13); guide-tour booking and the whole Paquetes pre-reserva flow
  (Phase 14) are still live today. Everything built under automated
  payments (Wompi checkout/payouts/refunds, Alegra invoicing) stays in the
  codebase and keeps improving — it's the "plus" to switch back on once
  demand is validated and ManTur has real control over provider availability.
- **Tourist guide enhancements**: tour image carousels and a review/rating
  system are still not built. (A general availability calendar for guides
  now exists — `/mi-perfil-guia/disponibilidad`, Phase 14 — so that part of
  this item is done.)
- **Wompi Payouts**: code-complete and deployed, including async
  confirmation via Wompi's own Payouts webhook (Phase 12, PR #109), but
  still unverified against a real production payout event — see project
  memory `wompi_payouts_integration_status`.
- **Alegra invoicing**: contact + commission-invoice creation on payment
  confirmation is live (see `docs/wompi-alegra-integration-plan.md` §6.3.1),
  but credit notes on refund and DIAN-status reconciliation (polling
  `GET /invoices/{id}?fields=events` — no webhook is available on this
  account tier) are not built yet. Package sales are invoiced manually in
  Alegra's own UI under the manual-ops model, not through this webhook-driven
  flow — see project memory `manual_operation_pivot`.
- **Package (paquetes) provider notifications**: a business owner or guide
  who is part of a package gets no notification at any pre-reserva stage
  (availability request, confirmation, payout) — the whole flow in
  `/admin/paquetes/solicitudes` is admin-driven today, by design under
  manual ops. Worth revisiting once packages scale past what one admin can
  track by eye.
- **refund_requests INSERT RLS**: booking ownership/amounts are unvalidated
  at INSERT time (same gap pattern as `bookings_insert` before it was
  fixed) — deferred from PR #103, see project memory
  `refund_requests_insert_rls_gap`.

## Data model (v1 — English names, relational)

- `profiles` — extends `auth.users`; `role`: `tourist` | `business_owner` |
  `transporter` | `tourist_guide` | `admin`
- `profile_contact_details` — phone, kept off `profiles` so PostgREST joins
  can't over-expose it to other users
- `businesses` — restaurants, balnearios, fincas; owned by a `profile`
- `business_categories` / `business_category_links` — category types + the
  many-to-many join to `businesses`; drives filter pills on `/negocios`
- `places` — static touristic attractions (informational)
- `services` — bookable activities tied to a `business` (renamed from
  `experiences`, Phase 11); `base_price`, `capacity`, a `service_types`
  reference (tour_activity/lodging/event_rental/pasadia) for flexible
  per-type attributes
- `service_types` / `business_category_service_type_suggestions` — the
  per-type attribute config behind `services` and category → type defaults
- `transporters` — motocarro drivers; vehicle info, availability status
- `transport_requests` — a tourist requests a ride; a transporter accepts/rejects
- `tourist_guides` — approved tourist guides; bio, specialties, languages,
  availability toggle
- `guide_tours` — bookable tours offered by a `tourist_guide`
- `bookings` — a tourist books a `service` (`service_id`), a `guide_tours`
  tour (`guide_tour_id`), or a `packages` bundle (`package_id`) — exactly one
  of the three; links to a `transaction`
- `transactions` — payment records (Wompi reference, status, amount)
- `commission_config` — commission percentage per service type, editable by admin
- `role_requests` — a tourist applies for `business_owner`/`transporter`/
  `tourist_guide`; reviewed by an admin in `/admin/solicitudes`
- `favorites` — a tourist's saved businesses/places/guides
- `business_payout_accounts` / `tourist_guide_payout_accounts` — a
  provider's bank account for Wompi Payouts
- `provider_payouts` — the payout ledger (queued/sent/confirmed) paid out to
  a business or guide after a booking is marked paid
- `refund_policy_config` / `refund_requests` — refund rules + the refund
  request/approval trail for a cancelled booking
- `packages` / `package_items` — ManTur's own curated, fixed-price bundles
  (Phase 14) and their provider components (a `service` or a `guide_tours`
  tour, each with an admin-only `internal_cost_cents`)
- `provider_availability` — the two-phase pre-reserva calendar (per
  provider, per date) used to confirm a package_item's provider before a
  tourist is charged; also self-service-writable by the provider themselves

## Out of scope for the MVP

Native push notifications, offline mode, municipal institutional partnership
integration.

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

## Rules and skills (repo-local)

- `.claude/rules/` — path-scoped instructions that auto-load when Claude
  reads a matching file: `money-and-payments.md`, `rls-and-migrations.md`,
  `components.md`, `testing.md`.
- `.claude/skills/` — vendored copies of the Skills this project relies on
  most, so anyone who clones the repo has them without a user-level install:
  `supabase-postgres-best-practices`, `vercel-react-best-practices`,
  `web-design-guidelines`, `ui-ux-pro-max`, `impeccable`, `frontend-design`,
  `caveman`.

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
