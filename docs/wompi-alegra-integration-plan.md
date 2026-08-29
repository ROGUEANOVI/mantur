# Plan: Integración Wompi + Alegra + Paquetes/Tours (operador turístico)

## Context

ManTur Turismo S.A.S. presentó el 2026-08-24 el documento de constitución, ya
visible en el RUES. A fecha 2026-08-29 la parte legal/bancaria ya avanzó:
NIT definitivo asignado (902098141), cuenta de ahorros empresarial
Bancolombia abierta a nombre de MANTUR TURISMO S A S, y el comercio ya está
dado de alta en el dashboard de Wompi (`comercios.wompi.co`) con la cuenta de
desembolso vinculada a esa cuenta Bancolombia — el propio panel de Wompi
muestra el aviso estándar "ya puedes cobrar a tus clientes... podrás retirar
cuando aprobemos tu comercio, en máximo 3 días hábiles", es decir la
aprobación final del comercio está en curso pero ya no bloquea el registro.
El panel de Wompi confirma además que **"Pagos a Terceros"** (el producto de
dispersión/payouts elegido en §5) ya aparece como opción disponible en su
navegación — no requiere una solicitud de producto aparte, solo activarlo.
Falta aún confirmar el registro RNT como agencia operadora (condición para
des-flaggear paquetes, ver §7) y la habilitación de Alegra como facturador
electrónico ante la DIAN. Mientras eso último se resuelve, queremos dejar
completamente diseñada — a nivel de esquema, flujos, y checklist operativo —
la integración de:

1. **Wompi** como pasarela de pago real (hoy el pago está simulado).
2. **Alegra** como software de facturación electrónica (hoy no existe ninguna
   integración de facturación).
3. Un motor de **devoluciones/cancelaciones** seguro y auditable.
4. La funcionalidad de **paquetes/tours** que ManTur ofrecerá como operador
   turístico (hoy solo existe el modelo de intermediario: negocios, guías y
   transportadores publican sus propios servicios).

El objetivo de este documento es que, el día que CCV + DIAN + RNT estén
completos, solo quede *ejecutar* — no *diseñar* — la implementación.

**Decisiones de negocio ya tomadas con el founder** (ver §5):
payouts automatizados vía Wompi Payouts desde el día uno; política de
cancelación con ventanas fijas definidas por ManTur, inspirada en operadores
turísticos de referencia (Civitatis, Airbnb, GetYourGuide); los paquetes son
inventario propio de ManTur como operador (no de negocios individuales);
monetizar transporte queda fuera de alcance de este plan.

---

## 1. Estado actual del código (línea base)

Confirmado por exploración directa del repo (`supabase/migrations/`,
`src/app/(app)/reservas/actions.ts`, `src/lib/copy/legal.ts`):

- **`bookings`** (`20260730200000_create_bookings_transactions.sql`, luego
  extendida en `20260802000000` y `20260818100000_rename_experiences_to_services.sql`):
  `service_id` (nullable) XOR `guide_tour_id` (nullable), `tourist_id`,
  `business_id` denormalizado, `quantity`, `booking_date`, `total_amount`,
  `status` (`pending_payment|confirmed|cancelled|completed`), `notes`.
  RLS: tourist ve lo suyo, business owner/guía ven lo suyo, admin ve todo;
  INSERT solo como `status='pending_payment'`; UPDATE/DELETE solo admin.
- **`transactions`** (misma migración): 1:1 con `bookings` (`booking_id UNIQUE`),
  `wompi_reference UNIQUE` (ya pensado para deduplicar webhooks),
  `wompi_link_id`/`wompi_link_url` (nunca usados aún), `status`
  (`pending|paid|failed|voided`), `amount_in_cents`, `currency`,
  `commission_rate`/`commission_amount_cents` (snapshot inmutable al crear).
  RLS: las 4 operaciones son admin-only — el cliente nunca lee esta tabla,
  siempre lee `bookings.status`.
- **`commission_config`** + RPC `get_commission_rate()` (SECURITY DEFINER,
  solo `service_role`): filas actuales `tour_activity, lodging, event_rental,
  pasadia, transport, business, guide_tour`, todas al 10% hoy, editable en
  `/admin/comisiones`. `transport` existe pero **ningún código la usa** —
  `transport_requests` no tiene columna de precio ni fila en `transactions`.
