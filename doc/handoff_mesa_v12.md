# Handoff — Mesa de Trabajo v12.0
**Fecha:** 2026-05-20
**Archivos entregados:** `index_v12.html` · `mesa_v10.gs`
**Versión anterior:** v11.3 / gas v9.3

---

## Qué se hizo

Tres features nuevas: Registrador de Tareas, Semáforo de sincronización y Marcas con color.

---

## Cambios en el HTML (index_v12.html)

### 1. Registrador de Tareas (desktop only)
- Botón 🍅 en el header del Anotador (derecha del título "ANOTADOR")
- Panel flotante `#panel-registrador`, posicionado `fixed` bajo el header del Anotador
- **Estado reposo:** selector de etiqueta + selector de tarea (cargados desde Sheet) → botón Iniciar
- Al seleccionar tarea, la etiqueta se sincroniza automáticamente si la tarea tiene una asignada en el Sheet
- **Estado activo:** cronómetro `MM:SS`, barra de progreso 25 min, nombre de tarea, ciclo actual
- Cada 25 min: alarma sonora (Web Audio API, 3 beeps) + notificación visual con botones Finalizar / Continuar
- **Finalizar:** calcula duración real, activa toggle horario con hora inicio y duración más cercana, escribe la tarea en Quill y pre-selecciona la etiqueta → anotador listo para guardar
- **Continuar:** reinicia el ciclo, incrementa contador, vuelve a correr
- **Cancelar:** resetea todo sin tocar el anotador
- CSS: `#btn-registrador`, `#panel-registrador`, `.reg-*`, `#reg-notif` — solo desktop (oculto en `@media max-width:720px`)

### 2. Semáforo de sincronización
- Flag `estado.guardando` (boolean) en el estado global
- Protege: `guardarNota()`, `crearPostit()`, `confirmarBottomSheet()`, `guardarEdicionPostit()`, btnOk del formulario inline de PostIt
- Patrón: verificar al inicio → deshabilitar botón + texto "Guardando…" → liberar en `finally` siempre
- Elimina el doble submit en condiciones de alta latencia (4G, cold start GAS)

### 3. Marcas con color
- Sección `#marcas-wrap` en el panel izquierdo, debajo de `#horario-wrap` y antes del editor Quill
- Chips multi-selección con color de fondo definido en el Sheet (columna Color en inglés)
- `estado.marcasActivas[]` acumula las marcas seleccionadas
- Al guardar nota: se pasan al GAS en `payload.marcas`
- Se limpian automáticamente después de guardar (`limpiarMarcasSeleccionadas()`)
- `renderMarcas()` + `toggleMarca()` + `limpiarMarcasSeleccionadas()`
- `MARCA_COLORS`: mapa de colores inglés → `{ bg, fg, border }` para los chips

### 4. Carga de datos iniciales
- `renderizarDatos()` ahora llama `renderMarcas(data.marcas)` y `renderTareasEnRegistrador(data.tareas)` — ambos llegan en la respuesta de `getData`
- `renderEtiquetasEnRegistrador()` puebla el selector de etiqueta del registrador al mismo tiempo que las etiquetas del anotador

### 5. Versión actualizada en 4 lugares
- Comentario header HTML: `v12.0`
- Login screen: `v12.0 · Workspace personal`
- Header app: `v12.0`
- Constante JS: `VERSION_UI = 'v12.0'`

---

## Cambios en el GAS (mesa_v10.gs)

### Nuevas acciones
- `getTareas`: lee hoja `Tareas` (columnas Tarea | Etiqueta), devuelve array `[{ tarea, etiqueta }]`
- `getMarcas`: lee hoja `Marcas` (columnas Marca | Color), devuelve array `[{ nombre, color }]`
- `getData` ahora incluye `tareas` y `marcas` en la respuesta — evita llamadas extra al cargar

### guardarNota — acepta `marcas`
- Nuevo parámetro `marcas` (array de `{ nombre, color }`)
- **HTML:** inyecta `<span class="marca-pill">` al final del contenido con estilos inline (colores del `COLOR_MAP`)
- **Texto plano:** agrega `[Marca1] [Marca2]` al final de la columna Texto en el Sheet → buscable desde Sheets
- **Google Doc:** agrega línea "Marcas: X, Y" en itálica morado

### Nuevas hojas
- `setupTareas()`: crea hoja `Tareas` con 8 tareas de ejemplo relevantes al contexto EPC/AWP
- `setupMarcas()`: crea hoja `Marcas` con 8 marcas de ejemplo + nota en col D con colores válidos
- `setupHojas()` actualizado: llama a ambas funciones automáticamente

### Menú
- `1d. Migrar a v10: crear hoja Tareas`
- `1e. Migrar a v10: crear hoja Marcas`

### `testGetData()` actualizado
- Logea también `tareas` y `marcas` en los logs de GAS

---

## Hojas requeridas en el Sheet

| Hoja | Columnas | Novedad |
|---|---|---|
| Config | Parámetro \| Valor | — |
| Etiquetas | Etiqueta | — |
| Herramientas | Nombre \| URL \| Emoji | — |
| Notas | Fecha \| FechaHora \| Etiqueta \| Contenido (HTML) \| Texto | — |
| Usuarios | email \| nombre \| activo | — |
| PostIts | ID \| Texto \| Color \| Autor \| FechaHora | — |
| **Tareas** | **Tarea \| Etiqueta** | **Nueva v10** |
| **Marcas** | **Marca \| Color** | **Nueva v10** |

Colores válidos en Marcas: `red`, `orange`, `yellow`, `green`, `blue`, `indigo`, `purple`, `pink`, `teal`, `gray`

---

## Deploy

1. Reemplazar el GAS existente con `mesa_v10.gs`
2. Ejecutar `1d. Migrar a v10: crear hoja Tareas` desde el menú del Sheet
3. Ejecutar `1e. Migrar a v10: crear hoja Marcas` desde el menú del Sheet
4. Editar las tareas y marcas según necesidad
5. Re-deploy del Web App (nueva versión)
6. Subir `index_v12.html` a GitHub Pages

---

## Checklist de verificación post-deploy

- [ ] Cargar la app → marcas aparecen debajo del editor (chips de color)
- [ ] Seleccionar marcas → se marcan activas → guardar nota → las pills aparecen en panel HOY
- [ ] PostIt desde desktop con latencia alta → no se duplica (semáforo)
- [ ] PostIt desde mobile 4G → no se duplica (semáforo)
- [ ] Abrir registrador con 🍅 → seleccionar tarea → iniciar → cronómetro corre
- [ ] A los 25 min → alarma sonora + notificación visual con botones
- [ ] Finalizar tarea → anotador con etiqueta, tarea escrita y toggle horario activo
- [ ] Continuar → ciclo reinicia, contador sube a 2
- [ ] Cancelar → registrador resetea sin tocar el anotador
- [ ] En mobile: botón 🍅 no visible, panel registrador no aparece
- [ ] Shift+D → métricas siguen funcionando

---

## Pendiente / próximas sesiones

- CRUD de tareas desde la UI (por ahora solo desde el Sheet)
- Búsqueda por marca en el panel HOY
- Estadísticas de tiempo por tarea/etiqueta (datos ya están en el Sheet con las marcas)
