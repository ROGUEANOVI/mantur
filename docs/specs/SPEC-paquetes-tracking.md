# SPEC: Flujo de paquetes y tracking digital — ManTur

> Documento de trabajo para Claude Code. Ubicación sugerida en el repo: `docs/specs/SPEC-paquetes-tracking.md`.

## 0. Instrucciones para Claude Code

1. **Antes de escribir código**, explora el repo y confirma: versión de Next.js (App Router o Pages), cliente de Supabase usado, nombres reales de tablas/columnas de paquetes, cómo se manejan las migraciones (`supabase/migrations`), sistema de estilos y componentes existentes.
2. Los nombres de tablas y campos de este documento (`packages`, `package_price_tiers`, etc.) son **supuestos**. Adáptalos a lo que exista.
3. Trabaja **por fases**. Al terminar cada fase: resume cambios, lista archivos tocados y espera confirmación antes de la siguiente.
4. Ningún token o secreto en el cliente. Todo lo que hable con Meta Graph API va en servidor (route handler, server action o Supabase Edge Function).
5. No cambies diseño visual más allá de lo necesario; reutiliza componentes existentes.

## 1. Contexto

- Sitio: https://mantur.co — marketplace de turismo en Manaure Balcón del Cesar (Next.js + Supabase).
- Las ventas se cierran principalmente por **WhatsApp** (número: `573001006725`).
- Se va a pautar en **Meta Ads** (clic a WhatsApp + tráfico web) y **Google Ads Search**. Sin medición confiable no se puede optimizar.

### Paquetes actuales

| Slug | Nombre | Precio actual mostrado | Tarifas reales (según descripción) |
|---|---|---|---|
| `cascada-el-chorro-de-la-vela` | Cascada el Chorro de la Vela | $150.000 por persona | $150.000 p/p |
| `fullday-manaure` | FullDay Manaure | $280.000 "precio fijo" | 2 pers: $280.000 total ($140.000 p/p) · 3 pers: $380.000 total (~$126.667 p/p) |
| `escapada-manaure-2d-1n-naturaleza-y-confort` | Escapada Manaure 2D/1N | $190.000 por persona | 2 pers: $235.000 p/p · 6 pers: $190.000 p/p |
| `fullday-casa-de-campo-1-12-personas` | FullDay + Casa de Campo (2D/1N) | $245.000 por persona | Variable según grupo, cupo máx. 12 |

## 2. Problemas detectados

| # | Problema | Impacto |
|---|---|---|
| P1 | El único CTA en detalle es "Inicia sesión para solicitar este paquete" | Bloquea la conversión del tráfico pagado |
| P2 | Precios inconsistentes (total vs. por persona); tarifas por grupo solo en texto libre | Confusión, anuncios con precios engañosos |
| P3 | Sección "Qué incluye" muestra "La información de este paquete se está actualizando" en los 4 paquetes | Página se ve incompleta |
| P4 | Se muestra "Aún no tiene reseñas" | Prueba social negativa |
| P5 | Descripción en un solo bloque de texto; WhatsApp escrito sin enlace | Baja legibilidad en móvil |
| P6 | Páginas de detalle sin meta description ni Open Graph | Links pobres al compartir en WhatsApp/redes, SEO débil |
| P7 | Sin datos estructurados (JSON-LD) | SEO débil |
| P8 | Sin duración, punto de encuentro, dificultad, métodos de pago ni política de cancelación | Preguntas repetidas, fricción en el cierre |
| P9 | Sin GTM / GA4 / Meta Pixel configurados con eventos de negocio | No se puede medir ni optimizar pauta |

---

## FASE 1 — Conversión (prioridad máxima)

### 1.1 CTA sin login (P1)

- CTA primario: **"Reservar por WhatsApp"**, visible sin sesión, sticky en móvil.
- CTA secundario: "Solicitar desde mi cuenta" → si no hay sesión, `/login?next=/paquetes/{slug}/solicitar`.
- Mensaje prellenado: `Hola ManTur, quiero reservar: {nombre} para {personas} personas (ref: {slug})`.

Componente de referencia:

