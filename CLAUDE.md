# CLAUDE.md

This file is the persistent project memory for Claude Code. Read it fully
before starting any task.

## Project

**ManTur** — a tourism marketplace for Manaure Balcón del Cesar (Cesar,
Colombia), connecting three actors transactionally: tourists, business
owners, and local transporters (motocarro drivers).

Domain: mantur.co

Reference (informational only, not to be copied as-is): a prior directory-only
MVP at https://github.com/everever1617-art/turma (Next.js + Firebase). We are
rebuilding from scratch with a relational data model on Supabase.

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

- Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Supabase: Postgres, Auth, Storage, Realtime, RLS
- Wompi (Colombian payment gateway) — sandbox mode for the MVP
- Vercel for hosting

## Data model (v1 — English names, relational)

- `profiles` — extends `auth.users`; `role`: `tourist` | `business_owner` |
  `transporter` | `admin`
- `businesses` — restaurants, balnearios, fincas; owned by a `profile`
- `places` — static touristic attractions (informational)
- `experiences` — bookable activities tied to a `business`, has price & capacity
- `guides` — local tour guides, has a rate
- `transporters` — motocarro drivers; availability status
- `transport_requests` — a tourist requests a ride; a transporter accepts/rejects
- `bookings` — a tourist books an `experience` or a `business` service; links
  to a `transaction`
- `transactions` — payment records (Wompi reference, status, amount)
- `commission_config` — commission percentage per service type, editable by
  admin

## Out of scope for the MVP

Real production payments (sandbox only), native push notifications, offline
mode, multi-business packaged itineraries, municipal institutional
partnership integration.

## Workflow

1. For any new feature, start in **Plan Mode** (`Shift+Tab`) — propose the
   plan before touching files.
2. Delegate to the relevant subagent in `.claude/agents/` when the task
   matches its description (see below).
3. After implementation, summarize what changed and why, so it can be
   reviewed in a follow-up discussion before moving to the next feature.

## Git workflow: commits, branches, PRs

**Commit messages follow Conventional Commits.**

```
<type>(<scope>): <short summary, imperative mood, no period>

[optional body: why, not just what]

[optional footer: BREAKING CHANGE:, Refs: #12]
```

Allowed `type` values: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`,
`style`, `perf`. Common `scope` values for this project: `db`, `auth`,
`bookings`, `transport`, `payments`, `businesses`, `ui`, `config`.

Examples:
```
feat(bookings): add booking creation server action
fix(payments): verify Wompi webhook signature before marking paid
refactor(db): normalize transporter availability into its own table
docs(claude): document commission_config table
```

Never mention "Claude" or "AI-generated" in commit messages or PR text —
write them as any engineer would.

**Branch naming**: `<type>/<short-description>`, e.g. `feat/booking-flow`,
`fix/webhook-signature`.

**One feature/task = one branch = one PR.** Do not bundle unrelated changes.

**Before opening a PR:**
1. Run lint/build locally and fix failures.
2. If the change touches auth, payments, or money logic, run the
   `security-reviewer` subagent first and resolve its findings.
3. Write the PR description using `.github/PULL_REQUEST_TEMPLATE.md`.

**PR titles** also follow Conventional Commits format (`feat(bookings): ...`)
so they read well in the changelog/history.

## Subagents available in this repo

- `db-schema-agent` — designs/migrates Postgres schema + RLS policies
- `security-reviewer` — reviews any diff touching auth, payments, or money
  logic before it's considered done
- `ui-agent` — builds and reviews pages/components following the VayaTur
  design system (mobile-first, tourism aesthetic, shadcn/ui Vega)
