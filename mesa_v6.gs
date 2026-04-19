// ============================================================
//  MESA DE TRABAJO  v6
//  Google Apps Script — Backend API + configuración
//
//  HISTORIAL DE VERSIONES:
//  v1 - Versión inicial con doGet()
//  v2 - Fix CORS: doPost() con Content-Type: text/plain
//  v3 - Fix Google Doc: texto plano en lugar de HTML crudo
//  v4 - Fix definitivo Doc y Calendar: parser parseHtmlALineas()
//  v5 - Fix Sheet: columna E "Texto" con contenido legible
//  v6 - Título inteligente en Google Calendar basado en la
//       primera línea de la nota:
//       · ≤20 chars → [primera línea]   (resaltado con [ ])
//       · >20 chars → …últimos 20 chars  (truncado por la derecha)
//       · Título del evento: "Etiqueta · [título]" o "Etiqueta · …truncado"
//       · La hora desaparece del título (ya está en el horario)
//       · El Doc NO cambia — sigue con "fechaHoraStr  ·  Etiqueta"
//
//  HOJAS REQUERIDAS EN EL SPREADSHEET:
//    Config      → parámetros generales (nombre, doc ID, cal ID, etc.)
//    Etiquetas   → lista de etiquetas para el anotador
//    Herramientas→ botones de la barra inferior (nombre, url, icono)
//    Notas       → Fecha | FechaHora | Etiqueta | Contenido (HTML) | Texto
//    Usuarios    → email | nombre | activo (checkbox)
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
const VERSION  = 'v6';
const TIMEZONE = 'America/Argentina/Buenos_Aires';


// ─────────────────────────────────────────────────────────────
//  doPost — punto de entrada PRINCIPAL (usado por GitHub Pages)
//
//  POR QUÉ POST y no GET:
//  Google Apps Script no envía el header CORS
//  "Access-Control-Allow-Origin" en respuestas a fetch() GET
//  desde dominios externos. El navegador bloquea la respuesta.
//
//  La solución es usar POST con Content-Type: 'text/plain'.
//  Esto evita el "preflight" OPTIONS (que GAS no soporta).
//  GAS sí responde POST directamente con los headers necesarios.
//
//  El HTML envía: fetch(GAS_URL, { method:'POST',
//    headers: {'Content-Type':'text/plain'},
//    body: JSON.stringify({ action, email, ... }) })
//
//  Este handler parsea e.postData.contents como JSON.
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    // Parsear el body JSON que manda el HTML
    let params = {};
    if (e && e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch {
        params = {};
      }
    }

    const action = params.action || 'getData';
    let result;

    switch (action) {

      case 'getData':
        result = getDataMesa(params.email || '');
        break;

      case 'guardarNota':
        result = guardarNota({
          email     : params.email     || '',
          etiqueta  : params.etiqueta  || 'General',
          contenido : params.contenido || '',
          fechaHora : params.fechaHora || ''
        });
        break;

      case 'verificar':
        result = { ok: true, autorizado: verificarUsuario(params.email || '') };
        break;

      default:
        result = { ok: false, error: 'Acción desconocida: ' + action };
    }

    output.setContent(JSON.stringify({ version: VERSION, ...result }));

  } catch (err) {
    output.setContent(JSON.stringify({
      version : VERSION,
      ok      : false,
      error   : 'doPost falló: ' + err.message
    }));
  }

  return output;
}


// ─────────────────────────────────────────────────────────────
//  doGet — se mantiene para pruebas manuales desde el navegador
//  y compatibilidad. El HTML NO usa este endpoint.
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

  // Verificar acceso
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

  // Herramientas (barra inferior)
  const sheetHerr = ss.getSheetByName('Herramientas');
  const herramientas = sheetHerr && sheetHerr.getLastRow() > 1
    ? sheetHerr.getRange(2, 1, sheetHerr.getLastRow() - 1, 3)
        .getValues()
        .map(([nombre, url, emoji]) => ({
          nombre : String(nombre).trim(),
          url    : String(url).trim(),
          emoji  : String(emoji).trim() || '🔗'
        }))
        .filter(h => h.nombre && h.url)
    : [];

  // Notas de hoy (desde hoja Notas)
  const notasHoy = leerNotasHoy(ss);

  // Refrán del día (sacado de una lista fija — se puede extender)
  const refran = obtenerRefranDelDia();

  return {
    ok          : true,
    autorizado  : true,
    config      : cfg,
    etiquetas,
    herramientas,
    notasHoy,
    refran
  };
}


