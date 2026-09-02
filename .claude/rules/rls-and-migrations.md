---
paths:
  - "supabase/migrations/**"
---

# RLS and migrations

- Every table holding user or transactional data ships its RLS policy in the
  same migration — no table without RLS.
- Apply migrations with `supabase db push`, never the Supabase MCP
  `apply_migration` tool. Using MCP to apply directly causes drift between
  local migration history and the remote project (this broke prod once,
  after PR #103 — see project memory `migration_apply_method`).
- Every migration is reviewed before being applied, even in local dev.
- Follow the `supabase-postgres-best-practices` skill (vendored at
  `.claude/skills/supabase-postgres-best-practices/`) for indexing, locking,
  and query-shape guidance.