```tsx
'use client';
import { sendGTMEvent } from '@next/third-parties/google';

type Props = { slug: string; nombre: string; precioPorPersona: number; personas?: number };

export function WhatsAppCTA({ slug, nombre, precioPorPersona, personas = 2 }: Props) {
  const texto = `Hola ManTur, quiero reservar: ${nombre} para ${personas} personas (ref: ${slug})`;
  const href = `https://wa.me/573001006725?text=${encodeURIComponent(texto)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        sendGTMEvent({
          event: 'whatsapp_click',
          paquete_id: slug,
          paquete_nombre: nombre,
          value: precioPorPersona * personas,
          currency: 'COP',
        })
      }
    >
      Reservar por WhatsApp
    </a>
  );
}
```

Opcional: selector de número de personas que actualice el precio mostrado y el mensaje.

### 1.2 Precios por tamaño de grupo (P2)

Migración de referencia (adaptar nombres):

```sql
create table package_price_tiers (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references packages(id) on delete cascade,
  min_people int not null check (min_people > 0),
  max_people int not null check (max_people >= min_people),
  price_per_person numeric(12,0) not null check (price_per_person > 0),
  unique (package_id, min_people)
);

alter table package_price_tiers enable row level security;
create policy "tiers_public_read" on package_price_tiers for select using (true);
-- Escritura solo para admins: replicar la política que ya usen en `packages`.

create view packages_with_price as
select p.*, min(t.price_per_person) as price_from
from packages p
left join package_price_tiers t on t.package_id = p.id
group by p.id;
```

- Seed con las tarifas de la tabla de la sección 1.
- UI: listado y detalle muestran **"Desde $X por persona"**; el detalle muestra tabla de tarifas por grupo.
- Formato COP: `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`.
- Ajustar el panel de administración de paquetes (si existe) para gestionar tarifas.

### 1.3 Reseñas (P4)

- Si `reviews_count === 0`, no renderizar el bloque de reseñas.

**Criterios de aceptación Fase 1**
- [ ] Un usuario sin sesión puede iniciar la reserva por WhatsApp desde cualquier paquete.
- [ ] Ningún paquete muestra "precio fijo"; todos muestran "Desde $X por persona".
- [ ] No aparece "Aún no tiene reseñas".
- [ ] RLS activa en tablas nuevas.

---

## FASE 2 — Contenido estructurado del paquete (P3, P5, P8)

Agregar a `packages` (adaptar):

```sql
alter table packages
  add column summary text,
  add column includes text[] not null default '{}',
  add column stops text[] not null default '{}',
  add column duration_hours numeric(4,1),
  add column meeting_point text,
  add column difficulty text check (difficulty in ('baja','media','alta')),
  add column what_to_bring text[] not null default '{}',
  add column payment_info text,
  add column cancellation_policy text;
```

- Migrar el contenido actual de la descripción a estos campos (script o seed; pedir confirmación del texto final al usuario).
- Detalle del paquete en este orden: galería → nombre + resumen (2 líneas) → precio desde + CTA → paradas → qué incluye (checklist) → horario/duración/punto de encuentro/dificultad → qué llevar → tarifas por grupo → pagos y cancelación.
- Eliminar el placeholder "La información de este paquete se está actualizando"; si `includes` está vacío, ocultar la sección.

**Criterios de aceptación Fase 2**
- [ ] Ningún paquete muestra placeholders.
- [ ] Toda la información de la descripción vive en campos estructurados.

---

## FASE 3 — SEO técnico (P6, P7)

- `metadataBase: new URL('https://mantur.co')` en el layout raíz.
- `generateMetadata` en `/paquetes/[slug]`: title, description con precio desde, canonical, Open Graph (imagen 1200×630, `locale: es_CO`).
- JSON-LD `TouristTrip` con `itinerary` (ItemList de `TouristAttraction`), `offers` por tarifa (con `eligibleQuantity`) y `provider` `TravelAgency`.
- Escapar `<` en el JSON-LD (`.replace(/</g, '\\u003c')`).
- Verificar `sitemap.xml` incluye los paquetes.

**Criterios de aceptación Fase 3**
- [ ] Rich Results Test de Google sin errores en los 4 paquetes.
- [ ] Al pegar un link de paquete en WhatsApp aparece imagen, título y descripción.

---

## FASE 4 — Tracking web (P9)

### 4.1 Instalación
- GTM con `@next/third-parties/google` en el layout raíz; ID en `NEXT_PUBLIC_GTM_ID`.
- GA4 y Meta Pixel se configuran **dentro de GTM** (no hardcodear en el código).

### 4.2 Eventos `dataLayer`

| Evento dataLayer | Dónde | Parámetros | GA4 | Meta Pixel |
|---|---|---|---|---|
| `view_item_list` | `/paquetes` | `items[]` | `view_item_list` | — |
| `view_item` | `/paquetes/[slug]` | `paquete_id`, `paquete_nombre`, `value`, `currency` | `view_item` | `ViewContent` |
| `whatsapp_click` | CTA WhatsApp (cualquier página) | `paquete_id`, `paquete_nombre`, `value`, `currency` | `generate_lead` (evento clave) | `Contact` |
| `request_submit` | Solicitud desde cuenta enviada | `paquete_id`, `value`, `currency` | `generate_lead` | `Lead` |

- Crear un helper tipado `track(event, params)` que haga `dataLayer.push` y evite duplicados en re-renders.
- Capturar y persistir UTMs (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`) + `gclid` + `fbclid` en `sessionStorage` en la primera visita; adjuntarlos a las solicitudes de paquete.

