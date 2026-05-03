# Mesa de Trabajo — Handoff v10.1
**Fecha:** Mayo 2026  
**Archivos en producción:** `index_v10.1.html` + `mesa_v8.gs`

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
| `index_v10.1.html` | v10.1 | Frontend completo |
| `mesa_v8.gs` | v8 | Backend GAS |
| `sw.js` | mdt-v9 | ⚠️ Pendiente actualizar a mdt-v10.1 |

---

## Historial de cambios — esta sesión

### v10 (index_v10.html / mesa_v8.gs)
1. **Resizer estético** — triángulos SVG redondeados enfrentados entre paneles. Naranja al hover/drag.
2. **Fix fecha panel HOY** — se actualiza en cada recarga y al presionar Actualizar.
3. **Navegación de fechas en panel HOY** — flechas ← → entre días con notas guardadas.
   - Label dinámico: "HOY" si es hoy, nombre del día si es pasado.
   - Fondo del panel cambia a azul-gris suave en días pasados.
   - Al guardar nota nueva, el panel vuelve automáticamente a HOY.
   - Requiere GAS v8 (acción `getNotasFecha` + `fechasDisponibles` en `getData`).
4. **Drag & drop PostIts** — reordenamiento nativo HTML5. Indicador visual de zona drop (línea naranja). Orden persiste en estado de sesión.

### v10.1 (index_v10.1.html — solo frontend, GAS sin cambios)
1. **Paneles como tarjetas flotantes** — cada panel (Anotador, PostIts, HOY) es una card con `border-radius: 12px` y sombra suave, flotando sobre fondo gris `--bg`. Sin bordes entre paneles.
2. **Resizer invisible** — gap de 8px entre tarjetas; pill naranja semitransparente solo al hover. Sin barras, sin flechas, sin triángulos.
3. **Mobile rediseñado con tabs** — tab bar fija al fondo con 3 botones: ✏️ Anotar | 📌 PostIts | 📋 HOY. Un panel visible a la vez. Sin scroll vertical infinito.
4. **PostIts mobile: grilla 2×** — cards en 2 columnas, altura ajustada al contenido. Texto con clamp de 5 líneas. Formulario nuevo PostIt ocupa las 2 columnas. Scroll vertical.

### GAS v8 (mesa_v8.gs) — cambios respecto a v7
- `leerNotasHoy(ss, fechaOverride)` — refactorizada para aceptar fecha override (retrocompatible).
- `getFechasDisponibles(ss)` — devuelve array de hasta 60 fechas únicas con notas, ordenado descendente.
- `getNotasFecha(email, fecha)` — nueva acción POST: notas de fecha específica + fechasDisponibles.
- `getDataMesa()` — ahora incluye `fechasDisponibles` en cada respuesta inicial.

---

## Arquitectura de funciones clave (frontend)

### Navegación de fechas
```
estado.fechaVista       → string 'yyyy-MM-dd' o null (= hoy)
estado.fechasConNotas   → array ordenado de fechas con datos

fechaHoyStr()           → 'yyyy-MM-dd' de hoy
actualizarFechaPanel()  → actualiza label, fecha, fondo, botones nav
actualizarBotonesNav()  → habilita/deshabilita ← →
navegarFecha(dir)       → dir=-1 anterior, dir=+1 siguiente
cargarNotasFecha(fecha) → POST getNotasFecha al GAS
```

### Mobile tabs
```
cambiarTab(tab)         → 'anotar' | 'postits' | 'hoy'
iniciarTabsMobile()     → llamado desde iniciarApp(), activa tab anotar
TABS                    → { anotar: 'panel-left', postits: 'postit-col', hoy: 'panel-right' }
```

### Drag & drop PostIts
- `draggable=true` en cada `.postit-card`
- Eventos: `dragstart`, `dragend`, `dragover`, `dragleave`, `drop`
- Reordena `estado.postits` y llama `renderPostits()`
- CSS: `.dragging-src` (opacidad), `.drag-over-top` / `.drag-over-bottom` (línea naranja)

---

## Pendientes

### Inmediatos (deploy)
- [ ] **Actualizar `sw.js`** — cambiar cache `mdt-v9` → `mdt-v10.1` para forzar actualización en dispositivos con versión vieja instalada como PWA.

### Mejoras futuras identificadas
- [ ] **Badge en tab HOY (mobile)** — mostrar cantidad de notas del día actual sobre el ícono del tab.
- [ ] **Drag & drop en mobile** — los eventos HTML5 drag no funcionan en touch. Implementar con `touchstart` / `touchmove` / `touchend` o librería Sortable.js.
- [ ] **Selector de fecha tipo datepicker** — alternativa a las flechas ← → para saltar directamente a una fecha específica en el panel HOY.
- [ ] **Loading spinners** — agregar indicadores de carga en las cards del dashboard y tabla de materiales (patrón ya existe en `admin.js` del AWP Inventory).

---

## Cómo continuar en nuevo chat

Pegar este prompt al inicio:

```
Continuamos con Mesa de Trabajo (datamegashare.github.io/mdt/).
Estado actual:
- index_v10.1.html en producción (frontend)
- mesa_v8.gs en producción (GAS backend)
- sw.js pendiente actualizar a cache mdt-v10.1

Stack: GitHub Pages + Google Apps Script + Google Sheets + OAuth 2.0.
Fix CORS: POST con Content-Type: text/plain.
Changelogs en comentarios del código y en documentación externa.

Reglas de entrega:
- Siempre generar archivos descargables, nunca código inline.
- Versión visible en login (bajo subtítulo) y en header.
- Nombre de archivo siempre incluye versión: index_v10.1.html
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

*Generado al cierre de sesión — Mayo 2026*
