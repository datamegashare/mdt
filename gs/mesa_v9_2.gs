// ============================================================
//  MESA DE TRABAJO  v9.2
//  Google Apps Script — Backend API + configuración
//
//  HISTORIAL DE VERSIONES:
//  v1 - Versión inicial con doGet()
//  v2 - Fix CORS: doPost() con Content-Type: text/plain
//  v3 - Fix Google Doc: texto plano en lugar de HTML crudo
//  v4 - Fix definitivo Doc y Calendar: parser parseHtmlALineas()
//  v5 - Fix Sheet: columna E "Texto" con contenido legible
//  v6 - Título inteligente en Google Calendar basado en la
//       primera línea de la nota
//  v7 - PostIts compartidos: nueva hoja "PostIts" con acciones
//       getPostIts, crearPostIt, editarPostIt, borrarPostIt
//       Columnas PostIts: ID | Texto | Color | Autor | FechaHora
//  v8 - Navegación de fechas (UI v10):
//       · getData ahora incluye "fechasDisponibles" (array de
//         strings yyyy-MM-dd con notas) y "notasHoy"
//       · Nueva acción "getNotasFecha": devuelve notas de una
//         fecha específica + fechasDisponibles actualizado
//       · leerNotasHoy() refactorizada: acepta fecha override
//  v9 - Toggle horario en Anotador (UI v11):
//       · guardarNota() acepta horaInicio (HH:mm) y duracionMin
//         opcionales. Si presentes:
//         - Calendario: evento con hora exacta (inicio + duración)
//         - Sheet/Doc: segunda línea "13:00 a 14:15 (75 min)"
//       · Retrocompatible: si no vienen, comportamiento idéntico a v8
//  v9.1 - Horario visible en panel HOY (UI v11.1):
//       · guardarNota() inyecta <p class="nota-horario">⏱ 13:00 a 14:15 (75 min)</p>
//         al inicio del HTML contenido cuando tieneHorario es true
//       · Así el panel HOY renderiza la línea de horario sin cambios en el frontend
//  v9.2 - Métricas y keep-alive (UI v11.2):
//       · Nueva acción "ping": devuelve { ok: true, pong: true, ms: N }
//         sin leer ninguna hoja — usada por el keep-alive del frontend
//       · Todas las respuestas incluyen "_ms" con el tiempo de
//         procesamiento interno en milisegundos (para diagnóstico)
//
//  HOJAS REQUERIDAS EN EL SPREADSHEET:
//    Config      → parámetros generales (nombre, doc ID, cal ID, etc.)
//    Etiquetas   → lista de etiquetas para el anotador
//    Herramientas→ botones de la barra inferior (nombre, url, icono)
//    Notas       → Fecha | FechaHora | Etiqueta | Contenido (HTML) | Texto
//    Usuarios    → email | nombre | activo (checkbox)
//    PostIts     → ID | Texto | Color | Autor | FechaHora
//
//  DEPLOY COMO WEB APP:
//    · Ejecutar como: Yo (el propietario)
//    · Quien tiene acceso: Cualquier usuario con cuenta Google
//      (la validación la hace verificarUsuario())
//
//  Autor: generado con Claude
// ============================================================


// ─────────────────────────────────────────────────────────────
//  CONSTANTES DE VERSIÓN
// ─────────────────────────────────────────────────────────────
const VERSION  = 'v9.2';
const TIMEZONE = 'America/Argentina/Buenos_Aires';


