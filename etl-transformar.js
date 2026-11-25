// COMMUNITY 360 - Fase 2 - Script de procesamiento (ETL)
// Actividades 1 a 7: todo local, no sube nada a la nube.
// La actividad 8 (carga a D1 y Firestore) está en carga.js.
//
// Ejecutar: node etl-transformar.js
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data');
const SALIDA = path.join(__dirname, 'salida');
fs.mkdirSync(SALIDA, { recursive: true });

// =====================================================================
// Utilidades
// =====================================================================
function leerCSV(archivo) {
  const txt = fs.readFileSync(archivo, 'utf8').replace(/^﻿/, '');
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const cab = filas.shift();
  return filas.map(f => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])));
}

function escribirCSV(archivo, filas, columnas) {
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lineas = [columnas.join(',')].concat(filas.map(f => columnas.map(c => esc(f[c])).join(',')));
  fs.writeFileSync(path.join(SALIDA, archivo), '﻿' + lineas.join('\n') + '\n', 'utf8');
}

function cuantil(valores, p) {
  const v = [...valores].sort((a, b) => a - b);
  const pos = (v.length - 1) * p, b = Math.floor(pos);
  return v[b] + (v[Math.min(b + 1, v.length - 1)] - v[b]) * (pos - b);
}

const titulo = (n, t) => console.log(`\nActividad ${n}. ${t}`);
const suma = o => Object.values(o).reduce((a, b) => a + b, 0);
const esFechaISO = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

// =====================================================================
// Lectura de los archivos originales
// =====================================================================
const usuariosCrudos = leerCSV(path.join(DATA, 'comunidad_virtual_usuarios.csv'));
const interCrudas = leerCSV(path.join(DATA, 'comunidad_virtual_interacciones_1000.csv'));
console.log(`Archivos leídos: ${usuariosCrudos.length} usuarios y ${interCrudas.length} interacciones.`);

// =====================================================================
// Actividad 1. Eliminación de registros duplicados
// Criterios: id_usuario o alias repetidos (usuarios) e id_interaccion repetido (interacciones).
// Se conserva la primera aparición y se descartan las demás.
// =====================================================================
titulo(1, 'Eliminación de registros duplicados');
function quitarDuplicados(filas, claves) {
  const vistos = Object.fromEntries(claves.map(c => [c, new Set()]));
  const conteo = Object.fromEntries(claves.map(c => [c, 0]));
  const unicas = [];
  for (const f of filas) {
    let repetido = false;
    for (const c of claves) {
      const v = (f[c] ?? '').trim();
      if (vistos[c].has(v)) { conteo[c]++; repetido = true; }
    }
    if (repetido) continue;
    claves.forEach(c => vistos[c].add((f[c] ?? '').trim()));
    unicas.push(f);
  }
  return { unicas, conteo };
}
const dU = quitarDuplicados(usuariosCrudos, ['id_usuario', 'alias']);
const dI = quitarDuplicados(interCrudas, ['id_interaccion']);
let usuarios1 = dU.unicas, inter1 = dI.unicas;
const duplicados = {
  usuarios_por_id: dU.conteo.id_usuario, usuarios_por_alias: dU.conteo.alias,
  interacciones_por_id: dI.conteo.id_interaccion,
};
console.log(`   Usuarios duplicados eliminados: ${duplicados.usuarios_por_id} por id_usuario y ${duplicados.usuarios_por_alias} por alias.`);
console.log(`   Interacciones duplicadas eliminadas: ${duplicados.interacciones_por_id} por id_interaccion.`);
console.log(`   Quedan ${usuarios1.length} usuarios y ${inter1.length} interacciones.`);

