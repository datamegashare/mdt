# Mesa de Trabajo — Handoff v11.1
**Fecha:** Mayo 2026  
**Archivos en producción:** `index_v11.1.html` + `mesa_v9.1.gs` + `sw_v11.js`

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
| `index_v11.1.html` | v11.1 | Frontend completo |
| `mesa_v9.1.gs` | v9.1 | Backend GAS |
| `sw_v11.js` | mdt-v11 | Sin cambios desde v11 |

---

## Historial de cambios — sesión actual

### v11 (index_v11.html / mesa_v9.gs / sw_v11.js)
**A. Toggle horario en Anotador**
- Toggle off por default. Al activar: selectores ▲▼ estilo alarma.
  - Hora inicio: segmentos de 30 min, arranca en el slot más cercano, editable.
  - Duración: 8 opciones fijas (30 min, 1h, 1h 30, 2h, 2h 30, 3h, 3h 30, 4h).
- Preview en tiempo real: `09:00 a 10:00 (60 min)`.
- Al guardar: toggle se apaga automáticamente.
- Sheet/Doc: segunda línea `13:00 a 14:15 (75 min)` en texto plano.
- Calendario: evento con hora exacta de inicio y fin (GAS v9).

**B. FAB + Bottom Sheet PostIts (mobile)**
- Botón flotante naranja fijo `bottom: 80px / right: 20px`.
- Solo visible cuando el tab PostIts está activo.
- Al tocar: bottom sheet deslizable desde abajo con selector de color y textarea.
- Formulario fijo arriba de grilla eliminado en mobile.
- Se cierra con Cancelar, toque en overlay, o Escape.

**C. Header mobile**
- Solo ícono 🗂️ visible. Texto, refrán ocultos por `@media (max-width: 720px)`.

**D. Badge tab HOY (mobile)**
- Contador naranja sobre ícono 📋 con cantidad de notas del día actual.
- Se actualiza al cargar datos y al guardar nota nueva.

**E. sw.js**
- Cache actualizado a `mdt-v11`.

### v11.1 (index_v11.1.html / mesa_v9.1.gs)
**a. Versión visible en mobile**
- `.hdr-version` ya no se oculta en mobile.
- Aparece como badge compacto `v11.1` junto al ícono 🗂️.

**b. Línea de horario en panel HOY**
- GAS v9.1: `guardarNota()` inyecta `<p class="nota-horario">⏱ 13:00 a 13:30 (30 min)</p>` al inicio del HTML `contenido` cuando el toggle está activo.
- Frontend: CSS `.nota-horario` renderiza la línea con borde naranja izquierdo y fondo `var(--tag-bg)`.
- ⚠️ Solo aplica a notas nuevas guardadas con GAS v9.1. Notas anteriores no tienen el párrafo inyectado.

### GAS v9.1 respecto a v9
- `guardarNota()` genera `contenidoFinal` = `<p class="nota-horario">…</p>` + HTML original cuando `tieneHorario`.
- Sheet guarda `contenidoFinal` en columna D (Contenido HTML).
- Doc y texto plano (columna E) siguen su propio camino (sin cambios).

---

## Arquitectura de funciones clave (frontend)

### Toggle horario
```
HORA_SLOTS[]          → array de strings 'HH:mm' cada 30 min (48 slots)
DURACION_OPTS[]       → 8 opciones {label, min}
estado.horarioActivo  → boolean
estado.horaIdx        → índice en HORA_SLOTS
estado.duracionIdx    → índice en DURACION_OPTS

horaSlotMasCercana()  → índice del slot más próximo a la hora actual
cambiarHora(dir)      → mueve horaIdx ±1 (circular)
cambiarDuracion(dir)  → mueve duracionIdx ±1 (con clamp)
actualizarPickerDisplay() → actualiza DOM picker + preview
onToggleHorario()     → activa/desactiva selectores, inicializa hora
```

### Bottom Sheet PostIts (mobile)
```
iniciarBottomSheet()    → renderiza dots de color en #bs-colors
abrirBottomSheet()      → muestra overlay + sheet con animación
cerrarBottomSheet()     → oculta con transición
confirmarBottomSheet()  → llama crearPostit() con estado.bsColor
estado.bsColor          → color seleccionado en el bottom sheet
```

### Badge HOY
```
actualizarBadgeHoy(n) → muestra/oculta #badge-hoy con cantidad n
                         llamado desde renderNotasHoy() si esHoy
```

### Mobile tabs (heredado v10.1)
```
cambiarTab(tab)       → 'anotar' | 'postits' | 'hoy'
                         también muestra/oculta el FAB según tab
iniciarTabsMobile()   → llamado desde iniciarApp()
TABS                  → { anotar: 'panel-left', postits: 'postit-col', hoy: 'panel-right' }
```

---

## Pendientes

### Próxima sesión
- [ ] **Color `.nota-horario`** — cambiar el estilo actual (naranja, igual a la etiqueta) por un color diferente para distinguir visualmente. Opciones a discutir: azul pizarra, verde, violeta suave.

### Backlog
- [ ] **Drag & drop touch en mobile** — HTML5 drag no funciona en touch. Implementar con `touchstart` / `touchmove` / `touchend` o librería Sortable.js.
- [ ] **Datepicker en panel HOY** — alternativa a las flechas ← → para saltar a una fecha específica directamente.
- [ ] **Loading spinners** — indicadores de carga en cards del dashboard. Patrón ya existe en `admin.js` del AWP Inventory → replicar en `dashboard.js` y `materiales.js`.

---

## Cómo continuar en nuevo chat

Pegar este prompt al inicio:

```
Continuamos con Mesa de Trabajo (datamegashare.github.io/mdt/).
Estado actual:
- index_v11.1.html en producción (frontend)
- mesa_v9.1.gs en producción (GAS backend)
- sw_v11.js en producción (cache mdt-v11)

Stack: GitHub Pages + Google Apps Script + Google Sheets + OAuth 2.0.
Fix CORS: POST con Content-Type: text/plain.
Changelogs en comentarios del código y en documentación externa.

Reglas de entrega:
- Siempre generar archivos descargables, nunca código inline.
- Versión visible en login (bajo subtítulo) y en header (desktop y mobile).
- Nombre de archivo siempre incluye versión: index_v11.1.html
- Finalizar cada sesión con prompt de handoff en archivo .md descargable.

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

---

*Generado al cierre de sesión — Mayo 2026*