// ─────────────────────────────────────────────────────────────
//  doPost — punto de entrada PRINCIPAL (usado por GitHub Pages)
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  const t0 = Date.now(); // v9.2: timestamp inicio para medir tiempo de procesamiento

  try {
    let params = {};
    if (e && e.postData && e.postData.contents) {
      try { params = JSON.parse(e.postData.contents); } catch { params = {}; }
    }

    const action = params.action || 'getData';
    let result;

    switch (action) {

      // v9.2: ping liviano para keep-alive — no lee ninguna hoja
      case 'ping':
        result = { ok: true, pong: true };
        break;

      case 'getData':
        result = getDataMesa(params.email || '');
        break;

      case 'guardarNota':
        result = guardarNota({
          email       : params.email       || '',
          etiqueta    : params.etiqueta    || 'General',
          contenido   : params.contenido   || '',
          fechaHora   : params.fechaHora   || '',
          horaInicio  : params.horaInicio  || '',   // v9: opcional "HH:mm"
          duracionMin : params.duracionMin || 0     // v9: opcional número
        });
        break;

      case 'verificar':
        result = { ok: true, autorizado: verificarUsuario(params.email || '') };
        break;

      // ── PostIts ────────────────────────────────────────────
      case 'getPostIts':
        result = getPostIts(params.email || '');
        break;

      case 'crearPostIt':
        result = crearPostIt({
          email    : params.email     || '',
          texto    : params.texto     || '',
          color    : params.color     || 'yellow',
          fechaHora: params.fechaHora || ''
        });
        break;

      case 'editarPostIt':
        result = editarPostIt({
          email: params.email || '',
          id   : params.id    || '',
          texto: params.texto || '',
          color: params.color || 'yellow'
        });
        break;

      case 'borrarPostIt':
        result = borrarPostIt({
          email: params.email || '',
          id   : params.id    || ''
        });
        break;

      // ── v8: notas por fecha específica ────────────────────
      case 'getNotasFecha':
        result = getNotasFecha(params.email || '', params.fecha || '');
        break;

      default:
        result = { ok: false, error: 'Acción desconocida: ' + action };
    }

    // v9.2: incluir tiempo de procesamiento interno en la respuesta
    output.setContent(JSON.stringify({ version: VERSION, _ms: Date.now() - t0, ...result }));

  } catch (err) {
    output.setContent(JSON.stringify({
      version: VERSION,
      _ms    : Date.now() - t0,
      ok     : false,
      error  : 'doPost falló: ' + err.message
    }));
  }

  return output;
}


// ─────────────────────────────────────────────────────────────
//  doGet — para pruebas manuales desde el navegador
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || 'getData';
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    let result;
    switch (action) {
      case 'getData':
        result = getDataMesa(params.email || '');
        break;
      case 'verificar':
        result = { ok: true, autorizado: verificarUsuario(params.email || '') };
        break;
      case 'getPostIts':
        result = getPostIts(params.email || '');
        break;
      default:
        result = { ok: false, info: 'Usá POST para operaciones de escritura.' };
    }
    output.setContent(JSON.stringify({ version: VERSION, ...result }));
  } catch (err) {
    output.setContent(JSON.stringify({ version: VERSION, ok: false, error: err.message }));
  }

  return output;
}


// ─────────────────────────────────────────────────────────────
//  getDataMesa — devuelve todo lo necesario para renderizar la UI
// ─────────────────────────────────────────────────────────────
function getDataMesa(email) {
  if (email && !verificarUsuario(email)) {
    return { ok: false, autorizado: false, error: 'Acceso denegado' };
  }

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = leerConfig(ss);

  // Etiquetas
  const sheetEtiq = ss.getSheetByName('Etiquetas');
  const etiquetas = sheetEtiq && sheetEtiq.getLastRow() > 1
    ? sheetEtiq.getRange(2, 1, sheetEtiq.getLastRow() - 1, 1)
        .getValues().flat()
        .map(v => String(v).trim())
        .filter(v => v.length > 0)
    : ['General', 'Reunión', 'Tarea', 'Decisión'];

  // Herramientas
  const sheetHerr = ss.getSheetByName('Herramientas');
  const herramientas = sheetHerr && sheetHerr.getLastRow() > 1
    ? sheetHerr.getRange(2, 1, sheetHerr.getLastRow() - 1, 3)
        .getValues()
        .map(([nombre, url, emoji]) => ({
          nombre: String(nombre).trim(),
          url   : String(url).trim(),
          emoji : String(emoji).trim() || '🔗'
        }))
        .filter(h => h.nombre && h.url)
    : [];

  const notasHoy          = leerNotasHoy(ss);
  const fechasDisponibles = getFechasDisponibles(ss);
  const refran            = obtenerRefranDelDia();

  return { ok: true, autorizado: true, config: cfg, etiquetas, herramientas, notasHoy, fechasDisponibles, refran };
}


