# Configuración de Google Tag Manager, GA4 y Meta Pixel para ManTur

Guía paso a paso para conectar las herramientas de medición. El sitio
(mantur.co) ya envía los eventos; esta configuración decide a dónde llegan.

## Estado actual (11/11/2026)

| | Valor |
|---|---|
| Contenedor GTM | `GTM-5BJG7CLK`, **versión 2 publicada** ("GA4 + Meta Pixel - eventos de paquetes") |
| GA4 | Propiedad "ManTur", ID de medición `G-CQ7ZNJBWNB`. Verificado en tiempo real: `page_view`, `view_item`, `view_item_list`, `generate_lead` |
| Meta | Conjunto de datos (Pixel) `1865471110898555` del portafolio ManTur. Verificado: `PageView`, `ViewContent`, `Contact` |
| Vercel | `NEXT_PUBLIC_GTM_ID=GTM-5BJG7CLK` (solo Production) |

La configuración completa de GTM está en `docs/specs/gtm/mantur-gtm-completo.json`
(Administrar → Importar contenedor → Combinar). Si se cambia algo en GTM,
exporta el contenedor y reemplaza ese archivo.

**Pendiente:** en GA4 → Administrar → Eventos, marcar `generate_lead` con la
estrella de evento clave. GA4 lo muestra en esa lista hasta 24 h después
del primer evento.

### Notas de la verificación

- **Secuenciación de etiquetas:** cada etiqueta de evento (GA4 y Meta) ejecuta
  primero su etiqueta base. Hace falta porque `view_item` se registra antes de
  que el visitante acepte las cookies y GTM lo procesa al cargar.
- **Si GA4 no recibe datos desde un computador** pero sí desde el celular con
  datos móviles, revisa la red o el equipo. En la prueba del 11/11, todas las
  solicitudes a `google-analytics.com` de ese computador respondían 503 (DNS o
  antivirus con bloqueo de rastreadores). No era un problema de la configuración.
- **Vista previa de GTM:** Tag Assistant solo se conecta con la ventana que
  abre él mismo, y esa ventana debe tener las cookies aceptadas; si no, GTM no
  carga y la conexión agota el tiempo.

- Contenedor de GTM: **GTM-5BJG7CLK**
- GTM solo carga cuando el visitante **acepta** el aviso de cookies. Si
  rechaza, no se envía nada a Google ni a Meta.
- GTM solo está en las páginas públicas (no en el panel admin ni en "Mi perfil").

## 0. Activar GTM en producción (Vercel)

En Vercel → proyecto `mantur` → Settings → Environment Variables:

| Nombre | Valor | Entorno |
|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | `GTM-5BJG7CLK` | Production (solo producción) |

Después hay que hacer un redeploy. Sin esta variable el sitio funciona igual,
pero no carga GTM; así las vistas previas y el entorno local no ensucian los datos.

## 1. Eventos que envía el sitio (dataLayer)

| Evento | Cuándo | Parámetros |
|---|---|---|
| `view_item_list` | Abre `/paquetes` | `item_list_name`, `items` |
| `view_item` | Abre el detalle de un paquete | `paquete_id`, `paquete_nombre`, `value`, `currency` |
| `whatsapp_click` | Toca un botón de WhatsApp de venta | `ubicacion`, y si aplica `paquete_id`, `paquete_nombre`, `value`, `currency` |
| `request_submit` | Envía una solicitud de paquete desde su cuenta | `paquete_id`, `value`, `currency` |