- **Flujo actual (`src/app/(app)/reservas/actions.ts`):** `createBooking` y
  `createGuideTourBooking` insertan la reserva directamente con
  `status: 'confirmed'` y la transacción con `status: 'paid'` — el pago está
  simulado, no hay llamada real a Wompi. El propio comentario en el código
  (línea ~100) ya documenta el cambio pendiente: pasar a `pending_payment` y
  redirigir a un link de pago Wompi real.
- El insert de `bookings` + `transactions` se hace en dos pasos con rollback
  manual (si falla la transacción, se borra la reserva) — deuda técnica ya
  registrada (`docs/handoff.md`, ítem M-1) que debemos resolver como parte de
  este trabajo, porque un webhook real escribirá en estas tablas de forma
  concurrente y necesitamos atomicidad real.
- **Cero referencias a Wompi en código real**: sin `WOMPI_*` en
  `.env.local.example`, sin cliente/SDK, sin Route Handler de webhook
  (`src/app/api/` no existe todavía). El copy legal (`src/lib/copy/legal.ts`)
  ya menciona Wompi correctamente a nivel de usuario final y no necesita
  cambios.
- **Cero referencias a Alegra** en ningún lado del repo — 100% greenfield.
- **Cero referencias a "paquete"/"tour operator"** en código o esquema — solo
  mencionado como fuera de alcance en `CLAUDE.md` y `docs/product-spec.md`.
  El precedente reutilizable más cercano es `service_types` (catálogo con
  `pricing_unit` + `attributes jsonb` por tipo), creado en
  `20260818000000_create_service_types.sql`.
- **Cumplimiento RNT ya modelado** para negocios, guías y transportadores
  (`20260821000000_add_compliance_verification.sql`): columnas
  `rnt_number`, `rnt_expiry_date`, `rnt_document_path`, `rnt_status`
  (`pending_review|verified|rejected`), `rnt_verified_by/at`. El registro RNT
  de **ManTur mismo como operador** (el que están tramitando) es análogo pero
  a nivel de empresa, no de proveedor — no existe aún una tabla para esto
  porque nunca hizo falta modelar "la propia plataforma" como entidad
  verificada. Lo resolvemos con una bandera de configuración simple (ver §6).

---

## 2. Prerrequisitos legales/administrativos (checklist, no-código)

Bloquean la activación en producción, no el desarrollo — se puede construir
todo esto contra el **sandbox** de Wompi y Alegra ya mismo.

- [x] NIT definitivo (DIAN): 902098141.
- [x] Cuenta bancaria empresarial a nombre de MANTUR TURISMO S A S
      (Bancolombia, cuenta de ahorros) — confirmada en Sucursal Virtual
      Negocios 2026-08-29.
- [x] Registro en Wompi como persona jurídica (`comercios.wompi.co`) —
      comercio "MANTUR TURISMO S A S" ya existe, cuenta de desembolso
      vinculada a la cuenta Bancolombia de arriba, métodos de pago
      (tarjetas, Nequi, PSE, Botón Bancolombia, Bancolombia QR, Daviplata,
      SU+Pay) ya habilitados. **Pendiente**: aprobación final del comercio
      por parte de Wompi (banner propio del dashboard: máx. 3 días hábiles
      desde el alta) — no bloquea desarrollo, solo el primer retiro real.
- [x] "Pagos a Terceros" (el producto de dispersión elegido en §5) ya
      aparece disponible en el dashboard de Wompi — falta solo activarlo
      formalmente y obtener sus credenciales propias (`x-api-key` +
      `user-principal-id`) cuando se implemente §5.
- [ ] RUT en estado ACTIVO, sin clave de apertura, con marca de agua
      "CERTIFICADO"/"COPIA CERTIFICADO" — confirmar que quedó anexado
      correctamente en Wompi si la aprobación del comercio se demora más
      de 3 días hábiles (causa más común de rechazo).