// ─────────────────────────────────────────────────────────────
//  POSTITS
// ─────────────────────────────────────────────────────────────
function getPostIts(email) {
  if (email && !verificarUsuario(email)) {
    return { ok: false, autorizado: false, error: 'Acceso denegado' };
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PostIts');

  if (!sheet || sheet.getLastRow() <= 1) {
    return { ok: true, postits: [] };
  }

  const filas = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();

  const postits = filas
    .filter(([id]) => id && String(id).trim().length > 0)
    .map(([id, texto, color, autor, fechaHora]) => ({
      id       : String(id).trim(),
      texto    : String(texto).trim(),
      color    : String(color).trim() || 'yellow',
      autor    : String(autor).trim(),
      fechaHora: fechaHora instanceof Date
        ? Utilities.formatDate(fechaHora, TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
        : String(fechaHora).trim()
    }));

  return { ok: true, postits };
}

function crearPostIt({ email, texto, color, fechaHora }) {
  if (!email || !verificarUsuario(email)) {
    return { ok: false, error: 'Acceso denegado' };
  }
  if (!texto || texto.trim().length === 0) {
    return { ok: false, error: 'Texto vacío' };
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PostIts');

  if (!sheet) {
    return { ok: false, error: 'Hoja PostIts no encontrada. Ejecutá setupHojas().' };
  }

  const id      = 'pi_' + new Date().getTime();
  const ahora   = fechaHora ? new Date(fechaHora) : new Date();
  const fecStr  = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, 5).setValues([[
    id,
    texto.trim(),
    color || 'yellow',
    email,
    fecStr
  ]]);

  return { ok: true, id };
}

function editarPostIt({ email, id, texto, color }) {
  if (!email || !verificarUsuario(email)) {
    return { ok: false, error: 'Acceso denegado' };
  }
  if (!id) return { ok: false, error: 'ID requerido' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PostIts');

  if (!sheet || sheet.getLastRow() <= 1) {
    return { ok: false, error: 'PostIt no encontrado' };
  }

  const filas = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const idx   = filas.findIndex(([rowId]) => String(rowId).trim() === String(id).trim());

  if (idx === -1) return { ok: false, error: 'PostIt no encontrado: ' + id };

  const filaSheet = idx + 2;
  if (texto !== undefined && texto !== null) {
    sheet.getRange(filaSheet, 2).setValue(String(texto).trim());
  }
  if (color !== undefined && color !== null) {
    sheet.getRange(filaSheet, 3).setValue(String(color).trim());
  }

  return { ok: true };
}

function borrarPostIt({ email, id }) {
  if (!email || !verificarUsuario(email)) {
    return { ok: false, error: 'Acceso denegado' };
  }
  if (!id) return { ok: false, error: 'ID requerido' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PostIts');

  if (!sheet || sheet.getLastRow() <= 1) {
    return { ok: false, error: 'PostIt no encontrado' };
  }

  const filas = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const idx   = filas.findIndex(([rowId]) => String(rowId).trim() === String(id).trim());

  if (idx === -1) return { ok: false, error: 'PostIt no encontrado: ' + id };

  sheet.deleteRow(idx + 2);
  return { ok: true };
}


// ─────────────────────────────────────────────────────────────
//  parseHtmlALineas
// ─────────────────────────────────────────────────────────────
function parseHtmlALineas(html) {
  if (!html) return [];
  const lineas = [];
  let h = html.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

  function textoInline(s) {
    return s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .trim();
  }

  h = h.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, function(_, inner) {
    let num = 0;
    const items = [];
    inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, function(__, liContent) {
      num++;
      items.push('__OL__' + num + '. ' + textoInline(liContent));
    });
    return items.join('__NL__') + '__NL__';
  });

  h = h.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, function(_, inner) {
    const items = [];
    inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, function(__, liContent) {
      items.push('__UL__• ' + textoInline(liContent));
    });
    return items.join('__NL__') + '__NL__';
  });

  h = h.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, function(_, inner) {
    return '__P__' + textoInline(inner) + '__NL__';
  });

  const partes = h.split('__NL__');
  partes.forEach(parte => {
    parte = parte.trim();
    if (!parte) return;
    if (parte.startsWith('__OL__')) {
      lineas.push({ texto: parte.replace('__OL__', ''), tipo: 'ol_item' });
    } else if (parte.startsWith('__UL__')) {
      lineas.push({ texto: parte.replace('__UL__', ''), tipo: 'ul_item' });
    } else if (parte.startsWith('__P__')) {
      const t = parte.replace('__P__', '').trim();
      if (t) lineas.push({ texto: t, tipo: 'normal' });
    } else {
      const t = textoInline(parte).trim();
      if (t) lineas.push({ texto: t, tipo: 'normal' });
    }
  });

  return lineas;
}

