# ManTur — shared agent instructions

This is the canonical, shared instruction file for all coding agents. Read the
relevant linked documents before changing a related area. Keep this file concise
and current; move dated implementation detail to `docs/project-history.md`.

## Product and current operating model

ManTur is a mobile-first tourism marketplace for Manaure Balcón del Cesar,
Colombia. It connects tourists, business owners, motocarro transporters,
tourist guides, and ManTur itself as a tour-package operator.

The product currently operates in **manual-sales mode**:

- Business-service and guide-tour booking/payment flows are disabled.
- Transport requests and the cash-based accept/complete flow remain active.
- Package pre-reservations remain active: provider availability is confirmed
  before charging the tourist.
- Wompi, payouts, refunds, and Alegra integration remain in the codebase for
  the later return to automated operations. Do not accidentally re-enable a
  dormant payment path.

Read `docs/current-state.md` before work involving bookings, payments,
packages, guides, transport, or operations.

## Stack and conventions

- Next.js 16 App Router, TypeScript, React 19, Tailwind CSS v4, shadcn/ui.
- Supabase Postgres, Auth, Storage, Realtime, and RLS; Vercel hosts production.
- Wompi handles payments/payouts/refunds; Alegra handles accounting/invoicing.
- All code, comments, identifiers, database names, and commit messages are in
  English. All user-facing copy is Spanish and belongs in `src/lib/copy/`.
- Prefer Server Components. Use Client Components only for browser interaction.
- Use the existing `ManturLogo` component; use Tailwind design tokens rather
  than hard-coded colours outside `globals.css` and its inline SVG exception.
- Design mobile-first and account for intermittent connectivity.

## Security and data rules — non-negotiable

1. Money calculations, amounts, commission, and transaction status are
   server-only. Never trust client-supplied financial values.
2. Every Supabase table containing user or transactional data needs RLS, with
   its policies included in the same reviewed migration.
3. `commission_config` is configurable data: never hard-code commission rates.
4. Review every migration before applying it. For schema, RLS, or query work,
   read `.claude/rules/rls-and-migrations.md` and `docs/architecture.md` first.
5. Do not expose service-role credentials or personal contact details.

## How to work

- First inspect the affected code and its closest tests; do not rewrite
  unrelated code.
- Use one feature branch and one focused PR per task. Never commit code to
  `main` directly.
- Branches: `feat/<description>`, `fix/<description>`, or `chore/<description>`.
- Use Conventional Commits. Do not mention an AI agent in commits or PR text.
- Before modifying a file in one of these areas, read the matching tracked rule
  in full; it is the shared, versioned source of truth for both agents:
  - `src/app/**/actions.ts`, `src/app/api/**/*.ts`, `src/lib/wompi/**`, or
    `src/lib/alegra/**` → `.claude/rules/money-and-payments.md`.
  - `supabase/migrations/**` → `.claude/rules/rls-and-migrations.md`.
  - `src/**/*.tsx` → `.claude/rules/components.md`.
  - `**/*.test.ts`, `**/*.test.tsx`, or `e2e/**/*.ts` →
    `.claude/rules/testing.md`.
- Apply migrations with `supabase db push`, never a direct Supabase MCP
  migration tool; direct application causes local/remote migration-history drift.
- For auth, RLS, payments, money, payouts, refunds, webhooks, or personal-data
  changes: perform an explicit security review before considering the task done.
- Do not assume Claude-specific subagents, slash commands, or vendored skills
  are available. Those files are useful project references but not a required
  Codex runtime capability.

## Validation

Run the narrowest relevant checks first. Before a PR, run:

```bash
npm run test
npm run build
```

Run `npm run test:e2e` when a changed flow has suitable end-to-end coverage.
Tests live next to source or in `e2e/`; add a regression test for every bug and
cover new conditions and error handling.

## Reference documents

- `docs/current-state.md` — live product state, active/dormant flows, risks.
- `docs/architecture.md` — data model and integration boundaries.
- `docs/project-history.md` — preserved historical phase-by-phase memory.
- `TESTING.md` — detailed testing conventions.
- `README.md` — developer setup; update it when its overview becomes stale.

