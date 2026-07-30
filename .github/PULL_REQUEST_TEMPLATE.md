## What

<!-- One or two sentences: what does this PR change? -->

## Why

<!-- The problem or feature this addresses. Link an issue if there is one. -->

## How

<!-- Brief note on the approach, especially if it wasn't the obvious one. -->

## Checklist

- [ ] Follows the data model and principles in `CLAUDE.md`
- [ ] Money/commission logic (if any) runs server-side only
- [ ] New/changed tables have RLS policies in the same migration
- [ ] `security-reviewer` subagent run if this touches auth/payments/money
- [ ] Lint and build pass locally
- [ ] No secrets or API keys committed

## Screenshots (if UI change)

<!-- Optional -->