### 4.3 Consentimiento
- Revisar la política de privacidad existente; si no hay banner de cookies, implementar uno simple con Google Consent Mode v2 (Ley 1581 de Colombia).

**Criterios de aceptación Fase 4**
- [ ] Eventos visibles en GTM Preview y en GA4 DebugView.
- [ ] Meta Pixel Helper muestra `ViewContent` y `Contact`.
- [ ] UTMs persisten hasta la solicitud.

---

## FASE 5 — Registro de ventas y Conversions API (WhatsApp)

> **Condicional:** el envío de compras a Meta con `ctwa_clid` requiere **WhatsApp Cloud API** (o un BSP). Preguntar al usuario qué usa antes de empezar. Si usa la app de WhatsApp Business, implementar solo 5.1 y dejar 5.2 preparado.

### 5.1 Tabla de reservas/leads

```sql
create table bookings (
  id uuid primary key default gen_random_uuid(),
  package_id uuid references packages(id),
  customer_name text,
  customer_phone text,
  people int check (people > 0),
  value_cop numeric(12,0),
  status text not null default 'lead' check (status in ('lead','quoted','paid','cancelled')),
  source text,            -- meta_ctwa | meta_web | google | organic | referral
  utm jsonb,
  ctwa_clid text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table bookings enable row level security;
-- Solo admins leen/escriben.
```

- Vista simple en el panel admin para registrar leads y marcar `paid`.

### 5.2 Envío de compras a Meta (servidor)

- Webhook de WhatsApp Cloud API: si el primer mensaje trae `messages[0].referral.ctwa_clid`, crear/actualizar `bookings` con `source = 'meta_ctwa'`.
- Al pasar un booking a `paid` → enviar `Purchase` a Meta (route handler o Edge Function):

```python
# Referencia de payload (implementar en el lenguaje del backend)
payload = {"data": [{
    "event_name": "Purchase",
    "event_time": int(time.time()),
    "event_id": booking_id,                     # deduplicación
    "action_source": "business_messaging",
    "messaging_channel": "whatsapp",
    "user_data": {"whatsapp_business_account_id": WABA_ID, "ctwa_clid": ctwa_clid},
    "custom_data": {"currency": "COP", "value": value_cop},
}]}
# POST https://graph.facebook.com/{version}/{DATASET_ID}/events?access_token={TOKEN}
```

- Variables de entorno (solo servidor): `META_DATASET_ID`, `META_CAPI_TOKEN`, `WABA_ID`, `META_GRAPH_VERSION`.
- Registrar respuesta de Meta y reintentar con backoff ante errores 5xx.
- Para ventas desde la web (no CTWA): enviar `Purchase` con `action_source: "website"` y datos de usuario hasheados (SHA-256 de teléfono normalizado) + `fbp`/`fbc` si existen.

**Criterios de aceptación Fase 5**
- [ ] Un booking marcado `paid` aparece como `Purchase` en el Events Manager (usar Test Events).
- [ ] Ningún secreto expuesto en el bundle del cliente.

---

## Convención UTM (para referencia en anuncios)

`utm_source=meta|google` · `utm_medium=paid_social|cpc` · `utm_campaign=mt_{objetivo}_{paquete}_{aaaamm}` · `utm_content={id_creativo}`

## Fuera de alcance (por ahora)

- Pasarela de pagos online.
- Catálogo de Meta / Performance Max.