// ─────────────────────────────────────────────────────────────
//  parseHtmlALineas — convierte HTML de Quill a array de objetos
//  { texto, tipo } donde tipo puede ser:
//    'normal'   → párrafo de texto
//    'ol_item'  → ítem de lista numerada  (con número)
//    'ul_item'  → ítem de lista con bullet
//
//  Soporta: <p>, <ol>, <ul>, <li>, <strong>, <em>, <u>, <a>, <br>
//  No requiere librerías externas — usa regex sobre el HTML.
// ─────────────────────────────────────────────────────────────
function parseHtmlALineas(html) {
  if (!html) return [];

  const lineas = [];

  // Normalizar saltos de línea y espacios extras
  let h = html.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Extraer el texto visible de una cadena HTML inline
  // (elimina tags pero preserva el texto)
  function textoInline(s) {
    return s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  // Procesar listas <ol> y <ul>
  // Reemplazamos cada bloque de lista con marcadores especiales
  // para poder extraerlos en orden
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

  // Procesar párrafos <p>
  h = h.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, function(_, inner) {
    return '__P__' + textoInline(inner) + '__NL__';
  });

  // Dividir por __NL__ y clasificar cada línea
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
      // texto sin clasificar (texto suelto fuera de tags)
      const t = textoInline(parte).trim();
      if (t) lineas.push({ texto: t, tipo: 'normal' });
    }
  });

  return lineas;
}


// ─────────────────────────────────────────────────────────────
//  lineasATextoCalendar — convierte array de lineas a string
//  legible para la descripción del evento de calendario
// ─────────────────────────────────────────────────────────────
function lineasATextoCalendar(lineas) {
  return lineas
    .map(l => l.texto)  // ul_item ya tiene "• ", ol_item ya tiene "1. "
    .join('\n');
}


// ─────────────────────────────────────────────────────────────
//  obtenerTituloNota — extrae un título de la primera línea
//  de la nota y lo formatea según su longitud:
//
//  · ≤ 20 caracteres → [primera línea]   (resaltado con corchetes)
//  · >  20 caracteres → …últimos 20 chars  (truncado por la derecha)
//
//  Recibe el array de lineas ya parseado por parseHtmlALineas().
//  Si no hay líneas, devuelve string vacío.
//  Usado solo para el título del evento de Google Calendar.
// ─────────────────────────────────────────────────────────────
function obtenerTituloNota(lineas) {
  if (!lineas || lineas.length === 0) return '';

  // Primera línea con texto real (ignorar vacíos)
  const primeraLinea = lineas.find(l => l.texto && l.texto.trim().length > 0);
  if (!primeraLinea) return '';

  const texto = primeraLinea.texto.trim();

  if (texto.length <= 20) {
    // Corto: resaltar con corchetes
    return '[' + texto + ']';
  } else {
    // Largo: tomar los últimos 20 caracteres con puntos suspensivos
    return '\u2026' + texto.slice(-20);   // …ultimos 20 chars
  }
}


