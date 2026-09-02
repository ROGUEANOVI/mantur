---
paths:
  - "src/**/*.tsx"
---

# Components

- Server Components by default; use a Client Component only where
  interactivity is required (forms, realtime updates, search).
- Use Tailwind design tokens (`text-primary`, `bg-accent`, `bg-background`,
  etc.) defined in `src/app/globals.css` — never hardcode hex values, except
  inside the pin SVG in `ManturLogo.tsx` and in `globals.css` itself.
- Use the `ManturLogo` component wherever the brand mark appears; never
  inline the SVG in page/layout files.
- User-facing copy is Spanish and lives in `src/lib/copy/` — never hardcode
  Spanish strings inside business logic.
- Mobile-first: most real users are on a phone with intermittent
  connectivity.
