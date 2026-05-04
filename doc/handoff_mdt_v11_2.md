# Mesa de Trabajo — Handoff v11.2
**Fecha:** Mayo 2026  
**Archivos en producción:** `index_v11.2.html` + `mesa_v9.2.gs` + `sw_v11.js`

---

## Estado actual del proyecto

### Stack
- **Frontend:** GitHub Pages → `datamegashare.github.io/mdt/`
- **Backend:** Google Apps Script (GAS) Web App
- **Datos:** Google Sheets (6 hojas: Config, Etiquetas, Herramientas, Notas, Usuarios, PostIts)
- **Auth:** Google OAuth 2.0 (Google Identity Services)
- **PWA:** Service Worker + manifest

### Versiones activas
| Archivo | Versión | Notas |
|---|---|---|
| `index_v11.2.html` | v11.2 | Frontend completo |
| `mesa_v9.2.gs` | v9.2 | Backend GAS |
| `sw_v11.js` | mdt-v11 | Sin cambios desde v11 |

---

## Historial de cambios — sesión actual

### v11.2 (index_v11.2.html / mesa_v9.2.gs)

**a. Color `.nota-horario` → violeta**
- Antes: naranja idéntico a la etiqueta (`var(--accent)` / `var(--tag-bg)`) — confuso visualmente.
- Ahora: violeta (`color: #3C3489`, `background: #EEEDFE`, `border-left: 3px solid #7F77DD`).
- Cambio solo en CSS del frontend. GAS sin cambios en esta parte.

**b. Panel de métricas GAS (Shift+D)**
- Activar/cerrar con `Shift+D` desde cualquier lugar de la app.
- Muestra historial de las últimas 50 llamadas a GAS con:
  - Acción (`getData`, `guardarNota`, `ping`, etc.)
  - Tiempo total percibido por el usuario (ms) — medido con `performance.now()`
  - Indicador semáforo: 🟢 < 1000ms / 🟡 1000–3000ms / 🔴 > 3000ms
  - Timestamp (hora:min:seg)
- Summary: total de llamadas, promedio, máximo (también con semáforo).
- Botón "Limpiar" para resetear el historial.
- Countdown del próximo ping keep-alive.
- Responsive: en mobile ocupa el ancho completo.

**c. Keep-alive liviano (ping cada 4 min)**
- `iniciarKeepAlive()` se llama desde `iniciarApp()` al hacer login.
- Usa `setInterval` de 4 minutos — por debajo del threshold de ~5 min que tarda GAS en suspender el contenedor.
- El ping llama `action: 'ping'` → GAS responde `{ ok: true, pong: true, _ms: N }` sin leer ninguna hoja.
- El ping aparece en el panel de métricas como "ping (keep-alive)".
- Convive con el `setInterval` de 15 min de `cargarDatos` (no lo reemplaza).

**d. GAS v9.2: acción `ping` + campo `_ms`**
- `case 'ping'`: devuelve `{ ok: true, pong: true }` inmediatamente.
- Todas las respuestas de `doPost` ahora incluyen `_ms` con el tiempo de procesamiento interno del GAS (en ms). Útil para comparar con el tiempo total del frontend y estimar la latencia de red.

---

## Arquitectura de funciones clave (frontend)

### Módulo de métricas (nuevo v11.2)
```
metricas = { historial[], MAX_ITEMS:50, kaInterval, kaSeconds, kaTimer }

clasificarMs(ms)         → 'ok' | 'warn' | 'error'
registrarMetrica(action, ms, ok) → push a historial + actualizar UI
actualizarPanelMetricas()        → re-renderiza summary + lista
abrirMetricas()                  → muestra #metrics-panel
cerrarMetricas()                 → oculta #metrics-panel
limpiarMetricas()                → vacía historial[]

Shift+D → toggle abrirMetricas/cerrarMetricas
```

### Keep-alive (nuevo v11.2)
```
iniciarKeepAlive()       → arranca setInterval cada 4 min
actualizarKaCountdown()  → actualiza countdown en el panel (cada 1s)
KA_INTERVAL_MS = 4 * 60 * 1000
```

### gasPost (modificado v11.2)
```
gasPost(payload)
  → mide tiempo con performance.now()
  → llama registrarMetrica(action, ms, ok) en resolve y reject
  → comportamiento externo idéntico a v11.1
```