`ubicacion` dice dónde estaba el botón: `package_detail`, `package_detail_sticky`
(barra fija en el celular), `home_showcase` o `home_custom_package` ("¿Lo
quieres a tu medida?").

## 2. Crear GA4

1. En analytics.google.com, crea una propiedad "ManTur" (zona horaria
   Colombia, moneda COP) y un flujo de datos web para `https://mantur.co`.
2. Copia el **ID de medición** (`G-XXXXXXXXXX`).
3. En Administrar → Configuración de datos → Retención de datos, sube la
   retención a **14 meses**.

## 3. Configurar GTM

> Atajo: todo lo de esta sección ya está en `docs/specs/gtm/mantur-gtm-completo.json`.
> Impórtalo con Combinar en vez de crearlo a mano. Los pasos de abajo sirven
> como referencia o para recrearlo. La versión importada usa etiquetas de
> HTML personalizado para el Pixel, en lugar de la plantilla de la galería.

En tagmanager.google.com, contenedor GTM-5BJG7CLK:

### 3.1 Variables (Variables → Variables definidas por el usuario → Nueva → Variable de capa de datos)

Crea una por cada nombre: `paquete_id`, `paquete_nombre`, `value`, `currency`,
`ubicacion`, `items`.

### 3.2 Activadores (Activadores → Nuevo → Evento personalizado)

Crea uno por evento, con el nombre exacto: `view_item_list`, `view_item`,
`whatsapp_click` y `request_submit`.

### 3.3 Etiquetas de GA4

1. **Etiqueta de Google**: el ID `G-XXXXXXXXXX` con el activador "Initialization – All Pages".
2. **Evento de GA4** `view_item` → activador `view_item`, con los parámetros
   `paquete_id`, `paquete_nombre`, `value` y `currency`.
3. **Evento de GA4** `generate_lead` → activador `whatsapp_click`, con los
   parámetros `paquete_id`, `value`, `currency` y `ubicacion`.
4. **Evento de GA4** `generate_lead` → activador `request_submit`.
5. **Evento de GA4** `view_item_list` → activador `view_item_list`.
6. En GA4 → Administrar → Eventos, marca `generate_lead` como **evento clave**.

### 3.4 Meta Pixel

1. En business.facebook.com → Administrador de eventos → Conectar origen de
   datos → Web, crea el conjunto de datos (Pixel) "ManTur" y copia su **ID**.
2. En GTM → Plantillas → Galería de plantillas, busca "Facebook Pixel" (de
   facebookarchive) y agrégala.
3. Crea estas etiquetas con esa plantilla y el ID del Pixel:
   - `PageView` → activador "All Pages".
   - `ViewContent` → activador `view_item` (value y currency de las variables).
   - `Contact` → activador `whatsapp_click`.
   - `Lead` → activador `request_submit`.

### 3.5 Probar y publicar

1. Haz clic en **Vista previa** y abre mantur.co. Acepta el aviso de cookies,
   abre un paquete y toca "Reservar por WhatsApp". En el panel de Tag
   Assistant deben aparecer `view_item` y `whatsapp_click` con sus etiquetas
   disparadas.
2. En GA4 → Administrar → DebugView deben aparecer los eventos.
3. Con la extensión "Meta Pixel Helper" deben aparecer `ViewContent` y `Contact`.
4. Si todo está bien, haz clic en **Enviar → Publicar**.

## 4. Enlaces de los anuncios (UTM)

Todos los anuncios deben llevar UTM con esta convención:

```
https://mantur.co/paquetes/fullday-manaure?utm_source=meta&utm_medium=paid_social&utm_campaign=mt_ventas_fullday_202611&utm_content=video1
```

- `utm_source`: `meta` o `google`
- `utm_medium`: `paid_social` (Meta) o `cpc` (Google)
- `utm_campaign`: `mt_{objetivo}_{paquete}_{aaaamm}`
- `utm_content`: el identificador del creativo

En Google Ads, activa el etiquetado automático (`gclid`). El sitio también lo reconoce.

## 5. Cómo se ve en la venta

- Cuando un visitante llega por un anuncio y toca WhatsApp, el mensaje
  termina con **"· campaña: mt_ventas_fullday_202611"**.
- Al registrar la venta en `/admin/reservas/nueva`, elige "¿Cómo nos conoció?"
  y pega esa campaña. En `/admin/reservas` cada venta muestra su **Origen**.
- Las solicitudes hechas desde la web guardan el origen solas.

## Pendiente (próximo paso)

Para saber qué anuncio terminó en **compra pagada**: exportar las ventas
pagadas (teléfono y valor) y subirlas a Meta como conversiones offline.
Reemplaza la Conversions API, que no aplica con WhatsApp Business app.