// =====================================================================
// Actividad 2. Normalización de valores vacíos y nulos
// Se recortan espacios y toda cadena vacía (o escrita como "null", "N/A"...) pasa a null.
// =====================================================================
titulo(2, 'Normalización de valores vacíos y nulos');
const VACIOS = new Set(['', 'null', 'nan', 'n/a', 'na', 'none', 'undefined', '-']);
function normalizarNulos(filas) {
  const porColumna = {};
  const salida = filas.map(f => {
    const o = {};
    for (const [k, v] of Object.entries(f)) {
      const s = String(v ?? '').trim();
      if (VACIOS.has(s.toLowerCase())) { o[k] = null; porColumna[k] = (porColumna[k] || 0) + 1; }
      else o[k] = s;
    }
    return o;
  });
  return { filas: salida, porColumna };
}
const nU = normalizarNulos(usuarios1), nI = normalizarNulos(inter1);
let usuarios2 = nU.filas, inter2 = nI.filas;
console.log(`   Usuarios: ${suma(nU.porColumna)} valores vacíos pasaron a nulo ${JSON.stringify(nU.porColumna)}.`);
console.log(`   Interacciones: ${suma(nI.porColumna)} valores vacíos pasaron a nulo ${JSON.stringify(nI.porColumna)}.`);

// =====================================================================
// Actividad 3. Estandarización de fechas, categorías y formatos
// =====================================================================
titulo(3, 'Estandarización de fechas, categorías y formatos');
let fechasConvertidas = 0, timestampsAjustados = 0, textosAjustados = 0, etiquetasSeparadas = 0, interConVariasEtiquetas = 0;

const DISPOSITIVOS = { android: 'Android', ios: 'iOS', web: 'Web', escritorio: 'Escritorio' };
const sinEspacios = s => (s === null ? null : s.replace(/\s+/g, ' '));
function ajustar(o, campo, fn) {
  if (o[campo] === null || o[campo] === undefined) return;
  const nuevo = fn(o[campo]);
  if (nuevo !== o[campo]) { o[campo] = nuevo; textosAjustados++; }
}
function fechaAISO(s) {
  if (s === null) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) { fechasConvertidas++; return `${m[3]}-${m[2]}-${m[1]}`; }
  return s;
}

usuarios2.forEach(u => {
  ajustar(u, 'id_usuario', s => s.toUpperCase());
  for (const c of ['alias', 'pais', 'estado', 'ciudad', 'zona_horaria', 'especie_fursona', 'interes_principal', 'plataforma_principal']) ajustar(u, c, sinEspacios);
  for (const c of ['estatus', 'consentimiento_datos']) ajustar(u, c, s => s.toLowerCase());
  u.fecha_ingreso = fechaAISO(u.fecha_ingreso);
  u.ultima_actividad = fechaAISO(u.ultima_actividad);
});

inter2.forEach(r => {
  ajustar(r, 'id_interaccion', s => s.toUpperCase());
  ajustar(r, 'id_usuario', s => s.toUpperCase());
  for (const c of ['tipo', 'tema']) ajustar(r, c, s => s.toLowerCase());
  for (const c of ['canal', 'texto']) ajustar(r, c, sinEspacios);
  ajustar(r, 'dispositivo', s => DISPOSITIVOS[s.toLowerCase()] || s);
  // marca de tiempo: todo a UTC con formato aaaa-mm-ddThh:mm:ssZ
  if (r.timestamp && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(r.timestamp)) {
    const norm = new Date(r.timestamp).toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (norm !== r.timestamp) { r.timestamp = norm; timestampsAjustados++; }
  }
  // campo multivaluado: "humor|evento" -> ['humor', 'evento']
  r.etiquetas = r.etiquetas === null ? [] : [...new Set(r.etiquetas.split('|').map(t => t.trim().toLowerCase()).filter(Boolean))];
  etiquetasSeparadas += r.etiquetas.length;
  if (r.etiquetas.length > 1) interConVariasEtiquetas++;
});
console.log(`   Fechas dd/mm/aaaa convertidas a aaaa-mm-dd: ${fechasConvertidas}.`);
console.log(`   Marcas de tiempo llevadas a UTC: ${timestampsAjustados} (el resto ya venía en UTC).`);
console.log(`   Textos ajustados (mayúsculas/minúsculas o espacios): ${textosAjustados}.`);
console.log(`   Campo multivaluado "etiquetas" separado: ${etiquetasSeparadas} etiquetas en ${inter2.filter(r => r.etiquetas.length).length} interacciones (${interConVariasEtiquetas} con más de una).`);

