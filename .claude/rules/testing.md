---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "e2e/**/*.ts"
---

# Testing

- Tests live next to source (`foo.ts` → `foo.test.ts`) or under `e2e/`.
- Write a corresponding test for every new function.
- Write a regression test for every bug fix.
- Test the error path whenever error handling is added.
- Test both branches of every conditional (if/else, switch).
- Never commit code that makes an existing test fail.
- Full conventions: `TESTING.md`.
