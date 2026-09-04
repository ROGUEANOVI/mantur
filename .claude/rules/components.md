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
- Clickable elements must show `cursor: pointer`. Tailwind's preflight resets
  native `<button>`/`[role="button"]` cursor to `default`; `globals.css`
  restores it globally in `@layer base`, so raw buttons don't need a
  per-instance `cursor-pointer` class. Custom non-button clickables (a `div`
  or `Card` wrapper with `onClick`) still need `cursor-pointer` added
  explicitly, conditioned on whatever makes them actually clickable (see
  `TransporterCardWithModal`).
- Form/action result messaging uses `sonner` toasts, never inline
  success/error banners, `window.alert`/`window.confirm`, or console-only
  feedback. Pattern: call `toast.success(...)` directly where the result is
  known (inside the `useActionState` action callback, or after an `await`);
  surface a returned `{ error }` with
  `useEffect(() => { if (state.error) toast.error(state.error) }, [state.error])`
  (see `DeletePackageForm`, `AdminDocumentLink`). Field-level validation shown
  next to its own input (e.g. `onBlur` phone/name checks) stays inline — this
  rule is about the result of submitting/running an action, not per-field
  validation.