- [ ] Repetir/confirmar credenciales de **sandbox** de Wompi (llaves
      distintas a las de producción) para poder desarrollar y probar sin
      tocar el comercio real ya vinculado a dinero real.
- [x] RNT de ManTur como **agencia de viajes operadora** — RNT #299376,
      subcategoría "AGENCIA DE VIAJES OPERADORAS", estado **ACTIVO**
      (inscripción aprobada 27/ago/2026, Cámara de Comercio de Valledupar).
      Esta es la condición legal que habilitaba §7 (paquetes) — **ya
      cumplida**, la bandera de §7 puede quedar condicionada solo a que el
      desarrollo esté listo, no a este trámite.
- [ ] RNT de ManTur como **"Plataforma electrónica o digital"** (la
      subcategoría que cubre el rol de intermediario/marketplace en sí,
      distinta de la de operador) — radicado #40412, estado **"Inscripción:
      en trámite"** en `rnt.confecamaras.co`. No bloquea el desarrollo de
      este plan (el rol de intermediario ya opera hoy sin ella), pero
      conviene darle seguimiento porque formaliza el negocio actual de
      ManTur (reservas de negocios/guías) igual que el RNT operador formaliza
      los paquetes. Recordar la nota del propio RNT: toda inscripción debe
      renovarse cada año entre el 1 de enero y el 31 de marzo o se suspende
      automáticamente el 1 de abril.
- [x] Cuenta Alegra creada (`app.alegra.com`, empresa "MANTUR..." ya
      seleccionada) — 2026-08-29. El menú lateral ya trae Ingresos, Gastos,
      Contactos, Inventario, Bancos, Contabilidad, Reportes, Nómina, POS y
      CRM, es decir quedó en un plan con módulos amplios (no el plan mínimo
      "Solo Facturación"), lo cual probablemente ya cubre la condición de
      "Integración con otras aplicaciones" que exige la API — **confirmar
      esto puntualmente en Configuración → Integraciones/API antes de
      implementar §6**.
- [ ] **Habilitación como facturador electrónico ante la DIAN** — todavía
      pendiente: el propio checklist de onboarding de Alegra muestra "Crea
      tu primera factura", "Facturación electrónica" y "Habilitar factura
      electrónica" como pasos sin completar (0 de 4). Sin este paso, las
      facturas creadas por API quedarán en un estado no válido ante la DIAN
      — es un bloqueante real para el §6.3 paso 3 (webhook de
      reconciliación), no solo un detalle administrativo.