function lineasATextoCalendar(lineas) {
  return lineas.map(l => l.texto).join('\n');
}

function obtenerTituloNota(lineas) {
  if (!lineas || lineas.length === 0) return '';
  const primeraLinea = lineas.find(l => l.texto && l.texto.trim().length > 0);
  if (!primeraLinea) return '';
  const texto = primeraLinea.texto.trim();
  return texto.length <= 20
    ? '[' + texto + ']'
    : '\u2026' + texto.slice(-20);
}


// ─────────────────────────────────────────────────────────────
//  construirEtiquetaHorario — v9
//  Genera "13:00 a 14:15 (75 min)" a partir de hora inicio + duración
// ─────────────────────────────────────────────────────────────
function construirEtiquetaHorario(horaInicio, duracionMin) {
  if (!horaInicio || !duracionMin) return '';
  try {
    const [hh, mm] = horaInicio.split(':').map(Number);
    const totalMin = hh * 60 + mm + Number(duracionMin);
    const hFin = Math.floor(totalMin / 60) % 24;
    const mFin = totalMin % 60;
    const fmtHora = (h, m) =>
      String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    return fmtHora(hh, mm) + ' a ' + fmtHora(hFin, mFin) + ' (' + duracionMin + ' min)';
  } catch(e) {
    return '';
  }
}


// ─────────────────────────────────────────────────────────────
//  guardarNota — v9: acepta horaInicio y duracionMin opcionales
// ─────────────────────────────────────────────────────────────
function guardarNota({ email, etiqueta, contenido, fechaHora, horaInicio, duracionMin }) {
  if (!email || !verificarUsuario(email)) {
    return { ok: false, error: 'Acceso denegado' };
  }
  if (!contenido || contenido.trim().length === 0) {
    return { ok: false, error: 'Contenido vacío' };
  }

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = leerConfig(ss);

  // ── Calcular fecha/hora base ──────────────────────────────
  let ahora = fechaHora ? new Date(fechaHora) : new Date();

  // v9: si hay horaInicio, ajustar la hora del objeto Date
  const tieneHorario = horaInicio && String(horaInicio).trim() && Number(duracionMin) > 0;
  if (tieneHorario) {
    try {
      const [hh, mm] = String(horaInicio).split(':').map(Number);
      ahora.setHours(hh, mm, 0, 0);
    } catch(e) { /* usar hora actual si falla el parse */ }
  }

  const fechaStr     = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd');
  const fechaHoraStr = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  const lineas     = parseHtmlALineas(contenido);
  const tituloNota = obtenerTituloNota(lineas);

  // v9: etiqueta de horario para Doc/Sheet
  const etiquetaHorario = tieneHorario
    ? construirEtiquetaHorario(horaInicio, Number(duracionMin))
    : '';

  // v9.1: si hay horario, inyectarlo al inicio del HTML contenido
  // para que el panel HOY lo renderice como línea estilizada
  const contenidoFinal = (tieneHorario && etiquetaHorario)
    ? `<p class="nota-horario">⏱ ${etiquetaHorario}</p>${contenido}`
    : contenido;

  // ── 1. Sheet ─────────────────────────────────────────────
  const sheetNotas = ss.getSheetByName('Notas');
  if (sheetNotas) {
    let textoSheet = lineasATextoCalendar(lineas);
    if (etiquetaHorario) {
      // Insertar línea de horario después de la primera línea
      const lineasTexto = textoSheet.split('\n');
      lineasTexto.splice(1, 0, etiquetaHorario);
      textoSheet = lineasTexto.join('\n');
    }
    sheetNotas.insertRowBefore(2);
    sheetNotas.getRange(2, 1, 1, 5).setValues([[
      fechaStr, fechaHoraStr, etiqueta, contenidoFinal, textoSheet
    ]]);
  }

  // ── 2. Google Doc ────────────────────────────────────────
  let docUrl = '';
  if (cfg.docId) {
    try {
      const doc  = DocumentApp.openById(cfg.docId);
      const body = doc.getBody();

      body.insertHorizontalRule(0);

      const lineasInverso = lineas.slice().reverse();
      lineasInverso.forEach(linea => {
        const p = body.insertParagraph(0, linea.texto);
        p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
        if (linea.tipo === 'ol_item' || linea.tipo === 'ul_item') {
          p.setIndentStart(18);
          p.setIndentFirstLine(0);
        } else {
          p.setIndentStart(0);
          p.setIndentFirstLine(0);
        }
      });

      // v9: insertar etiqueta de horario como segunda línea del doc
      if (etiquetaHorario) {
        const pHorario = body.insertParagraph(1, etiquetaHorario);
        pHorario.setHeading(DocumentApp.ParagraphHeading.NORMAL);
        pHorario.setItalic(true);
        pHorario.setForegroundColor('#5a6a85');
      }

      const encabezadoDoc = fechaHoraStr + '  ·  ' + etiqueta;
      const parrafoTitulo = body.insertParagraph(0, encabezadoDoc);
      parrafoTitulo.setHeading(DocumentApp.ParagraphHeading.HEADING2);

      doc.saveAndClose();
      docUrl = 'https://docs.google.com/document/d/' + cfg.docId;
    } catch (docErr) {
      Logger.log('Error al escribir en Doc v9: ' + docErr.message);
    }
  }

  // ── 3. Google Calendar ───────────────────────────────────
  let calUrl = '';
  if (cfg.calendarId) {
    try {
      const cal = CalendarApp.getCalendarById(cfg.calendarId);
      let fin;

      if (tieneHorario) {
        // v9: usar duración exacta del toggle
        fin = new Date(ahora.getTime() + Number(duracionMin) * 60 * 1000);
      } else {
        // Comportamiento anterior: +30 min
        fin = new Date(ahora.getTime() + 30 * 60 * 1000);
      }

      const descripcion  = lineasATextoCalendar(lineas);
      let tituloEvento   = tituloNota ? etiqueta + '  ·  ' + tituloNota : etiqueta;
      if (etiquetaHorario) {
        tituloEvento += '  (' + etiquetaHorario.split('(')[0].trim() + ')';
      }

      const evento = cal.createEvent(tituloEvento, ahora, fin, { description: descripcion });
      calUrl = evento.getId();
    } catch (calErr) {
      Logger.log('Error al escribir en Calendar v9: ' + calErr.message);
    }
  }

  return { ok: true, fechaHora: fechaHoraStr, etiqueta, docUrl, calUrl };
}