// =====================================================================
// Actividad 4. Validación de tipos de datos
// Lo que no cumple el tipo o el rango se rechaza y queda registrado con su motivo.
// =====================================================================
titulo(4, 'Validación de tipos de datos');
const RANGOS = ['18-24', '25-31', '32-38', '39+'];
const ESTATUS = ['activo', 'en_riesgo', 'inactivo'];
const TIPOS = ['mensaje', 'comentario', 'reaccion', 'respuesta_encuesta', 'rsvp_evento'];
const DISP = ['Android', 'iOS', 'Web', 'Escritorio'];
const esEntero = s => s !== null && /^\d+$/.test(s);
const esNumero = s => s !== null && s !== '' && !isNaN(Number(s));

const rechazadosUsuarios = [], usuariosOk = [];
for (const u of usuarios2) {
  const e = [];
  if (!/^U\d{6}$/.test(u.id_usuario || '')) e.push('id_usuario con formato inválido');
  if (u.alias === null) e.push('alias vacío');
  if (!esFechaISO(u.fecha_ingreso)) e.push('fecha_ingreso inválida');
  if (!esFechaISO(u.ultima_actividad)) e.push('ultima_actividad inválida');
  else if (esFechaISO(u.fecha_ingreso) && u.ultima_actividad < u.fecha_ingreso) e.push('ultima_actividad anterior a fecha_ingreso');
  if (!RANGOS.includes(u.rango_edad)) e.push('rango_edad fuera de catálogo');
  if (!ESTATUS.includes(u.estatus)) e.push('estatus fuera de catálogo');
  if (!['si', 'no'].includes(u.consentimiento_datos)) e.push('consentimiento_datos inválido');
  if (!['0', '1'].includes(u.es_artista)) e.push('es_artista no es booleano (0/1)');
  for (const c of ['mensajes_30d', 'reacciones_30d', 'eventos_asistidos', 'comisiones_compradas'])
    if (!esEntero(u[c])) e.push(`${c} no es entero >= 0`);
  if (!esNumero(u.sentimiento_promedio) || Math.abs(Number(u.sentimiento_promedio)) > 1) e.push('sentimiento_promedio fuera de rango');
  if (u.latitud !== null && (!esNumero(u.latitud) || Math.abs(Number(u.latitud)) > 90)) e.push('latitud inválida');
  if (u.longitud !== null && (!esNumero(u.longitud) || Math.abs(Number(u.longitud)) > 180)) e.push('longitud inválida');
  for (const c of ['especie_fursona', 'interes_principal', 'plataforma_principal']) if (u[c] === null) e.push(`${c} vacío`);
  if (e.length) rechazadosUsuarios.push({ id_usuario: u.id_usuario, errores: e.join('; ') });
  else usuariosOk.push(u);
}

const rechazadasInter = [], interOk = [];
for (const r of inter2) {
  const e = [];
  if (!/^I\d{7}$/.test(r.id_interaccion || '')) e.push('id_interaccion con formato inválido');
  if (!/^U\d{6}$/.test(r.id_usuario || '')) e.push('id_usuario con formato inválido');
  if (!r.timestamp || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.timestamp)) e.push('timestamp inválido');
  if (!TIPOS.includes(r.tipo)) e.push('tipo fuera de catálogo');
  if (!DISP.includes(r.dispositivo)) e.push('dispositivo fuera de catálogo');
  if (r.canal === null) e.push('canal vacío');
  if (r.tema === null) e.push('tema vacío');
  if (!esNumero(r.sentimiento) || Math.abs(Number(r.sentimiento)) > 1) e.push('sentimiento fuera de rango');
  if (r.tipo !== 'reaccion' && r.texto === null) e.push('texto vacío en una interacción que no es reacción');
  if (!esEntero(r.longitud_texto)) e.push('longitud_texto no es entero >= 0');
  if (!esEntero(r.reacciones_recibidas)) e.push('reacciones_recibidas no es entero >= 0');
  if (e.length) rechazadasInter.push({ id_interaccion: r.id_interaccion, errores: e.join('; ') });
  else interOk.push(r);
}
console.log(`   Usuarios: ${usuariosOk.length} válidos y ${rechazadosUsuarios.length} rechazados.`);
console.log(`   Interacciones: ${interOk.length} válidas y ${rechazadasInter.length} rechazadas.`);

