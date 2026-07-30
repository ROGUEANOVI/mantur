# VayaTur — Especificación inicial del producto

## 1. Visión
Plataforma web/app que centraliza el turismo en Manaure Balcón del Cesar (Cesar,
Colombia), conectando a tres actores en un modelo transaccional (no solo
directorio informativo):

- **Turistas**: descubren y reservan lugares, experiencias, negocios y
  traslados.
- **Transportistas** (mototaxis/motocarros): reciben solicitudes de traslados
  turísticos.
- **Dueños de negocios** (balnearios, restaurantes, fincas, estaderos):
  gestionan su propio listado y reciben reservas.

Referencia de un MVP previo (directorio informativo, sin transacciones):
https://github.com/everever1617-art/turma — se rescatan sus entidades de
datos y estructura de roles, no su código.

## 2. Principios no negociables (constitution)
1. **Server-side siempre para dinero**: cálculo de comisiones, montos y
   estado de pago se resuelven en Server Actions / Route Handlers — nunca en
   el cliente.
2. **Row Level Security (RLS) activa desde el primer día** en toda tabla de
   Supabase con datos de usuario o transaccionales. Ninguna tabla se crea sin
   su política RLS correspondiente.
3. **Comisión baja inicial (5–10%)** configurable, no hardcodeada — vive en
   una tabla de configuración, no en el código.
4. **Diseño mobile-first**: la mayoría de los usuarios reales entrarán desde
   un celular con conexión intermitente.
5. **Cada entidad rescatada del repo anterior se re-modela en Postgres**
   (relacional), no se copia el esquema de Firestore (documental) tal cual.

## 3. Entidades principales (heredadas y ampliadas del MVP anterior)

| Entidad | Origen | Cambios para el nuevo MVP |
|---|---|---|
| `usuarios` (profiles) | Firestore `usuarios` (rol) | Roles: `turista`, `negocio`, `transportista`, `admin`. Vinculado a `auth.users` de Supabase |
| `negocios` | Firestore `negocios` | + campos de comisión, estado de verificación, cuenta de cobro |
| `lugares` | Firestore `lugares` | Sin cambios mayores, es contenido informativo |
| `experiencias` | Firestore `experiencias` | + precio, cupo, relación con `reservas` |
| `guias` | Firestore `guias` | + tarifa, disponibilidad |
| `motocarros` | Firestore `motocarros` (listado estático) | Se transforma en `transportistas` + flujo de `solicitudes_viaje` (nueva) |
| `reservas` | No existía | **Nueva.** Une turista + negocio/experiencia + estado + monto + comisión |
| `solicitudes_viaje` | No existía | **Nueva.** Turista solicita traslado, transportista acepta/rechaza |
| `transacciones` | No existía | **Nueva.** Registro de pagos (Wompi), estado, referencia |
| `config_comisiones` | No existía | **Nueva.** % de comisión por tipo de servicio, editable por admin |

## 4. Flujos transaccionales mínimos del MVP

1. Turista busca → ve negocio/experiencia → reserva → paga (Wompi sandbox) →
   negocio recibe notificación → comisión se registra automáticamente.
2. Turista solicita traslado → transportistas disponibles lo ven → uno acepta
   → turista ve estado de la solicitud.
3. Dueño de negocio se registra → panel de autogestión (`mi-negocio`,
   rescatado del MVP anterior) → ve sus reservas y el monto neto tras
   comisión.
4. Admin ve dashboard con: reservas totales, comisión generada, negocios
   activos, transportistas activos.

## 5. Fuera de alcance del MVP (fase 2)
- Pagos reales en producción (el MVP usa Wompi en modo sandbox/pruebas)
- Notificaciones push nativas
- Modo offline
- Rutas armadas / paquetes multi-negocio
- Programa de afiliación institucional con la Alcaldía

## 6. Stack técnico
Next.js 16 (App Router) + TypeScript + Tailwind CSS · Supabase (Postgres +
Auth + Storage + RLS) · Wompi (pasarela de pagos, sandbox) · Vercel
(hosting) · shadcn/ui (componentes).