// ─────────────────────────────────────────────────────────────
//  leerNotasHoy — v8 (sin cambios)
// ─────────────────────────────────────────────────────────────
function leerNotasHoy(ss, fechaOverride) {
  const sheetNotas = ss.getSheetByName('Notas');
  if (!sheetNotas || sheetNotas.getLastRow() <= 1) return [];

  const fechaFiltro = (fechaOverride && fechaOverride.trim())
    ? fechaOverride.trim().substring(0, 10)
    : Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  const filas = sheetNotas.getRange(2, 1, sheetNotas.getLastRow() - 1, 4).getValues();

  return filas
    .filter(([fecha]) => {
      const fechaStr = fecha instanceof Date
        ? Utilities.formatDate(fecha, TIMEZONE, 'yyyy-MM-dd')
        : String(fecha).substring(0, 10);
      return fechaStr === fechaFiltro;
    })
    .map(([fecha, fechaHora, etiqueta, contenido]) => ({
      fecha    : fecha instanceof Date
        ? Utilities.formatDate(fecha, TIMEZONE, 'yyyy-MM-dd')
        : String(fecha).substring(0, 10),
      fechaHora: fechaHora instanceof Date
        ? Utilities.formatDate(fechaHora, TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
        : String(fechaHora),
      etiqueta : String(etiqueta).trim(),
      contenido: String(contenido).trim()
    }))
    .slice(0, 30);
}


// ─────────────────────────────────────────────────────────────
//  getFechasDisponibles — v8 (sin cambios)
// ─────────────────────────────────────────────────────────────
function getFechasDisponibles(ss) {
  const sheetNotas = ss.getSheetByName('Notas');
  if (!sheetNotas || sheetNotas.getLastRow() <= 1) return [];

  const filas = sheetNotas.getRange(2, 1, sheetNotas.getLastRow() - 1, 1).getValues();
  const fechasSet = new Set();

  filas.forEach(([fecha]) => {
    const f = fecha instanceof Date
      ? Utilities.formatDate(fecha, TIMEZONE, 'yyyy-MM-dd')
      : String(fecha).substring(0, 10);
    if (f && f.length === 10 && f > '2020-01-01') fechasSet.add(f);
  });

  return Array.from(fechasSet).sort().reverse().slice(0, 60);
}


// ─────────────────────────────────────────────────────────────
//  getNotasFecha — v8 (sin cambios)
// ─────────────────────────────────────────────────────────────
function getNotasFecha(email, fecha) {
  if (email && !verificarUsuario(email)) {
    return { ok: false, autorizado: false, error: 'Acceso denegado' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const notas             = leerNotasHoy(ss, fecha);
  const fechasDisponibles = getFechasDisponibles(ss);

  return { ok: true, notas, fechasDisponibles };
}


// ─────────────────────────────────────────────────────────────
//  leerConfig
// ─────────────────────────────────────────────────────────────
function leerConfig(ss) {
  const sheet = ss.getSheetByName('Config');
  if (!sheet || sheet.getLastRow() <= 1) return {};

  const filas = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const cfg   = {};
  filas.forEach(([param, valor]) => {
    const key = String(param).trim().toLowerCase()
      .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    cfg[key] = String(valor).trim();
  });

  return {
    nombre    : cfg.nombre_del_workspace || 'Mesa de Trabajo',
    docId     : cfg.google_doc_id        || '',
    calendarId: cfg.google_calendar_id   || '',
    logoEmoji : cfg.logo_emoji           || '🗂️',
    timezone  : TIMEZONE
  };
}


// ─────────────────────────────────────────────────────────────
//  verificarUsuario
// ─────────────────────────────────────────────────────────────
function verificarUsuario(email) {
  if (!email) return false;
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const usuarios = ss.getSheetByName('Usuarios');
  if (!usuarios || usuarios.getLastRow() <= 1) return false;
  const filas = usuarios.getRange(2, 1, usuarios.getLastRow() - 1, 3).getValues();
  return filas.some(([correo, , activo]) =>
    String(correo).trim().toLowerCase() === email.toLowerCase() && activo === true
  );
}


// ─────────────────────────────────────────────────────────────
//  obtenerRefranDelDia
// ─────────────────────────────────────────────────────────────
function obtenerRefranDelDia() {
  const refranes = [
    'No dejes para mañana lo que puedes hacer hoy.',
    'El tiempo es oro.',
    'Quien mucho abarca, poco aprieta.',
    'A mal tiempo, buena cara.',
    'Más vale tarde que nunca.',
    'El que madruga, Dios lo ayuda.',
    'En boca cerrada no entran moscas.',
    'No hay mal que por bien no venga.',
    'Camarón que se duerme, se lo lleva la corriente.',
    'A caballo regalado no se le miran los dientes.',
    'Dime con quién andas y te diré quién eres.',
    'Ojos que no ven, corazón que no siente.',
    'Más vale pájaro en mano que ciento volando.',
    'Al mal paso darle prisa.',
    'No todo lo que brilla es oro.',
    'Agua que no has de beber, déjala correr.',
    'El hábito no hace al monje.',
    'A Dios rogando y con el mazo dando.',
    'Poco a poco se va lejos.',
    'El que no arriesga, no gana.',
    'La práctica hace al maestro.',
    'Errando se aprende.',
    'El tiempo todo lo cura.',
    'Donde hay gana, hay maña.',
    'Lo cortés no quita lo valiente.',
    'Quien siembra vientos, recoge tempestades.',
    'Un clavo saca a otro clavo.',
    'Haz el bien sin mirar a quién.',
    'Más vale prevenir que curar.',
    'La unión hace la fuerza.',
    'No hay peor ciego que el que no quiere ver.',
    'Cada oveja con su pareja.',
    'Lo que bien empieza, bien acaba.',
    'Mente sana en cuerpo sano.',
    'La experiencia es la madre de la ciencia.',
    'Renovarse o morir.',
    'El saber no ocupa lugar.',
    'A grandes males, grandes remedios.',
    'Los árboles no dejan ver el bosque.',
    'El camino se hace al andar.',
    'Nadie es profeta en su tierra.',
    'La curiosidad mató al gato.',
    'El mejor remedio es la paciencia.',
    'Piensa antes de hablar.',
    'No hay atajo sin trabajo.',
    'Las palabras se las lleva el viento.',
    'Un paso a la vez.',
    'La constancia es la clave del éxito.',
    'Hoy es el primer día del resto de tu vida.',
    'La simplicidad es la máxima sofisticación.',
    'Haz lo que puedas, con lo que tengas, donde estés.',
    'El foco es la diferencia entre lo bueno y lo excelente.',
    'La claridad precede a la maestría.',
    'Cada sistema está perfectamente diseñado para obtener los resultados que obtiene.',
    'Lo urgente rara vez es importante; lo importante rara vez es urgente.',
    'La energía sigue al foco.',
    'Una decisión bien tomada vale más que diez apuradas.',
    'El contexto es todo.',
    'Documenta mientras recuerdas.',
    'La mejor herramienta es la que usas.',
    'Todo sistema mejora con el tiempo si le prestas atención.',
    'Lo que no se mide, no se gestiona.',
    'Cada nota de hoy es un mapa para mañana.',
    'La memoria es limitada; el registro es ilimitado.',
    'Haz de cada día una obra maestra.',
    'La disciplina es libertad.',
    'Mejor hecho que perfecto.',
  ];

  const hoy    = new Date();
  const inicio = new Date(hoy.getFullYear(), 0, 0);
  const diff   = hoy - inicio;
  const diaAno = Math.floor(diff / (1000 * 60 * 60 * 24));
  return refranes[diaAno % refranes.length];
}


// ─────────────────────────────────────────────────────────────
//  setupHojas
// ─────────────────────────────────────────────────────────────
function setupHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  let config = ss.getSheetByName('Config');
  if (!config) config = ss.insertSheet('Config');
  config.clearContents();
  const cfgData = [
    ['Parámetro',              'Valor'],
    ['Nombre del Workspace',   'Mi Mesa de Trabajo'],
    ['Google Doc ID',          '← pegá el ID del Google Doc aquí'],
    ['Google Calendar ID',     '← pegá el ID del calendario aquí'],
    ['Logo Emoji',             '🗂️'],
  ];
  config.getRange(1, 1, cfgData.length, 2).setValues(cfgData);
  config.getRange(1, 1, 1, 2).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
  config.setColumnWidth(1, 220);
  config.setColumnWidth(2, 380);

  let etiq = ss.getSheetByName('Etiquetas');
  if (!etiq) etiq = ss.insertSheet('Etiquetas');
  etiq.clearContents();
  etiq.getRange(1, 1).setValue('Etiqueta');
  etiq.getRange(1, 1).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
  etiq.getRange(2, 1, 8, 1).setValues([
    ['General'], ['Reunión'], ['Tarea'], ['Decisión'],
    ['Idea'], ['Seguimiento'], ['Bloqueador'], ['Hito']
  ]);
  etiq.setColumnWidth(1, 180);

  let herr = ss.getSheetByName('Herramientas');
  if (!herr) herr = ss.insertSheet('Herramientas');
  herr.clearContents();
  herr.getRange(1, 1, 1, 3).setValues([['Nombre', 'URL', 'Emoji']]);
  herr.getRange(1, 1, 1, 3).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
  herr.getRange(2, 1, 8, 3).setValues([
    ['Drive',    'https://drive.google.com',    '💾'],
    ['Gmail',    'https://mail.google.com',     '📧'],
    ['Calendar', 'https://calendar.google.com', '📅'],
    ['Meet',     'https://meet.google.com',     '📹'],
    ['Docs',     'https://docs.google.com',     '📄'],
    ['Sheets',   'https://sheets.google.com',   '📊'],
    ['Tareas',   'https://tasks.google.com',    '✅'],
    ['Keep',     'https://keep.google.com',     '📌'],
  ]);

  let notas = ss.getSheetByName('Notas');
  if (!notas) notas = ss.insertSheet('Notas');
  if (notas.getLastRow() === 0) {
    notas.getRange(1, 1, 1, 5).setValues([['Fecha', 'FechaHora', 'Etiqueta', 'Contenido (HTML)', 'Texto']]);
    notas.getRange(1, 1, 1, 5).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
    notas.setFrozenRows(1);
  }

  let usuarios = ss.getSheetByName('Usuarios');
  if (!usuarios) usuarios = ss.insertSheet('Usuarios');
  if (usuarios.getLastRow() === 0) {
    usuarios.getRange(1, 1, 1, 3).setValues([['Usuario', 'Nombre', 'Activo']]);
    usuarios.getRange(1, 1, 1, 3).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
    const emailOwner = Session.getActiveUser().getEmail();
    usuarios.getRange(2, 1, 1, 2).setValues([[emailOwner, 'Administrador']]);
    usuarios.getRange(2, 3).insertCheckboxes();
    usuarios.getRange(2, 3).setValue(true);
  }

  setupPostIts(ss, false);

  ui.alert(
    '✅ Mesa de Trabajo v9 — Hojas creadas\n\n' +
    '1. Completá "Config" con el ID del Google Doc y del Calendario.\n' +
    '2. Editá "Etiquetas" con tus categorías.\n' +
    '3. Editá "Herramientas" con los accesos rápidos que uses.\n' +
    '4. Implementá como Web App (Ejecutar como: tú; Acceso: cualquier cuenta Google).\n' +
    '5. Copiá la URL del Web App en el index_v11.html de GitHub Pages.'
  );
}

function setupPostIts(ss, mostrarAlert) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (mostrarAlert === undefined) mostrarAlert = true;

  let sheet = ss.getSheetByName('PostIts');
  if (!sheet) {
    sheet = ss.insertSheet('PostIts');
    sheet.getRange(1, 1, 1, 5).setValues([['ID', 'Texto', 'Color', 'Autor', 'FechaHora']]);
    sheet.getRange(1, 1, 1, 5).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (mostrarAlert) {
      SpreadsheetApp.getUi().alert('✅ Hoja "PostIts" creada correctamente.');
    }
  } else {
    if (mostrarAlert) {
      SpreadsheetApp.getUi().alert('ℹ️ La hoja "PostIts" ya existía. No se modificó.');
    }
  }
}


// ─────────────────────────────────────────────────────────────
//  MENÚ PERSONALIZADO
// ─────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗂️ Mesa de Trabajo')
    .addItem('1. Crear hojas (primera vez)',             'setupHojas')
    .addItem('1b. Migrar a v5/v6: columna Texto',        'actualizarEncabezadoNotas')
    .addItem('1c. Migrar a v7: crear hoja PostIts',      'setupPostIts')
    .addSeparator()
    .addItem('Probar getData (logs)',                     'testGetData')
    .addToUi();
}