// =====================================================================
// Actividad 5. Verificación de referencias entre usuarios e interacciones
// Una interacción cuyo id_usuario no existe en el padrón no se descarta: se aísla en cuarentena.
// =====================================================================
titulo(5, 'Verificación de referencias usuario-interacción');
const idsValidos = new Set(usuariosOk.map(u => u.id_usuario));
const interConUsuario = [], interHuerfanas = [];
for (const r of interOk) (idsValidos.has(r.id_usuario) ? interConUsuario : interHuerfanas).push(r);
const usuariosHuerfanos = new Set(interHuerfanas.map(r => r.id_usuario));
console.log(`   Interacciones con usuario existente: ${interConUsuario.length}.`);
console.log(`   Interacciones huérfanas enviadas a cuarentena: ${interHuerfanas.length} (de ${usuariosHuerfanos.size} id_usuario que no están en el padrón).`);

const cuarentena = interHuerfanas.map(r => ({
  id_interaccion: r.id_interaccion,
  motivo: 'usuario_inexistente',
  id_usuario_ref: r.id_usuario,
  errores: [{ campo: 'id_usuario', problema: 'no existe en el padrón de usuarios' }],
  registro_original: {
    id_interaccion: r.id_interaccion, id_usuario: r.id_usuario, fecha_hora: r.timestamp,
    canal: r.canal, tipo: r.tipo, texto: r.texto, tema: r.tema,
    sentimiento: Number(r.sentimiento), dispositivo: r.dispositivo, longitud_texto: Number(r.longitud_texto),
    reacciones_recibidas: Number(r.reacciones_recibidas), etiquetas: r.etiquetas,
  },
}));

// =====================================================================
// Actividad 6. Eliminación de datos geográficos sin consentimiento
// Si consentimiento_datos = "no": se borran ciudad, estado, país, zona horaria y coordenadas.
// =====================================================================
titulo(6, 'Eliminación de información geográfica sin consentimiento');
const GEO = ['pais', 'estado', 'ciudad', 'latitud', 'longitud', 'zona_horaria'];
let sinConsentimiento = 0, sinConsentimientoLimpiados = 0, camposGeoBorrados = 0;
for (const u of usuariosOk) {
  if (u.consentimiento_datos !== 'no') continue;
  sinConsentimiento++;
  let tocado = false;
  for (const c of GEO) if (u[c] !== null) { u[c] = null; camposGeoBorrados++; tocado = true; }
  if (tocado) sinConsentimientoLimpiados++;
}
const geoRestante = usuariosOk.filter(u => u.consentimiento_datos === 'no' && GEO.some(c => u[c] !== null)).length;
const idsSinConsent = new Set(usuariosOk.filter(u => u.consentimiento_datos === 'no').map(u => u.id_usuario));
const interSinConsentConUbic = interConUsuario.filter(r => idsSinConsent.has(r.id_usuario) && (r.pais || r.estado || r.ciudad)).length;
console.log(`   Usuarios con consentimiento_datos = "no": ${sinConsentimiento}.`);
console.log(`   A ${sinConsentimientoLimpiados} se les borró la ubicación (${camposGeoBorrados} campos en total).`);
console.log(`   Comprobación: ${geoRestante} usuarios sin consentimiento conservan algún dato geográfico.`);
console.log(`   En ${interSinConsentConUbic} interacciones de esos usuarios venía país/estado/ciudad; esas columnas no pasan al modelo (la ubicación solo vive en USUARIOS).`);