// ─────────────────────────────────────────────────────────────
//  guardarNota — persiste en Sheet + Doc + Calendar  (v6)
//
//  · Sheet   → guarda contenido HTML (para renderizar en la UI)
//  · Doc     → parsea el HTML y escribe con API nativa de Docs:
//              cada línea es un párrafo, ítems de lista con sangría
//  · Calendar → mismas líneas convertidas a texto plano legible
// ─────────────────────────────────────────────────────────────
function guardarNota({ email, etiqueta, contenido, textoPlano, fechaHora }) {

  if (!email || !verificarUsuario(email)) {
    return { ok: false, error: 'Acceso denegado' };
  }
  if (!contenido || contenido.trim().length === 0) {
    return { ok: false, error: 'Contenido vacío' };
  }

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = leerConfig(ss);

  const ahora        = fechaHora ? new Date(fechaHora) : new Date();
  const fechaStr     = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd');
  const fechaHoraStr = Utilities.formatDate(ahora, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  // Parsear el HTML de Quill una sola vez → se usa en Doc, Calendar y Sheet
  const lineas = parseHtmlALineas(contenido);

  // Título inteligente basado en la primera línea de la nota
  const tituloNota = obtenerTituloNota(lineas);

  // ── 1. Guardar en hoja Notas ──────────────────────────────────────────
  //  · Columna D: HTML de Quill  → el panel "Hoy" lo renderiza como innerHTML
  //  · Columna E: Texto plano    → legible directamente en el Sheet
  const sheetNotas = ss.getSheetByName('Notas');
  if (sheetNotas) {
    const textoSheet = lineasATextoCalendar(lineas); // "• item\n1. item\ntexto"
    sheetNotas.insertRowBefore(2);
    sheetNotas.getRange(2, 1, 1, 5).setValues([[
      fechaStr, fechaHoraStr, etiqueta,
      contenido,    // col D: HTML para la UI
      textoSheet    // col E: texto plano legible en el Sheet
    ]]);
  }

  // ── 2. Guardar en Google Doc (párrafos nativos, sin HTML) ─────────────
  let docUrl = '';
  if (cfg.docId) {
    try {
      const doc  = DocumentApp.openById(cfg.docId);
      const body = doc.getBody();

      // Estrategia: insertar todo en índice 0 en orden INVERSO
      // para que el resultado final quede en el orden correcto.
      //
      // Estructura final deseada (de arriba a abajo):
      //   [HEADING2] 2026-04-19 14:32:00  ·  Reunión  ·  «Primer título»
      //   [NORMAL]   línea 1
      //   [NORMAL]   • ítem bullet          ← con sangría
      //   [NORMAL]   1. ítem numerado       ← con sangría
      //   [HR]       ──────────────────────

      // Paso 1 — HR al fondo (se inserta primero, queda al fondo)
      body.insertHorizontalRule(0);

      // Paso 2 — Líneas en orden inverso (se insertan en 0, van subiendo)
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

      // Paso 3 — Encabezado del Doc: formato simple sin título de nota
      // (el título inteligente se usa solo en Calendar)
      const encabezadoDoc = fechaHoraStr + '  \u00b7  ' + etiqueta;
      const parrafoTitulo = body.insertParagraph(0, encabezadoDoc);
      parrafoTitulo.setHeading(DocumentApp.ParagraphHeading.HEADING2);

      doc.saveAndClose();
      docUrl = 'https://docs.google.com/document/d/' + cfg.docId;
    } catch (docErr) {
      Logger.log('Error al escribir en Doc v6: ' + docErr.message);
    }
  }

  // ── 3. Guardar en Google Calendar ────────────────────────────────────
  // Título: "Etiqueta · [título corto]"  o  "Etiqueta · …truncado"
  // La hora ya queda en el horario del evento — no la repetimos en el título
  let calUrl = '';
  if (cfg.calendarId) {
    try {
      const cal         = CalendarApp.getCalendarById(cfg.calendarId);
      const fin         = new Date(ahora.getTime() + 30 * 60 * 1000);
      const descripcion = lineasATextoCalendar(lineas);

      const tituloEvento = tituloNota
        ? etiqueta + '  \u00b7  ' + tituloNota   // "Reunión · [Mi título]"
        : etiqueta;                                // "Reunión" (fallback)

      const evento = cal.createEvent(tituloEvento, ahora, fin, {
        description: descripcion
      });
      calUrl = evento.getId();
    } catch (calErr) {
      Logger.log('Error al escribir en Calendar v6: ' + calErr.message);
    }
  }

  return { ok: true, fechaHora: fechaHoraStr, etiqueta, docUrl, calUrl };
}


// ─────────────────────────────────────────────────────────────
//  leerNotasHoy — lee notas de hoy desde la hoja Notas
// ─────────────────────────────────────────────────────────────
function leerNotasHoy(ss) {
  const sheetNotas = ss.getSheetByName('Notas');
  if (!sheetNotas || sheetNotas.getLastRow() <= 1) return [];

  const hoy    = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  const filas  = sheetNotas.getRange(2, 1, sheetNotas.getLastRow() - 1, 4).getValues();

  return filas
    .filter(([fecha]) => {
      const fechaStr = fecha instanceof Date
        ? Utilities.formatDate(fecha, TIMEZONE, 'yyyy-MM-dd')
        : String(fecha).substring(0, 10);
      return fechaStr === hoy;
    })
    .map(([fecha, fechaHora, etiqueta, contenido]) => ({
      fecha     : fecha instanceof Date
        ? Utilities.formatDate(fecha, TIMEZONE, 'yyyy-MM-dd')
        : String(fecha).substring(0, 10),
      fechaHora : fechaHora instanceof Date
        ? Utilities.formatDate(fechaHora, TIMEZONE, 'yyyy-MM-dd HH:mm:ss')
        : String(fechaHora),
      etiqueta  : String(etiqueta).trim(),
      contenido : String(contenido).trim()
    }))
    .slice(0, 30); // máximo 30 notas por día en la vista
}


// ─────────────────────────────────────────────────────────────
//  leerConfig — lee parámetros de la hoja Config
// ─────────────────────────────────────────────────────────────
function leerConfig(ss) {
  const sheet = ss.getSheetByName('Config');
  if (!sheet || sheet.getLastRow() <= 1) return {};

  const filas = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const cfg   = {};
  filas.forEach(([param, valor]) => {
    const key = String(param).trim().toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    cfg[key] = String(valor).trim();
  });

  return {
    nombre      : cfg.nombre_del_workspace  || 'Mesa de Trabajo',
    docId       : cfg.google_doc_id         || '',
    calendarId  : cfg.google_calendar_id    || '',
    logoEmoji   : cfg.logo_emoji            || '🗂️',
    timezone    : TIMEZONE
  };
}


// ─────────────────────────────────────────────────────────────
//  verificarUsuario — valida email en hoja Usuarios
// ─────────────────────────────────────────────────────────────
function verificarUsuario(email) {
  if (!email) return false;

  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const usuarios = ss.getSheetByName('Usuarios');
  if (!usuarios || usuarios.getLastRow() <= 1) return false;

  const filas = usuarios.getRange(2, 1, usuarios.getLastRow() - 1, 3).getValues();
  return filas.some(([correo, , activo]) =>
    String(correo).trim().toLowerCase() === email.toLowerCase() &&
    activo === true
  );
}


// ─────────────────────────────────────────────────────────────
//  obtenerRefranDelDia — refrán deterministico según día del año
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
//  setupHojas — crea todas las hojas con estructura inicial
// ─────────────────────────────────────────────────────────────
function setupHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // ── Config ────────────────────────────────────────────────
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
  config.getRange(1, 1, 1, 2)
    .setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
  config.setColumnWidth(1, 220);
  config.setColumnWidth(2, 380);

  // Nota de ayuda
  config.getRange(7, 1).setValue(
    '* Google Doc ID: en la URL del Doc, la parte entre /d/ y /edit'
  );
  config.getRange(7, 1).setFontStyle('italic').setFontColor('#888888');
  config.getRange(7, 1, 1, 2).merge();

  config.getRange(8, 1).setValue(
    '* Google Calendar ID: en Ajustes del calendario → Integración → ID del calendario'
  );
  config.getRange(8, 1).setFontStyle('italic').setFontColor('#888888');
  config.getRange(8, 1, 1, 2).merge();

  // ── Etiquetas ─────────────────────────────────────────────
  let etiq = ss.getSheetByName('Etiquetas');
  if (!etiq) etiq = ss.insertSheet('Etiquetas');
  etiq.clearContents();
  etiq.getRange(1, 1).setValue('Etiqueta');
  etiq.getRange(1, 1).setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
  const etiqData = [
    ['General'], ['Reunión'], ['Tarea'], ['Decisión'],
    ['Idea'], ['Seguimiento'], ['Bloqueador'], ['Hito']
  ];
  etiq.getRange(2, 1, etiqData.length, 1).setValues(etiqData);
  etiq.setColumnWidth(1, 180);

  // ── Herramientas ─────────────────────────────────────────
  let herr = ss.getSheetByName('Herramientas');
  if (!herr) herr = ss.insertSheet('Herramientas');
  herr.clearContents();

  const herrHeaders = [['Nombre', 'URL', 'Emoji']];
  herr.getRange(1, 1, 1, 3).setValues(herrHeaders);
  herr.getRange(1, 1, 1, 3)
    .setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');

  const herrData = [
    ['Drive',     'https://drive.google.com',        '💾'],
    ['Gmail',     'https://mail.google.com',          '📧'],
    ['Calendar',  'https://calendar.google.com',      '📅'],
    ['Meet',      'https://meet.google.com',          '📹'],
    ['Docs',      'https://docs.google.com',          '📄'],
    ['Sheets',    'https://sheets.google.com',        '📊'],
    ['Tareas',    'https://tasks.google.com',         '✅'],
    ['Keep',      'https://keep.google.com',          '📌'],
  ];
  herr.getRange(2, 1, herrData.length, 3).setValues(herrData);
  herr.setColumnWidth(1, 140);
  herr.setColumnWidth(2, 280);
  herr.setColumnWidth(3, 80);

  // ── Notas ─────────────────────────────────────────────────
  let notas = ss.getSheetByName('Notas');
  if (!notas) notas = ss.insertSheet('Notas');
  if (notas.getLastRow() === 0) {
    const notasHeaders = [['Fecha', 'FechaHora', 'Etiqueta', 'Contenido (HTML)', 'Texto']];
    notas.getRange(1, 1, 1, 5).setValues(notasHeaders);
    notas.getRange(1, 1, 1, 5)
      .setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
    notas.setFrozenRows(1);
    notas.setColumnWidth(1, 110);
    notas.setColumnWidth(2, 160);
    notas.setColumnWidth(3, 130);
    notas.setColumnWidth(4, 360);  // HTML — más ancha pero no dominante
    notas.setColumnWidth(5, 400);  // Texto plano — la más ancha, es la que se lee
  }

  // ── Usuarios ──────────────────────────────────────────────
  let usuarios = ss.getSheetByName('Usuarios');
  if (!usuarios) usuarios = ss.insertSheet('Usuarios');
  if (usuarios.getLastRow() === 0) {
    usuarios.getRange(1, 1, 1, 3).setValues([['Usuario', 'Nombre', 'Activo']]);
    usuarios.getRange(1, 1, 1, 3)
      .setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');

    const emailOwner = Session.getActiveUser().getEmail();
    usuarios.getRange(2, 1, 1, 2).setValues([[emailOwner, 'Administrador']]);
    usuarios.getRange(2, 3).insertCheckboxes();
    usuarios.getRange(2, 3).setValue(true);
    usuarios.setColumnWidth(1, 260);
    usuarios.setColumnWidth(2, 180);
    usuarios.setColumnWidth(3, 80);
  }

  ui.alert(
    '✅ Mesa de Trabajo — Hojas creadas\n\n' +
    '1. Completá "Config" con el ID del Google Doc y del Calendario.\n' +
    '2. Editá "Etiquetas" con tus categorías.\n' +
    '3. Editá "Herramientas" con los accesos rápidos que uses.\n' +
    '4. Implementá como Web App (Ejecutar como: tú; Acceso: cualquier cuenta Google).\n' +
    '5. Copiá la URL del Web App en el index.html de GitHub Pages.'
  );
}