### Toggle horario (heredado v11)
```
HORA_SLOTS[], DURACION_OPTS[], estado.horarioActivo, estado.horaIdx, estado.duracionIdx
horaSlotMasCercana(), cambiarHora(dir), cambiarDuracion(dir)
actualizarPickerDisplay(), onToggleHorario()
```

### Bottom Sheet PostIts (heredado v11)
```
iniciarBottomSheet(), abrirBottomSheet(), cerrarBottomSheet(), confirmarBottomSheet()
estado.bsColor
```

### Badge HOY (heredado v11)
```
actualizarBadgeHoy(n) → muestra/oculta #badge-hoy
```

### Mobile tabs (heredado v10.1)
```
cambiarTab('anotar'|'postits'|'hoy'), iniciarTabsMobile()
TABS = { anotar:'panel-left', postits:'postit-col', hoy:'panel-right' }
```

---

## Mediciones baseline — Mayo 2026

Relevamiento realizado el mismo día del deploy de v11.2, usando el panel Shift+D.  
Condiciones: desktop Chrome, Buenos Aires, red WiFi, GAS desplegado en cuenta Google personal.

### Tiempos medidos por acción (contenedor caliente)

| Acción | ms típico | Semáforo | Observaciones |
|---|---|---|---|
| `getData` | 3600–5800 | 🔴 | Lectura de 5 hojas + verificarUsuario |
| `guardarNota` | 3700 | 🔴 | Escribe Sheet + Doc + Calendar |
| `getPostIts` | 2700–3700 | 🔴 | Lectura hoja PostIts |
| `getNotasFecha` | 4200 | 🔴 | Lectura hoja Notas filtrada por fecha |
| `crearPostIt` | 3000 | 🔴 | Escritura hoja PostIts |
| `ping (keep-alive)` | 1660 | 🟡 | Sin lectura de hojas — tiempo base de red+contenedor |

### Cold start documentado

Captura con botón Actualizar después de inactividad (keep-alive countdown en 0:38):

| Llamada | ms | Tipo |
|---|---|---|
| `getData` | **6549** 🔴 | Contenedor frío — primera llamada del día |
| `getPostIts` | **2694** 🟡 | Contenedor ya caliente — llamada inmediatamente siguiente |

**Delta cold start: ~3855ms** — diferencia entre primera y segunda llamada.

### Conclusiones del baseline

1. **El overhead fijo de red + contenedor es ~1660ms** — confirmado por el ping que no lee nada.
2. **El procesamiento GAS agrega ~1100–2100ms encima** — diferencia entre ping y llamadas reales.
3. **El cold start agrega ~3855ms adicionales** — solo en la primera llamada tras inactividad >5 min.
4. **El keep-alive de 4 min debería eliminar el cold start en uso normal** — pendiente confirmar con más días de uso.

### Objetivo de optimización (próxima sesión)

Bajar `getData` y `getPostIts` de ~3500ms → **< 2000ms** con contenedor caliente, atacando:
- `verificarUsuario()` abre su propio `SpreadsheetApp.getActiveSpreadsheet()` — segunda apertura innecesaria, pasar `ss` como parámetro.
- `getData` hace 5 llamadas a `getSheetByName()` y 5 lecturas separadas — consolidar en un único bloque de lectura.

---

## Pendientes

### Próxima sesión — PRIORIDAD
- [ ] **Optimizar GAS v9.3** — eliminar apertura duplicada del Spreadsheet en `verificarUsuario()` y consolidar lecturas en `getDataMesa()`. Objetivo: bajar `getData` de ~3600ms a <2000ms caliente.
- [ ] **`_ms` del GAS en el panel** — el campo `_ms` ya viene en la respuesta JSON pero no se muestra en el panel. Mostrar como "GAS: Xms / Red: Yms" para desglosar dónde se va el tiempo.

### Backlog
- [ ] **Drag & drop touch en mobile** — HTML5 drag no funciona en touch. Implementar con `touchstart` / `touchmove` / `touchend` o librería Sortable.js.
- [ ] **Datepicker en panel HOY** — alternativa a las flechas ← → para saltar a una fecha específica directamente.
- [ ] **Loading spinners** — indicadores de carga en cards del dashboard.

---

## Cómo continuar en nuevo chat

Pegar este prompt al inicio:

```
Continuamos con Mesa de Trabajo (datamegashare.github.io/mdt/).
Estado actual:
- index_v11.2.html en producción (frontend)
- mesa_v9.2.gs en producción (GAS backend)
- sw_v11.js en producción (cache mdt-v11)

Stack: GitHub Pages + Google Apps Script + Google Sheets + OAuth 2.0.
Fix CORS: POST con Content-Type: text/plain.
Changelogs en comentarios del código y en documentación externa.

Reglas de entrega:
- Siempre generar archivos descargables, nunca código inline.
- Versión visible en login (bajo subtítulo) y en header (desktop y mobile).
- Nombre de archivo siempre incluye versión: index_v11.2.html
- Finalizar cada sesión con prompt de handoff en archivo .md descargable.

Contexto de la próxima mejora — Optimización GAS (v9.3):
Baseline medido con panel Shift+D:
  - getData caliente: ~3600ms | frío: ~6500ms
  - getPostIts caliente: ~3400ms
  - ping (sin hojas): ~1660ms → overhead fijo de red+contenedor
  - Cold start delta: ~3855ms

Problemas identificados en mesa_v9.2.gs:
  1. verificarUsuario() abre SpreadsheetApp.getActiveSpreadsheet() por su cuenta
     → genera una segunda apertura del Spreadsheet por cada llamada autenticada
     → fix: recibir ss como parámetro en lugar de abrirlo internamente
  2. getDataMesa() hace 5 getSheetByName() + 5 getValues() encadenados
     → consolidar en un único bloque de lectura batch
  3. editarPostIt() usa 2 setValue() separados (texto y color)
     → consolidar en un setValues() sobre el rango completo de la fila

Objetivo: bajar getData de ~3600ms a <2000ms con contenedor caliente.

[Describir la mejora o fix a implementar]
```

---

## Estructura de hojas del Spreadsheet

| Hoja | Columnas |
|---|---|
| Config | Parámetro, Valor |
| Etiquetas | Etiqueta |
| Herramientas | Nombre, URL, Emoji |
| Notas | Fecha, FechaHora, Etiqueta, Contenido (HTML), Texto |
| Usuarios | email, nombre, activo (checkbox) |
| PostIts | ID, Texto, Color, Autor, FechaHora |

## URLs y credenciales (reemplazar en el HTML)
```javascript
const GAS_URL   = 'https://script.google.com/macros/s/...';  // URL Web App GAS
const CLIENT_ID = '...apps.googleusercontent.com';           // OAuth Client ID
```

---

## Notas de diseño activas
- **Design tokens:** `--accent: #d97706` (naranja), `--accent2: #0f172a` (azul oscuro), `--bg: #f1f5f9`
- **Tipografía:** Bebas Neue (títulos/labels) + DM Sans (cuerpo)
- **Paneles desktop:** tarjetas flotantes con `border-radius: 12px` y sombra suave sobre fondo gris `--bg`
- **Resizer:** gap de 8px entre tarjetas; pill naranja semitransparente solo al hover
- **Mobile breakpoint:** `max-width: 720px`
- **Tab bar mobile:** 60px fija al fondo; FAB PostIts `bottom: 80px / right: 20px`
- **`.nota-horario`:** violeta — `color: #3C3489`, `background: #EEEDFE`, `border-left: 3px solid #7F77DD`
- **Panel métricas:** fondo `var(--accent2)` (azul oscuro), fuente monospace, semáforo verde/amarillo/rojo

---

## Historial de versiones para el .docx

```
v11.2 (Mayo 2026)
  a. Color .nota-horario cambiado a violeta para distinguirlo de la etiqueta (era naranja, idéntico)
  b. Panel de métricas GAS: Shift+D abre historial de llamadas con tiempos y semáforo
  c. Keep-alive liviano: ping automático cada 4 min para evitar cold start del contenedor GAS
  d. GAS v9.2: acción ping + campo _ms en todas las respuestas (tiempo de procesamiento interno)

v11.1 (Mayo 2026)
  a. Versión visible en mobile: badge compacto junto al ícono en header
  b. Línea de horario en panel HOY: el GAS inserta <p class="nota-horario"> en el HTML del contenido
  c. GAS v9.1: guardarNota inyecta párrafo horario en contenido HTML

v11 (Mayo 2026)
  A. Toggle horario en Anotador: selectores ▲▼ estilo alarma para hora inicio y duración
  B. FAB + Bottom Sheet en PostIts mobile
  C. Header mobile: solo ícono, sin texto
  D. Badge en tab HOY: contador de notas del día
  E. sw.js: cache actualizado a mdt-v11
```

---

*Generado al cierre de sesión — Mayo 2026*