// =====================================================================
// Actividad 7. Generación de archivos depurados
// Se arman las tablas finales con los ids de los catálogos y se exportan a salida/.
// =====================================================================
titulo(7, 'Generación de archivos depurados');
function catalogo(valores) {
  const ord = [...new Set(valores.filter(v => v !== null && v !== ''))].sort((a, b) => a.localeCompare(b, 'es'));
  return new Map(ord.map((v, i) => [v, i + 1]));
}
const paises = catalogo(usuariosOk.map(u => u.pais));
const especies = catalogo(usuariosOk.map(u => u.especie_fursona));
const intereses = catalogo(usuariosOk.map(u => u.interes_principal));
const plataformas = catalogo([...usuariosOk.map(u => u.plataforma_principal), ...interOk.map(i => i.canal)]);
const temas = catalogo(interOk.map(i => i.tema));
const etiquetas = catalogo(interOk.flatMap(i => i.etiquetas));

const estados = new Map(), ciudades = new Map();
for (const u of usuariosOk) {
  if (!u.estado) continue;
  const kE = `${u.pais}|${u.estado}`;
  if (!estados.has(kE)) estados.set(kE, { pais: u.pais, nombre: u.estado });
  if (u.ciudad) {
    const kC = `${u.pais}|${u.estado}|${u.ciudad}`;
    if (!ciudades.has(kC)) ciudades.set(kC, { pais: u.pais, estado: u.estado, nombre: u.ciudad, zona_horaria: u.zona_horaria });
  }
}
const orden = (a, b) => a.pais.localeCompare(b.pais, 'es') || (a.estado || '').localeCompare(b.estado || '', 'es') || a.nombre.localeCompare(b.nombre, 'es');
const listaEstados = [...estados.values()].sort(orden);
const idEstado = new Map(listaEstados.map((e, i) => [`${e.pais}|${e.nombre}`, i + 1]));
const listaCiudades = [...ciudades.values()].sort(orden);
const idCiudad = new Map(listaCiudades.map((c, i) => [`${c.pais}|${c.estado}|${c.nombre}`, i + 1]));

// Valores atípicos: por encima del percentil 99 en mensajes_30d o reacciones_30d
const topeMens = cuantil(usuariosOk.map(u => Number(u.mensajes_30d)), 0.99);
const topeReac = cuantil(usuariosOk.map(u => Number(u.reacciones_30d)), 0.99);

const numONull = s => (s === null ? null : Number(s));
const usuarios = usuariosOk.map(u => ({
  id_usuario: u.id_usuario, alias: u.alias, fecha_ingreso: u.fecha_ingreso,
  id_ciudad: u.ciudad ? idCiudad.get(`${u.pais}|${u.estado}|${u.ciudad}`) : null,
  latitud: numONull(u.latitud), longitud: numONull(u.longitud),
  rango_edad: u.rango_edad,
  id_especie: especies.get(u.especie_fursona), id_interes: intereses.get(u.interes_principal),
  id_plataforma: plataformas.get(u.plataforma_principal),
  es_artista: Number(u.es_artista),
  mensajes_30d: Number(u.mensajes_30d), reacciones_30d: Number(u.reacciones_30d),
  eventos_asistidos: Number(u.eventos_asistidos), comisiones_compradas: Number(u.comisiones_compradas),
  sentimiento_promedio: Number(u.sentimiento_promedio),
  ultima_actividad: u.ultima_actividad, estatus: u.estatus, consentimiento_datos: u.consentimiento_datos,
  es_atipico: Number(u.mensajes_30d) > topeMens || Number(u.reacciones_30d) > topeReac ? 1 : 0,
}));