// ─────────────────────────────────────────────────────────────
//  actualizarEncabezadoNotas — agrega la columna E "Texto" a la
//  hoja Notas existente sin borrar los datos que ya hay.
//  Ejecutar manualmente desde el editor una sola vez al migrar a v5.
// ─────────────────────────────────────────────────────────────
function actualizarEncabezadoNotas() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const notas = ss.getSheetByName('Notas');
  const ui    = SpreadsheetApp.getUi();

  if (!notas) {
    ui.alert('No existe la hoja Notas. Ejecutá setupHojas() primero.');
    return;
  }

  // Actualizar encabezado fila 1
  notas.getRange(1, 1, 1, 5).setValues([[
    'Fecha', 'FechaHora', 'Etiqueta', 'Contenido (HTML)', 'Texto'
  ]]);
  notas.getRange(1, 1, 1, 5)
    .setBackground('#1e2128').setFontColor('#f0a500').setFontWeight('bold');
  notas.setFrozenRows(1);

  // Ajustar anchos de columna
  notas.setColumnWidth(1, 110);
  notas.setColumnWidth(2, 160);
  notas.setColumnWidth(3, 130);
  notas.setColumnWidth(4, 360);
  notas.setColumnWidth(5, 400);

  // Rellenar columna E para filas existentes que no la tienen
  const ultimaFila = notas.getLastRow();
  if (ultimaFila > 1) {
    let rellenadas = 0;
    for (let i = 2; i <= ultimaFila; i++) {
      const colE = notas.getRange(i, 5).getValue();
      if (colE === '' || colE === null) {
        // Leer el HTML de col D y generar el texto plano
        const html = String(notas.getRange(i, 4).getValue());
        if (html.trim()) {
          const lineas = parseHtmlALineas(html);
          const texto  = lineasATextoCalendar(lineas);
          notas.getRange(i, 5).setValue(texto);
          rellenadas++;
        }
      }
    }
    ui.alert(
      '✅ Encabezado actualizado.\n' +
      'Se completó la columna Texto en ' + rellenadas + ' fila(s) existente(s).'
    );
  } else {
    ui.alert('✅ Encabezado actualizado. No había filas de datos para procesar.');
  }
}


// ─────────────────────────────────────────────────────────────
//  MENÚ PERSONALIZADO
// ─────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗂️ Mesa de Trabajo')
    .addItem('1. Crear hojas (primera vez)',        'setupHojas')
    .addItem('1b. Migrar a v5/v6: columna Texto',   'actualizarEncabezadoNotas')
    .addSeparator()
    .addItem('Probar getData (logs)',                'testGetData')
    .addToUi();
}


// ─────────────────────────────────────────────────────────────
//  testGetData — prueba manual desde el editor de Scripts
// ─────────────────────────────────────────────────────────────
function testGetData() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const cfg   = leerConfig(ss);
  const notas = leerNotasHoy(ss);
  Logger.log('Config: ' + JSON.stringify(cfg));
  Logger.log('Notas hoy: ' + JSON.stringify(notas));
  SpreadsheetApp.getUi().alert('Revisá los Logs (Ver → Registros).');
}
