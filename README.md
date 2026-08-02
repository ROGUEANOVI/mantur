# ManTur — Turismo con alma local

A tourism marketplace for **Manaure Balcón del Cesar** (Cesar, Colombia), connecting three actors: tourists, business owners, and local motocarro drivers (transporters).

Live: [mantur.co](https://mantur.co)

---

## What it does

- **Tourists** discover local businesses, book experiences, hire tourist guides, and request transport.
- **Business owners** manage their listings, experiences, and bookings from a mobile-friendly panel.
- **Tourist guides** publish tours with fixed prices and manage bookings through their own panel.
- **Transporters** (motocarro drivers) toggle availability and accept ride requests.
- **Admins** approve businesses/guides/transporters, manage categories, and monitor all activity.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui Vega |
| Database | Supabase (Postgres + Auth + Storage + RLS) |
| Payments | Wompi (Colombian gateway) — sandbox for MVP |
| Hosting | Vercel |

---

## Local development

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)

### 1. Clone and install

```bash
git clone https://github.com/ROGUEANOVI/mantur.git
cd mantur
npm install
```

### 2. Environment variables

Create `.env.local` at the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> Use the **JWT legacy format** keys (`eyJ...`), not the newer `sb_publishable_` format.

### 3. Apply database migrations

Open the Supabase SQL Editor and run each file in `supabase/migrations/` in chronological order (filenames are prefixed with a timestamp).

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project structure

```
src/
  app/
    (public)/         # Unauthenticated routes: /, /negocios, /lugares, /guias, /transportistas
    (app)/            # Authenticated routes: /mi-negocio, /mi-perfil-guia, /admin, …
    layout.tsx        # Root layout with global metadata (OG, PWA theme color)
    manifest.ts       # PWA manifest
    opengraph-image.tsx  # Default OG image (edge-rendered)
    apple-icon.tsx    # Maskable PWA icon (edge-rendered)
  components/
    layout/           # PublicNav, AdminSidebar, NavLink
    shared/           # ManturLogo, SearchInput, PaginationNav
    guias/            # TourBookingForm, GuideAvailabilityToggle
    transporte/       # TransportRequestForm, AvailabilityToggle, RequestCard
    mi-negocio/       # BusinessForm, ExperienceCard, ImageManager
    mi-perfil-guia/   # EditGuideProfileForm, TourForm
  lib/
    supabase/         # createClient (server), createAdminClient, middleware
    copy/             # All Spanish UI strings (auth, businesses, guides, bookings, …)
supabase/
  migrations/         # Chronological SQL migrations with RLS policies
```

---

## Key conventions

- **English** for all code, variable names, table/column names, and commit messages.
- **Spanish** for all user-facing copy — strings live in `src/lib/copy/` files, never inline.
- **Server Components by default**; Client Components only where interactivity is required (`'use client'`).
- **Money logic is server-only** — no financial calculations on the client.
- **RLS is mandatory** on every table holding user or transactional data.
- **Commission rate is stored in `commission_config`**, never hardcoded.
- **Mobile-first** — designed for phones on intermittent connectivity.

---

## Contributing

1. Create a feature branch: `feat/<description>`, `fix/<description>`, or `chore/<description>`.
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.
3. Run `npm run build` before opening a PR — zero TypeScript errors required.
4. Never commit directly to `main`.

See `CLAUDE.md` for full project memory and architecture decisions.