let reaccionesCorregidas = 0;
const interacciones = [], interEtiqueta = [];
for (const r of interConUsuario) {
  let longitud = Number(r.longitud_texto);
  if (r.tipo === 'reaccion' && longitud !== 0) { longitud = 0; reaccionesCorregidas++; }
  interacciones.push({
    id_interaccion: r.id_interaccion, id_usuario: r.id_usuario, fecha_hora: r.timestamp,
    id_plataforma: plataformas.get(r.canal), tipo: r.tipo, texto: r.texto,
    id_tema: temas.get(r.tema), sentimiento: Number(r.sentimiento), dispositivo: r.dispositivo,
    longitud_texto: longitud, reacciones_recibidas: Number(r.reacciones_recibidas),
  });
  for (const t of r.etiquetas) interEtiqueta.push({ id_interaccion: r.id_interaccion, id_etiqueta: etiquetas.get(t) });
}
const atipicos = usuarios.filter(u => u.es_atipico).length;
console.log(`   Catálogos: ${paises.size} países, ${listaEstados.length} estados, ${listaCiudades.length} ciudades, ${especies.size} especies, ${intereses.size} intereses, ${plataformas.size} plataformas, ${temas.size} temas, ${etiquetas.size} etiquetas.`);
console.log(`   Reacciones con longitud_texto corregida a 0: ${reaccionesCorregidas}. Usuarios marcados como atípicos: ${atipicos}.`);

const lista = m => [...m.entries()].map(([nombre, id]) => ({ id, nombre })).sort((a, b) => a.id - b.id);
const cat = {
  PAISES: lista(paises).map(x => ({ id_pais: x.id, nombre: x.nombre })),
  ESTADOS: listaEstados.map(e => ({ id_estado: idEstado.get(`${e.pais}|${e.nombre}`), nombre: e.nombre, id_pais: paises.get(e.pais) })),
  CIUDADES: listaCiudades.map(c => ({ id_ciudad: idCiudad.get(`${c.pais}|${c.estado}|${c.nombre}`), nombre: c.nombre, id_estado: idEstado.get(`${c.pais}|${c.estado}`), zona_horaria: c.zona_horaria })),
  ESPECIES_FURSONA: lista(especies).map(x => ({ id_especie: x.id, nombre: x.nombre })),
  INTERESES: lista(intereses).map(x => ({ id_interes: x.id, nombre: x.nombre })),
  PLATAFORMAS: lista(plataformas).map(x => ({ id_plataforma: x.id, nombre: x.nombre })),
  TEMAS: lista(temas).map(x => ({ id_tema: x.id, nombre: x.nombre })),
  ETIQUETAS: lista(etiquetas).map(x => ({ id_etiqueta: x.id, nombre: x.nombre })),
};
escribirCSV('paises.csv', cat.PAISES, ['id_pais', 'nombre']);
escribirCSV('estados.csv', cat.ESTADOS, ['id_estado', 'nombre', 'id_pais']);
escribirCSV('ciudades.csv', cat.CIUDADES, ['id_ciudad', 'nombre', 'id_estado', 'zona_horaria']);
escribirCSV('especies_fursona.csv', cat.ESPECIES_FURSONA, ['id_especie', 'nombre']);
escribirCSV('intereses.csv', cat.INTERESES, ['id_interes', 'nombre']);
escribirCSV('plataformas.csv', cat.PLATAFORMAS, ['id_plataforma', 'nombre']);
escribirCSV('temas.csv', cat.TEMAS, ['id_tema', 'nombre']);
escribirCSV('etiquetas.csv', cat.ETIQUETAS, ['id_etiqueta', 'nombre']);
escribirCSV('usuarios_limpios.csv', usuarios, ['id_usuario', 'alias', 'fecha_ingreso', 'id_ciudad', 'latitud', 'longitud', 'rango_edad', 'id_especie', 'id_interes', 'id_plataforma', 'es_artista', 'mensajes_30d', 'reacciones_30d', 'eventos_asistidos', 'comisiones_compradas', 'sentimiento_promedio', 'ultima_actividad', 'estatus', 'consentimiento_datos', 'es_atipico']);
escribirCSV('interacciones_validas.csv', interacciones, ['id_interaccion', 'id_usuario', 'fecha_hora', 'id_plataforma', 'tipo', 'texto', 'id_tema', 'sentimiento', 'dispositivo', 'longitud_texto', 'reacciones_recibidas']);
escribirCSV('interaccion_etiqueta.csv', interEtiqueta, ['id_interaccion', 'id_etiqueta']);
escribirCSV('cuarentena_resumen.csv', cuarentena.map(c => ({ id_interaccion: c.id_interaccion, id_usuario_ref: c.id_usuario_ref, motivo: c.motivo })), ['id_interaccion', 'id_usuario_ref', 'motivo']);
escribirCSV('rechazados.csv', [
  ...rechazadosUsuarios.map(r => ({ origen: 'usuarios', id: r.id_usuario, errores: r.errores })),
  ...rechazadasInter.map(r => ({ origen: 'interacciones', id: r.id_interaccion, errores: r.errores })),
], ['origen', 'id', 'errores']);

