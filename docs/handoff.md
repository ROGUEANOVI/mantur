# VayaTur — Estado del proyecto

> Actualiza esta sección al final de cada sesión. Al inicio de la siguiente, lee este archivo primero.

---

## Completado

### Fase 1 — Auth flow (PR #1, merged a `main`)
- Supabase: tabla `profiles` con enum `user_role`, trigger `handle_new_user`, función `is_admin()` (SECURITY DEFINER), trigger `prevent_role_escalation`
- RLS en `profiles`: SELECT y UPDATE solo para el propio usuario o admin; sin INSERT/DELETE políticas (el trigger maneja el INSERT)
- Middleware (`middleware.ts`): refresca sesión en cada request, redirige usuarios autenticados de /login y /signup a /
- Grupos de rutas: `(auth)/` para login/signup, `(app)/` para rutas protegidas
- Server Actions (`src/app/(auth)/actions.ts`): `signIn`, `signUp` (con admin client para actualizar role), `signOut`
- Admin client (`src/lib/supabase/admin.ts`): usa `service_role`, solo servidor, bypasa RLS
- Copy en español (`src/lib/copy/auth.ts`): todas las cadenas de UI separadas de la lógica
- UI: layout de auth con gradiente tropical, formularios con shadcn/ui, selector de rol con cards
- Home placeholder (`(app)/page.tsx`): "Explora Manaure" + botón de sign out

---

## Schema actual (tablas en producción — Supabase)

```
auth.users          → Supabase managed
profiles            → id (FK auth.users), role (user_role), full_name, avatar_url, phone, created_at, updated_at
```

Migración aplicada: `supabase/migrations/20260729000000_create_profiles.sql`

---

## Stack y configuraciones clave

| Ítem | Valor |
|------|-------|
| Next.js | 16.2.12 (App Router) |
| React | 19.2.8 |
| Tailwind | v4.3.3 |
| shadcn/ui | v4 Vega preset (Inter font, Base UI primitives) |
| @supabase/ssr | 0.12.4 |
| @supabase/supabase-js | 2.111.0 |
| Supabase project ref | `ndozquvwgvxmtabqaaba` |
| Llaves Supabase | JWT legacy (`eyJ...`) — NO usar formato `sb_publishable_` |
| Confirm email | **Deshabilitado** en Supabase Dashboard (Auth → Sign In / Providers) |

---

## Decisiones clave (no re-derivar)

- **Admin client** con `service_role` se usa en `signUp` Server Action para actualizar `role` post-signup, porque RLS bloquea UPDATE del trigger recién creado
- **`is_admin()`** es SECURITY DEFINER STABLE para evitar recursión infinita en las políticas RLS
- **`prevent_role_escalation`** es trigger en lugar de RLS WITH CHECK porque RLS no puede comparar `NEW.role` con `OLD.role`
- **Server Components por defecto**; Client Components solo para formularios (LoginForm, SignupForm)
- **`useActionState`** (React 19) para manejar estado de formularios con Server Actions
- **Copy en español** siempre en `src/lib/copy/{domain}.ts`, nunca hardcodeado en componentes

---

## Siguiente sesión — Fase 2: Entidades de contenido

**Branch a crear:** `feat/businesses-schema`

**Tareas en orden:**

1. **db-schema-agent** — Migraciones para:
   - `businesses` (id, owner_id FK profiles, name, description, type, address, lat, lng, images[], verified, commission_rate, status)
   - `places` (id, name, description, type, lat, lng, images[]) — contenido informativo, sin RLS de usuario
   - `experiences` (id, business_id FK businesses, name, description, price, capacity, duration_minutes, status)
   - `commission_config` (id, service_type, rate NUMERIC(5,2), updated_by, updated_at) — editable por admin
   - RLS en todas: businesses (owner ve/edita las suyas; turistas solo SELECT verified), experiences (idem)

2. **Supabase Storage** — bucket `business-images` con políticas (owners suben, todos leen)

3. **ui-agent** — Páginas públicas de listing:
   - `/negocios` — grid de cards de negocios verificados (mobile-first)
   - `/negocios/[id]` — detalle de negocio con sus experiencias
   - `/lugares` — lista de atracciones informativas

4. **ui-agent** — Panel `mi-negocio` (solo `business_owner`):
   - `/mi-negocio` — overview de su negocio
   - `/mi-negocio/experiencias` — CRUD de experiencias

**Archivos relevantes a leer al iniciar:**
- `docs/handoff.md` (este archivo)
- `docs/product-spec.md` — especificación completa del producto
- `CLAUDE.md` — reglas del proyecto
- `supabase/migrations/` — migrations existentes para no repetir tipos/funciones

---

## Repositorio

- GitHub: https://github.com/ROGUEANOVI/vayatur
- Branch principal: `main`
- PR #1: feat(auth): login, signup and protected routes — **merged** ✅