- [x] Acceso a integraciones de Alegra confirmado (`mi.alegra.com/integrations`)
      — el plan sí las incluye. Ya se activaron **Wompi** y **Bre-B** desde
      ahí (2026-08-29). **Importante para la arquitectura**: esa integración
      nativa Wompi↔Alegra ("Integra tu cuenta con Alegra para recibir pagos
      con Nequi y Bancolombia") es para el flujo de cobro/reconciliación
      tipo POS/link-de-pago de Alegra, **no** sustituye la integración por
      API descrita en §6 — nuestras reservas se cobran desde el checkout
      propio de ManTur, así que la factura debe crearse por API en el
      momento en que nuestro propio webhook de Wompi confirma el pago, no
      por el lado de Alegra. Mantenerla activa igual es útil como respaldo
      de conciliación y para cualquier cobro manual que se haga directamente
      desde Alegra fuera de la plataforma.
- [ ] Generar el token de API de Alegra (`ALEGRA_USER` + `ALEGRA_TOKEN`)
      desde `developer.alegra.com` cuando se implemente §6.
- [ ] **Revisión con abogado/contador**: la estructura contractual entre
      ManTur y cada negocio/guía/transportador (mandato o comisión mercantil)
      debe quedar clara para que ManTur, al recaudar el 100% del pago del
      turista y luego pagar la parte del prestador, no quede clasificada como
      intermediario de pagos regulado (aggregator) ante la Superintendencia
      Financiera. El patrón "marketplace cobra en su propia cuenta y le debe
      el pago al proveedor como cuenta por pagar" es el estándar de la
      industria, pero debe quedar respaldado en los términos y condiciones
      y/o contratos de vinculación de cada rol.
- [ ] Actualizar `src/lib/copy/legal.ts` línea 73 ("ManTur aún no está
      constituida como una entidad legal registrada") una vez CCV/DIAN estén
      completos — cambio de copy trivial, no bloquea nada técnico.

---

## 3. Arquitectura de referencia — decisiones clave

| Decisión | Elegido | Por qué |
|---|---|---|
| ¿Quién recibe el 100% del pago del turista? | ManTur (comerciante único ante Wompi) | Wompi no tiene "split" nativo de pagos en el checkout; el modelo estándar de marketplace es cobrar completo y pagar al proveedor aparte. |
| ¿Cómo se le paga al proveedor su parte? | **Wompi Payouts (dispersión) automatizado desde el día 1** | Elegido explícitamente por el founder. Se integra `POST /v2/payouts` (o `/payouts/file` para lotes) con `x-api-key` + `user-principal-id` + `idempotency-key` propios de Payouts (alta separada del checkout). |
| ¿Fuente de verdad del estado de pago? | El **webhook** de Wompi, nunca el redirect del navegador | Confirmado como decisión de arquitectura ya documentada en `docs/roadmap-aprendizaje.md`; Wompi mismo lo advierte explícitamente en su doc de checkout ("Do not use the redirection as a validation method"). |
| ¿Política de cancelación? | **Ventanas fijas definidas por ManTur**, ver §5 | Elegido por el founder, inspirado en Civitatis/Airbnb/GetYourGuide. |
| ¿De quién es el inventario de paquetes? | **ManTur como operador** | Elegido por el founder — es justamente lo que habilita el RNT de operador que están tramitando. |
| ¿Se monetiza transporte en este plan? | **No, fuera de alcance** | Elegido por el founder — `transport_requests` sigue siendo logística pura, pago en efectivo fuera de la plataforma. |
| ¿Atomicidad booking+transaction? | RPC Postgres única (`create_booking_with_transaction`) | Necesario antes de introducir un webhook que escribe concurrentemente en ambas tablas; resuelve además la deuda técnica M-1 ya registrada. |

---

## 4. Integración Wompi (pagos)

### 4.1 Variables de entorno nuevas (agregar a `.env.local.example` + README)

```
WOMPI_PUBLIC_KEY=            # pub_sandbox_... / pub_prod_...  (también expuesta como NEXT_PUBLIC_WOMPI_PUBLIC_KEY para el widget)
WOMPI_PRIVATE_KEY=           # priv_sandbox_... / priv_prod_...  (Bearer, solo server-side)
WOMPI_INTEGRITY_SECRET=      # para el hash de integridad del checkout
WOMPI_EVENTS_SECRET=         # para validar X-Event-Checksum en el webhook
WOMPI_PAYOUTS_API_KEY=       # alta separada de Payouts/Dispersión
WOMPI_PAYOUTS_USER_PRINCIPAL_ID=
```

### 4.2 Flujo de checkout (reemplaza el pago simulado)

1. `createBooking` / `createGuideTourBooking` siguen validando todo
   server-side igual que hoy (precio, capacidad, fecha, tarifa de comisión
   vía `get_commission_rate()`), pero en vez de insertar directo:
2. Llaman a la nueva RPC `create_booking_with_transaction(...)` — inserta
   `bookings` (`status='pending_payment'`) y `transactions`
   (`status='pending'`) en una sola transacción SQL, devuelve ambos IDs.
   Esto reemplaza el patrón actual de insert-y-rollback-manual.
3. El Server Action calcula el **hash de integridad**
   `SHA256(reference + amount_in_cents + currency + WOMPI_INTEGRITY_SECRET)`
   (usar `booking.id` como `reference`, ya es único) y redirige al Web
   Checkout de Wompi (`checkout.wompi.co/p/?...` o el widget embebido) en vez
   de ir directo a `/reservas/[id]/confirmacion`.
4. Wompi redirige de vuelta con `?id=<wompi_transaction_id>` — esa página
   **solo muestra un estado "verificando pago"**, nunca marca nada como
   pagado; el estado real llega por webhook.

### 4.3 Webhook handler (nuevo, greenfield)

Nuevo Route Handler: `src/app/api/webhooks/wompi/route.ts` (POST).

- Verifica `X-Event-Checksum` recalculando
  `SHA256(<valores de event.data.transaction[properties] en orden> + timestamp + WOMPI_EVENTS_SECRET)`
  — los `properties` a concatenar vienen listados dentro del propio evento,
  no hay que hardcodearlos.
- Idempotencia: `transactions.wompi_reference` ya tiene `UNIQUE` — el handler
  hace `UPDATE ... WHERE wompi_reference IS NULL OR wompi_reference = $1`
  usando `createAdminClient()`, así una entrega duplicada del mismo evento
  (Wompi reintenta hasta 3 veces en 24h si no respondes 200) no genera dos
  actualizaciones conflictivas.
- Mapea `event.data.transaction.status`:
  - `APPROVED` → `transactions.status='paid'` + `bookings.status='confirmed'`
    (en la misma transacción SQL vía otra RPC, `mark_transaction_paid`).
  - `DECLINED`/`ERROR` → `transactions.status='failed'` + `bookings.status='cancelled'`.
  - `VOIDED` → ver flujo de reembolsos, §5.
- Siempre responde `200` rápido (Wompi espera confirmación; el trabajo pesado
  como disparar la factura Alegra o el payout puede encolarse o ejecutarse
  después de confirmar el update de estado).
- Loggear cada evento recibido (tabla ligera `payment_events_log` o similar)
  para poder reconciliar manualmente si algo falla — no confiar solo en el
  estado final de `transactions`.

### 4.4 Wompi Payouts (dispersión automática al proveedor)

- Alta separada del checkout (`x-api-key` + `user-principal-id` propios de
  Payouts).
- Disparo: cuando `transactions.status` pasa a `paid` (dentro del mismo
  webhook, después de confirmar el pago), calcular
  `amount_in_cents - commission_amount_cents` y encolar un payout hacia la
  cuenta bancaria registrada del negocio/guía (nuevo campo — hoy no existe
  ninguna cuenta bancaria almacenada para negocios ni guías, hay que
  agregarla en su perfil/onboarding).
- Usar `idempotency-key` = `transactions.id` para que un reintento nunca
  duplique el pago al proveedor.
- Nueva tabla `provider_payouts`: `id`, `transaction_id` (FK, UNIQUE),
  `recipient_type` (`business|guide`), `recipient_id`, `amount_cents`,
  `wompi_payout_id`, `status` (`pending|sent|paid|failed`), timestamps.
  RLS admin-only, igual que `transactions`.
- Cada negocio/guía necesita capturar datos bancarios (tipo/número de cuenta,
  banco, tipo de identificación) durante `approveRoleRequest` o en su panel
  de perfil — extensión de esquema pequeña sobre `businesses`/`tourist_guides`.

### 4.5 Testing

- Extender `src/app/(app)/reservas/actions.test.ts` para los nuevos estados
  iniciales (`pending_payment`/`pending`) y el redirect al checkout en vez de
  a confirmación directa.
- Nuevo `src/app/api/webhooks/wompi/route.test.ts`: checksum válido/ inválido,
  idempotencia (mismo `wompi_reference` dos veces), cada transición de
  estado, y que un checksum inválido nunca modifique la BD.
- Test de la RPC `create_booking_with_transaction` (o su wrapper) para
  atomicidad: forzar un fallo en el segundo insert y confirmar rollback
  completo.
- Test de cálculo de payout (monto neto correcto, idempotency-key estable).

---

## 5. Motor de devoluciones/cancelaciones

### 5.1 Política default (ventanas fijas, inspirada en Civitatis/Airbnb/GetYourGuide)

Nueva tabla `refund_policy_config` (mismo espíritu que `commission_config` —
dato editable, no constante en código):

| Ventana antes de `booking_date` | % reembolso |
|---|---|
| ≥ 72 horas | 100% |
| 24–72 horas | 50% |
| < 24 horas / no-show | 0% |
| Cancelado por ManTur, negocio, guía o servicio no prestado | 100% siempre |

Esto refleja el patrón común de la industria (Civitatis/GetYourGuide: "gratis
hasta X", Airbnb: reembolso completo en las primeras 48h de reservado y
tiers decrecientes después). Queda como fila editable en
`/admin/comisiones`-style page nueva (`/admin/reembolsos` o extensión de la
existente) para que ManTur pueda ajustar las ventanas sin deploy.

### 5.2 Flujo técnico

1. Turista solicita cancelación desde `/mis-reservas` (nuevo botón/acción,
   reemplaza o extiende el cancel ya existente para transporte).
2. Server Action calcula horas restantes hasta `booking_date`, resuelve el %
   contra `refund_policy_config`, y crea una fila en nueva tabla
   `refund_requests`: `booking_id`, `transaction_id`, `requested_by`,
   `refund_percentage`, `refund_amount_cents`, `status`
   (`pending|processed|rejected`), `reason`, timestamps.
3. Si la tarjeta fue cobrada **el mismo día** → intentar **void** vía Wompi
   (`POST /v1/transactions/{id}/void`, disponible solo mientras el banco
   emisor lo permita).
4. Si ya pasó el día o el reembolso es parcial → Wompi solo soporta reembolso
   total con tarjeta (VISA/MASTERCARD/AMEX vía Redeban/Credibanco, y solo si
   ManTur tiene saldo "Disponible"); para reembolsos **parciales** o cuando
   el saldo no alcanza, el flujo cae a **transferencia bancaria manual** por
   el admin (mismo patrón que los payouts, pero en sentido turista) —
   registrar esto en `refund_requests.status` y notificar por correo
   (ya existe integración con Resend).
5. Al confirmarse el reembolso (webhook de void o marca manual del admin):
   `transactions.status='voided'`, `bookings.status='cancelled'`, y si ya se
   había pagado al proveedor vía Payouts, generar un registro de "recobro"
   pendiente (nota en `provider_payouts` o tabla de ajustes) — este es un
   caso borde real (proveedor ya cobrado, turista pide reembolso después) que
   hay que decidir cómo se recupera (descontar de un futuro payout, o
   aceptarlo como costo si el prestador ya prestó el servicio parcialmente).
6. Si aplica factura electrónica ya emitida (ver §6), disparar una **nota
   crédito** en Alegra referenciando la factura original.

### 5.3 Testing

- Cálculo de porcentaje de reembolso para cada ventana (72h+, 24-72h, <24h,
  cancelado por proveedor).
- Idempotencia del webhook de void.
- Caso borde: reembolso solicitado después de que el payout al proveedor ya
  se ejecutó.

---

## 6. Integración Alegra (facturación electrónica)

### 6.1 Alcance y plan

- API de Alegra no tiene costo adicional, pero requiere un plan con
  "Integración con otras aplicaciones" habilitada — confirmar en el signup;
  dado que ManTur ya necesita llevar contabilidad como S.A.S., evaluar
  directamente el plan de **Contabilidad Pyme o Pro** (incluye POS sin costo
  extra, aunque ManTur no lo necesita) en vez del plan más barato de "solo
  facturación", que probablemente no incluye la integración por API.
- Autenticación: usuario + token de API (`ALEGRA_USER` + `ALEGRA_TOKEN`),
  headers estándar, JSON. Endpoints clave: `POST /invoices`,
  `GET/POST /contacts`, `POST /credit-notes`, `POST /webhooks-subscriptions`.

### 6.2 Variables de entorno nuevas

```
ALEGRA_USER=
ALEGRA_TOKEN=
ALEGRA_WEBHOOK_URL=          # nuestro endpoint receptor
```

### 6.3 Flujo

1. **Sincronización de contacto**: al confirmarse el pago (mismo punto del
   webhook de Wompi que marca `transactions.status='paid'`), buscar o crear
   el contacto en Alegra usando el documento de identidad del turista
   (nuevo campo si no existe ya — confirmar si `profiles` guarda cédula;
   si no, agregarlo como parte de este trabajo, requerido para factura DIAN
   válida). Guardar `alegra_contact_id` en `profiles` para no recrearlo cada
   vez.
2. **Creación de factura**: `POST /invoices` con un ítem por reserva
   (nombre del servicio/tour, cantidad, precio unitario), impuestos según
   corresponda (confirmar con contador si los servicios turísticos de
   ManTur llevan IVA o están excluidos/exentos — no asumir en el código).
   Guardar `alegra_invoice_id` y `alegra_invoice_status` en `transactions`.
3. **Webhook de reconciliación**: suscribirse a `invoices.emissionFinished`
   (`POST /webhooks-subscriptions`, requiere responder 2XX en <5s a la
   verificación inicial de Alegra) en un nuevo Route Handler
   `src/app/api/webhooks/alegra/route.ts` — actualiza
   `alegra_invoice_status` a `emitted`/`rejected` según el resultado real
   ante la DIAN (la creación vía API no garantiza aceptación DIAN inmediata).
4. **Nota crédito en reembolsos**: cuando `refund_requests.status='processed'`
   y existe `alegra_invoice_id`, disparar `POST /credit-notes` referenciando
   la factura original.

### 6.4 Módulos adicionales de Alegra a evaluar (no bloquean el MVP de esta integración)

- **Contabilidad**: recomendable adoptar igual, ya que ManTur como S.A.S.
  necesita libros contables — sinergia natural con la facturación.
- **Nómina electrónica**: solo si ManTur contrata empleados formalmente;
  diferir hasta que aplique.
- **Inventario/POS**: no aplica — ManTur no vende inventario físico ni opera
  puntos de venta presenciales. La alianza nativa Wompi×Alegra está pensada
  para POS presencial (QR/Nequi conciliados automáticamente en tienda física)
  y **no aplica al checkout online de ManTur** — por eso integramos Wompi y
  Alegra cada uno por su API propia en vez de depender de esa alianza.

### 6.5 Testing

- Mock de creación de contacto (encontrar existente vs. crear nuevo).
- Mock de creación de factura con impuestos correctos.
- Test de nota crédito disparada correctamente en reembolso.
- Test del webhook de reconciliación (firma/autenticación de Alegra, si
  aplica un secreto — confirmar en `developer.alegra.com` al implementar).

---

## 7. Paquetes/Tours (ManTur como operador turístico)

El RNT de agencia operadora (#299376) ya está **ACTIVO** — la condición legal
para vender paquetes propios está cumplida. Aun así, construir todo detrás de
una bandera de configuración (`platform_config.packages_enabled` o similar,
análogo a un `commission_config`) para poder mergear e ir probando el código
en producción de forma controlada (soft-launch) antes de anunciar la
funcionalidad públicamente.

### 7.1 Esquema nuevo

- **`packages`**: `id`, `name`, `description`, `base_price` (precio de venta
  al turista, fijo, NO calculado sumando componentes), `pricing_unit`,
  `capacity`, `is_active`, `attributes jsonb` (mismo patrón flexible que
  `service_types`/`services`), timestamps. Sin `owner_id` de negocio — es
  inventario de ManTur, gestionado desde `/admin/paquetes` (nueva página,
  mismo patrón que `/admin/lugares`/`/admin/categorias`).
- **`package_items`**: junction — `package_id`, tipo de componente
  (`service_id` o `guide_tour_id`, incluso transporte queda excluido por
  ahora), `internal_cost_cents` (lo que ManTur le paga al proveedor por su
  parte, negociado aparte — **no** es un porcentaje de comisión, es costo
  directo), `quantity_included`. Esto es la pieza central del modelo
  "operador": el margen de ManTur en un paquete es
  `base_price - Σ(internal_cost_cents)`, no un `commission_rate` de tabla.
- **Extender `bookings`**: agregar `package_id` (nullable, FK), y ampliar el
  CHECK/trigger XOR actual (`service_id` XOR `guide_tour_id`) a una
  constraint de "exactamente uno de tres" — mismo patrón ya usado cuando se
  agregó `guide_tour_id` como segunda opción en
  `20260802000000_create_tourist_guides.sql`.
- **Payout por paquete vendido**: cuando un paquete se vende y se confirma el
  pago, generar tantas filas en `provider_payouts` como `package_items` tenga
  (una por proveedor involucrado), cada una por su `internal_cost_cents` —
  reutiliza la infraestructura de Payouts de §4.4, no es un sistema nuevo.

### 7.2 UX

- `/paquetes` — listado público (mismo patrón visual que `/negocios`/`/guias`:
  cards, filtros, paginación).
- `/paquetes/[id]` — detalle con desglose de qué incluye (sin exponer el
  costo interno negociado, solo el precio final al turista).
- `/mi-perfil-admin` o extensión de `/admin` — CRUD de paquetes y asignación
  de `package_items` con su costo interno.
- Reutilizar `MediaGallery`/gestor de medios existente para fotos/videos del
  paquete (mismo bucket pattern que `business-images`/`business-videos`).

### 7.3 Testing

- Constraint de "exactamente uno de tres" en `bookings` (service/guide_tour/
  package) — casos válidos e inválidos.
- Cálculo de payouts múltiples por un solo paquete vendido.
- RLS de `packages`/`package_items` (público SELECT solo activos; admin-only
  write, mismo patrón que `service_types`).

---

## 8. Fuera de alcance de este plan (explícito)

- **Transporte monetizado**: `transport_requests` sigue sin pago en la
  plataforma — decisión explícita del founder. `commission_config.transport`
  queda como está (sembrada pero sin código que la use); revisar en un plan
  futuro si se decide cobrar por la plataforma.
- **Wompi real production keys**: este documento asume que se implementa y
  prueba todo contra **sandbox** de Wompi y Alegra primero; el corte a
  producción es el último paso, después de que CCV/DIAN/RNT estén listos.

---

## 9. Roadmap de implementación (orden sugerido una vez legal esté listo)

1. **Fundacional**: RPC `create_booking_with_transaction` (atomicidad) +
   migración de columnas bancarias en `businesses`/`tourist_guides` +
   `.env.local.example` con todas las llaves nuevas (vacías).
2. **Wompi checkout**: redirect real, webhook `route.ts` con verificación de
   firma, transición de estados, tests.
3. **Wompi Payouts**: tabla `provider_payouts`, disparo automático al marcar
   `paid`, tests de idempotencia.
4. **Motor de reembolsos**: `refund_policy_config`, `refund_requests`, flujo
   void/manual, notificaciones por correo, tests.
5. **Alegra facturación**: sync de contactos, creación de factura al
   confirmarse el pago, webhook de reconciliación, tests.
6. **Alegra notas crédito**: enlazadas al flujo de reembolsos del paso 4.
7. **Paquetes/tours**: esquema, `/admin/paquetes`, `/paquetes` público,
   extensión de la constraint XOR de `bookings`, payouts múltiples por
   paquete — **detrás de bandera hasta que el código esté probado**.
8. **Revisión de seguridad obligatoria** (`security-reviewer` subagent, por
   CLAUDE.md) antes de cualquier PR de este trabajo que toque dinero —
   especial atención a: verificación de firma de webhooks, que ningún monto
   se derive del cliente, idempotencia de payouts, y que las políticas RLS de
   las tablas nuevas (`refund_requests`, `provider_payouts`, `packages`,
   `package_items`) sigan el mismo patrón admin-only/public-read-activos-only
   que el resto del esquema.
9. **Corte a producción**: llaves reales de Wompi (esperar confirmación de
   aprobación del comercio, banner de 3 días hábiles) y Alegra, actualizar
   `src/lib/copy/legal.ts` (quitar la nota de "aún no constituida"),
   habilitación DIAN de Alegra confirmada, des-flaggear paquetes.

---

## 10. Verificación end-to-end sugerida (cuando se implemente)

- Reserva de una experiencia → checkout sandbox Wompi → webhook simulado
  (Wompi provee un modo de pruebas) → `bookings.status='confirmed'` →
  payout de prueba generado → factura de prueba creada en Alegra sandbox.
- Cancelar esa misma reserva en cada ventana de tiempo (72h+, 24-72h, <24h)
  y verificar el % de reembolso calculado y la nota crédito en Alegra.
- Comprar un paquete de prueba (una vez implementado) y verificar que se
  generan N payouts, uno por `package_item`, sumando correctamente al costo
  interno total.
- Correr `npm run test` (cobertura de los nuevos Server Actions/Route
  Handlers) y `npm run build` antes de cualquier PR, por convención del
  proyecto.