// Conciliación: no se puede perder ningún registro
const cuadraU = usuariosCrudos.length === usuarios.length + rechazadosUsuarios.length + suma({ a: duplicados.usuarios_por_id, b: duplicados.usuarios_por_alias });
const cuadraI = interCrudas.length === interacciones.length + cuarentena.length + rechazadasInter.length + duplicados.interacciones_por_id;
console.log(`\nConciliación usuarios: ${usuariosCrudos.length} = ${usuarios.length} cargables + ${rechazadosUsuarios.length} rechazados + ${duplicados.usuarios_por_id + duplicados.usuarios_por_alias} duplicados -> ${cuadraU ? 'CUADRA' : 'NO CUADRA'}`);
console.log(`Conciliación interacciones: ${interCrudas.length} = ${interacciones.length} cargables + ${cuarentena.length} en cuarentena + ${rechazadasInter.length} rechazadas + ${duplicados.interacciones_por_id} duplicadas -> ${cuadraI ? 'CUADRA' : 'NO CUADRA'}`);

const reporte = {
  recibidos: { usuarios: usuariosCrudos.length, interacciones: interCrudas.length },
  aceptados: { usuarios: usuarios.length, interacciones: interacciones.length },
  rechazados: { usuarios: rechazadosUsuarios.length, interacciones: rechazadasInter.length },
  cuarentena: cuarentena.length,
  duplicados,
  nulos_normalizados: { usuarios: nU.porColumna, interacciones: nI.porColumna },
  transformados: {
    fechas_convertidas_a_iso: fechasConvertidas,
    timestamps_ajustados: timestampsAjustados,
    textos_ajustados: textosAjustados,
    etiquetas_separadas: etiquetasSeparadas,
    usuarios_sin_consentimiento_con_ubicacion_borrada: sinConsentimientoLimpiados,
    reacciones_con_longitud_corregida: reaccionesCorregidas,
    usuarios_marcados_atipicos: atipicos,
    filas_interaccion_etiqueta: interEtiqueta.length,
  },
  usuarios_huerfanos_distintos: usuariosHuerfanos.size,
  cuadra: cuadraU && cuadraI,
};
fs.writeFileSync(path.join(SALIDA, 'reporte-etl.json'), JSON.stringify(reporte, null, 2), 'utf8');
fs.writeFileSync(path.join(SALIDA, 'datos-para-carga.json'), JSON.stringify({
  catalogos: cat, USUARIOS: usuarios, INTERACCIONES: interacciones, INTERACCION_ETIQUETA: interEtiqueta, cuarentena, reporte,
}), 'utf8');

console.log(`\nArchivos depurados escritos en salida/ (${fs.readdirSync(SALIDA).length} archivos).`);
console.log(`Resultado: ${reporte.cuadra ? '✔ todo cuadra' : '✘ revisar conciliación'}`);
console.log('La actividad 8 (carga en la nube) se ejecuta con: node --use-system-ca carga.js');