function testGetData() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const cfg    = leerConfig(ss);
  const notas  = leerNotasHoy(ss);
  const fechas = getFechasDisponibles(ss);
  const pis    = getPostIts('');
  Logger.log('Config: '             + JSON.stringify(cfg));
  Logger.log('Notas hoy: '          + JSON.stringify(notas));
  Logger.log('Fechas disponibles: ' + JSON.stringify(fechas));
  Logger.log('PostIts: '            + JSON.stringify(pis));
  SpreadsheetApp.getUi().alert('Revisá los Logs (Ver → Registros).');
}

function actualizarEncabezadoNotas() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const notas = ss.getSheetByName('Notas');
  const ui    = SpreadsheetApp.getUi();

  if (!notas) {
    ui.alert('No existe la hoja Notas. Ejecutá setupHojas() primero.');
    return;
  }

  notas.getRange(1, 1, 1, 5).setValues([['Fecha', 'FechaHora', 'Etiqueta', 'Contenido (HTML)', 'Texto']]);
  notas.getRange(1, 1, 1, 5).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
  notas.setFrozenRows(1);

  const ultimaFila = notas.getLastRow();
  let rellenadas = 0;
  if (ultimaFila > 1) {
    for (let i = 2; i <= ultimaFila; i++) {
      const colE = notas.getRange(i, 5).getValue();
      if (colE === '' || colE === null) {
        const html = String(notas.getRange(i, 4).getValue());
        if (html.trim()) {
          const lineas = parseHtmlALineas(html);
          const texto  = lineasATextoCalendar(lineas);
          notas.getRange(i, 5).setValue(texto);
          rellenadas++;
        }
      }
    }
  }
  ui.alert('✅ Encabezado actualizado.\nSe completó la columna Texto en ' + rellenadas + ' fila(s).');
}
