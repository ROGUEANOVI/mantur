# Roadmap de construcción + aprendizaje del stack

Modo elegido: **Claude Code implementa, tú revisas y aprendes el porqué.**
Esto significa que cada fase termina en un punto de revisión (checkpoint)
antes de avanzar a la siguiente — no se acumulan fases sin entender la
anterior.

Cómo funciona el checkpoint en la práctica:
1. Claude Code completa las tareas de la fase (usando Spec Kit:
   `/speckit.tasks` + `/speckit.implement`).
2. Traes el diff/PR resultante de vuelta a este chat (o pides a Claude Code
   que genere un resumen) y aquí te explico, en lenguaje simple, qué se
   construyó y por qué se tomó cada decisión técnica.
3. Solo entonces avanzas a la siguiente fase.

---

## Fase 0 — Fundamentos antes de escribir código
**Qué aprendes:** qué es App Router vs Pages Router, Server Components vs
Client Components, por qué Supabase usa Postgres relacional (vs Firestore
documental que usó tu amigo), qué es RLS y por qué es la pieza de seguridad
más importante del stack.
**Entregable:** ninguno todavía — es lectura/explicación conmigo antes de
tocar Claude Code.

## Fase 1 — Setup del proyecto y autenticación
**Qué construye Claude Code:** proyecto Next.js 16 nuevo, conexión a
Supabase, tablas `usuarios`/`profiles` con roles, flujo de login/registro
(Supabase Auth), políticas RLS básicas.
**Qué aprendes:** cómo Next.js Server Components leen la sesión del usuario
sin exponer tokens al cliente; cómo RLS reemplaza el `ProtectedRoute` que
usaba el MVP anterior (la seguridad se mueve de "componente de React" a
"política de base de datos").

## Fase 2 — Entidades de contenido (lugares, negocios, experiencias, guías)
**Qué construye Claude Code:** esquema Postgres para las 4 entidades +
Storage de Supabase para imágenes + páginas públicas de listado/detalle +
panel `mi-negocio` de autogestión.
**Qué aprendes:** Server Actions para mutaciones (crear/editar negocio) vs
Client Components para interactividad (buscador, filtros); cómo se
estructura Storage + políticas de acceso a archivos.

## Fase 3 — Transportistas y solicitudes de viaje
**Qué construye Claude Code:** tabla `transportistas`, tabla
`solicitudes_viaje`, flujo de "solicitar traslado → aceptar/rechazar",
usando Supabase Realtime para actualizar estado en vivo.
**Qué aprendes:** qué es Supabase Realtime (websockets sobre Postgres) y
cuándo usarlo vs. simplemente recargar datos.

## Fase 4 — Reservas y comisiones
**Qué construye Claude Code:** tabla `reservas`, tabla `config_comisiones`,
lógica de cálculo de comisión en Server Action, dashboard de admin con
métricas.
**Qué aprendes:** por qué el cálculo de dinero nunca puede vivir en el
navegador; cómo diseñar una tabla de configuración en vez de hardcodear
porcentajes.

## Fase 5 — Pagos (Wompi sandbox)
**Qué construye Claude Code:** integración con Wompi en modo pruebas,
webhook de confirmación de pago, tabla `transacciones`.
**Qué aprendes:** cómo funciona un webhook de pasarela de pagos, por qué el
webhook (no el navegador del usuario) es la fuente de verdad de si un pago
se completó.

## Fase 6 — Deploy y cierre del MVP
**Qué construye Claude Code:** deploy a Vercel, variables de entorno,
dominio, checklist de producción.
**Qué aprendes:** diferencias entre entorno de desarrollo/preview/producción
en Vercel; qué variables nunca deben quedar en el código.

---

## Antes de empezar: instalación
```bash
# Spec Kit (usa uv, el gestor de paquetes de Python)
uvx --from git+https://github.com/github/spec-kit.git specify init vayatur-app
cd vayatur-app

# Dentro del proyecto, con Claude Code instalado:
/speckit.constitution   # carga los principios de docs/product-spec.md
/speckit.specify        # especifica la Fase 1
/speckit.plan
/speckit.tasks
/speckit.implement
```

Repite el ciclo `specify → plan → tasks → implement` por cada fase del
roadmap, en orden. No avances a `/speckit.specify` de la fase 2 sin haber
cerrado el checkpoint de revisión de la fase 1.
