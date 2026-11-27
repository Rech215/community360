// Métricas del dashboard (Fase 6). Cada función hace consultas SQL agregadas a Cloudflare D1
// y devuelve justo lo que el panel necesita dibujar. No se guarda nada: todo se calcula al pedirlo,
// así que cualquier alta, cambio o baja de una interacción se refleja en la siguiente consulta.
// Recibe d1Query para poder probarla sin conexión a la nube.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const BLOQUES = ['0–2', '2–4', '4–6', '6–8', '8–10', '10–12', '12–14', '14–16', '16–18', '18–20', '20–22', '22–24'];
const TIPOS = { mensaje: 'Mensaje', comentario: 'Comentario', reaccion: 'Reacción', respuesta_encuesta: 'Respuesta de encuesta', rsvp_evento: 'RSVP a evento' };
const EDADES = { '18-24': '18–24 años', '25-31': '25–31 años', '32-38': '32–38 años', '39+': '39 o más' };

const VENTANA = 30;          // días que cubre "el mes"
const VENTANA_ANIMO = 20;    // el ánimo es el promedio de las últimas 20 interacciones
const UMBRAL_RIESGO = 55;    // IRA a partir del cual alguien "podría irse"

// ---- Fechas (todo en texto AAAA-MM-DD, sin zonas horarias) ----
const sumarDias = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rango = (ini, fin) => { const a = []; for (let f = ini; f <= fin; f = sumarDias(f, 1)) a.push(f); return a; };
const etiqueta = f => `${+f.slice(8, 10)} ${MESES[+f.slice(5, 7) - 1]}`;
const cambioPct = (actual, previo) => (previo > 0 ? +(((actual - previo) / previo) * 100).toFixed(1) : 0);

function crearMetricas(d1Query) {
  // Último día con interacciones: el "mes" se cuenta hacia atrás desde ahí, no desde la fecha de hoy
  async function referencia() {
    const r = await d1Query('SELECT MAX(substr(fecha_hora, 1, 10)) AS ref FROM INTERACCIONES');
    return r[0] && r[0].ref ? r[0].ref : null;
  }

  // Ánimo: promedio móvil de las últimas 20 interacciones, tomado al cierre de cada día con actividad.
  // Los días sin actividad conservan el último valor (el ánimo "no cambia" si nadie escribió).
  async function filasAnimo() {
    return d1Query(`
      WITH m AS (
        SELECT substr(fecha_hora, 1, 10) AS dia,
               AVG(sentimiento) OVER (ORDER BY fecha_hora, id_interaccion ROWS BETWEEN ${VENTANA_ANIMO - 1} PRECEDING AND CURRENT ROW) AS prom,
               ROW_NUMBER() OVER (PARTITION BY substr(fecha_hora, 1, 10) ORDER BY fecha_hora DESC, id_interaccion DESC) AS rn
        FROM INTERACCIONES)
      SELECT dia, ROUND(prom, 3) AS prom FROM m WHERE rn = 1 ORDER BY dia`);
  }

  function serieAnimo(filas, dias) {
    const porDia = new Map(filas.map(f => [f.dia, f.prom]));
    let ultimo = null;
    for (const f of filas) { if (f.dia < dias[0]) ultimo = f.prom; else break; }
    const salida = [];
    for (const d of dias) {
      if (porDia.has(d)) ultimo = porDia.get(d);
      salida.push({ dia: d, valor: ultimo });
    }
    return salida.filter(x => x.valor !== null);   // se omiten los días anteriores a la primera interacción
  }

  // Índice de Riesgo de Abandono (IRA, 0 a 100) de cada miembro que aún no está inactivo:
  //   50 % días sin actividad (60 días o más = máximo) + 30 % baja participación (mensajes + reacciones
  //   de los últimos 30 días frente al miembro más activo) + 20 % ánimo bajo.
  const SQL_IRA = `
    WITH r AS (SELECT MAX(substr(ultima_actividad, 1, 10)) AS f FROM USUARIOS),
    base AS (
      SELECT id_usuario,
             CASE WHEN consentimiento_datos = 'si' THEN alias ELSE id_usuario END AS alias,
             estatus,
             substr(ultima_actividad, 1, 10) AS ultima,
             mensajes_30d + reacciones_30d AS act,
             sentimiento_promedio AS sent,
             MAX(0, CAST(julianday((SELECT f FROM r)) - julianday(substr(ultima_actividad, 1, 10)) AS INTEGER)) AS dias
      FROM USUARIOS WHERE estatus <> 'inactivo'),
    tope AS (SELECT MAX(1, MAX(act)) AS m FROM base)
    SELECT id_usuario, alias, estatus, ultima, dias,
           CAST(ROUND(100.0 * (0.5 * MIN(dias, 60) / 60.0
                              + 0.3 * (1.0 - act * 1.0 / (SELECT m FROM tope))
                              + 0.2 * (1.0 - sent) / 2.0)) AS INTEGER) AS ira
    FROM base`;

  // ---------------------------------------------------------------- 1) resumen
  async function resumen() {
    const ref = await referencia();
    const vacio = { buenoSiSube: true, valor: 0, delta: 0, serie: [0, 0] };
    if (!ref) return { referencia: null, indicadores: { interacciones: vacio, usuarios: vacio, sentimiento: vacio, riesgo: { valor: 0, nota: '' } } };
    const ini = sumarDias(ref, -(VENTANA - 1)), iniPrev = sumarDias(ref, -(2 * VENTANA - 1)), finPrev = sumarDias(ref, -VENTANA);
    const usuariosEn = (a, b) => d1Query('SELECT COUNT(DISTINCT id_usuario) AS n FROM INTERACCIONES WHERE substr(fecha_hora, 1, 10) BETWEEN ? AND ?', [a, b]);
    const [diario, uAct, uPrev, animo, ira] = await Promise.all([
      d1Query('SELECT substr(fecha_hora, 1, 10) AS dia, COUNT(*) AS n, COUNT(DISTINCT id_usuario) AS u FROM INTERACCIONES WHERE substr(fecha_hora, 1, 10) BETWEEN ? AND ? GROUP BY dia', [iniPrev, ref]),
      usuariosEn(ini, ref), usuariosEn(iniPrev, finPrev),
      filasAnimo(),
      d1Query(`SELECT COUNT(*) AS n FROM (${SQL_IRA}) WHERE ira >= ?`, [UMBRAL_RIESGO]),
    ]);
    const porDia = new Map(diario.map(f => [f.dia, f]));
    const dias = rango(ini, ref);
    const total = (a, b) => rango(a, b).reduce((s, d) => s + (porDia.has(d) ? porDia.get(d).n : 0), 0);
    const nAct = total(ini, ref), nPrev = total(iniPrev, finPrev);
    const serieA = serieAnimo(animo, rango(iniPrev, ref));
    const actual = serieA.length ? serieA[serieA.length - 1].valor : 0;
    const previo = serieA.find(x => x.dia === finPrev);
    const miembros = (await d1Query("SELECT COUNT(*) AS n FROM USUARIOS WHERE estatus <> 'inactivo'"))[0].n;
    return {
      referencia: ref,
      indicadores: {
        // Si no hay datos en los 30 días anteriores no hay con qué comparar: se avisa en lugar de mostrar 0 %
        interacciones: { valor: nAct, ...(nPrev > 0 ? { delta: cambioPct(nAct, nPrev) } : { nota: 'sin mes previo' }), buenoSiSube: true, serie: dias.map(d => (porDia.has(d) ? porDia.get(d).n : 0)) },
        usuarios: { valor: uAct[0].n, ...(uPrev[0].n > 0 ? { delta: cambioPct(uAct[0].n, uPrev[0].n) } : { nota: 'sin mes previo' }), buenoSiSube: true, serie: dias.map(d => (porDia.has(d) ? porDia.get(d).u : 0)) },
        sentimiento: { valor: actual, ...(previo ? { delta: +(actual - previo.valor).toFixed(3) } : { nota: 'sin mes previo' }), buenoSiSube: true, serie: serieA.filter(x => x.dia >= ini).map(x => x.valor) },
        riesgo: { valor: ira[0].n, nota: `de ${miembros} miembros activos`, umbral: UMBRAL_RIESGO },
      },
    };
  }

  // ---------------------------------------------------------------- 2) actividad
  async function actividad() {
    const ref = await referencia();
    if (!ref) return { fechas: [], interacciones: [], tipos: [], plataformas: [], calor: DIAS_SEMANA.map(() => BLOQUES.map(() => 0)), dias: DIAS_SEMANA, bloques: BLOQUES };
    const ini = sumarDias(ref, -(VENTANA - 1));
    const [diario, tipos, plataformas, calor] = await Promise.all([
      d1Query('SELECT substr(fecha_hora, 1, 10) AS dia, COUNT(*) AS n FROM INTERACCIONES WHERE substr(fecha_hora, 1, 10) BETWEEN ? AND ? GROUP BY dia', [ini, ref]),
      d1Query('SELECT tipo, COUNT(*) AS valor FROM INTERACCIONES GROUP BY tipo ORDER BY valor DESC'),
      d1Query('SELECT p.nombre, COUNT(*) AS valor FROM INTERACCIONES i JOIN PLATAFORMAS p ON p.id_plataforma = i.id_plataforma GROUP BY p.id_plataforma ORDER BY valor DESC, p.nombre'),
      d1Query(`SELECT CAST(strftime('%w', substr(fecha_hora, 1, 10)) AS INTEGER) AS w,
                      CAST(substr(fecha_hora, 12, 2) AS INTEGER) / 2 AS b, COUNT(*) AS n
               FROM INTERACCIONES GROUP BY w, b`),
    ]);
    const porDia = new Map(diario.map(f => [f.dia, f.n]));
    const dias = rango(ini, ref);
    const matriz = DIAS_SEMANA.map(() => BLOQUES.map(() => 0));
    for (const c of calor) matriz[(c.w + 6) % 7][Math.min(11, c.b)] = c.n;   // strftime: 0 = domingo → se pasa a lunes primero
    return {
      fechas: dias.map(etiqueta),
      interacciones: dias.map(d => porDia.get(d) || 0),
      tipos: tipos.map(t => ({ nombre: TIPOS[t.tipo] || t.tipo, valor: t.valor })),
      plataformas: plataformas.map(p => ({ nombre: p.nombre, valor: p.valor })),
      calor: matriz, dias: DIAS_SEMANA, bloques: BLOQUES,
    };
  }

  // ---------------------------------------------------------------- 3) comunidad
  async function comunidad() {
    const [especies, intereses, edades, eventos, resumenU, compradores] = await Promise.all([
      d1Query('SELECT e.nombre, COUNT(*) AS valor FROM USUARIOS u JOIN ESPECIES_FURSONA e ON e.id_especie = u.id_especie GROUP BY e.id_especie ORDER BY valor DESC, e.nombre LIMIT 6'),
      d1Query('SELECT i.nombre, COUNT(*) AS valor FROM USUARIOS u JOIN INTERESES i ON i.id_interes = u.id_interes GROUP BY i.id_interes ORDER BY valor DESC, i.nombre LIMIT 6'),
      d1Query('SELECT rango_edad AS rango, COUNT(*) AS valor FROM USUARIOS GROUP BY rango_edad'),
      d1Query('SELECT MIN(eventos_asistidos, 5) AS k, COUNT(*) AS valor FROM USUARIOS GROUP BY k ORDER BY k'),
      d1Query('SELECT COUNT(*) AS usuarios, COALESCE(SUM(es_artista), 0) AS total, COALESCE(SUM(comisiones_compradas), 0) AS comisiones, COALESCE(AVG(eventos_asistidos), 0) AS promedio FROM USUARIOS'),
      d1Query(`SELECT CASE WHEN consentimiento_datos = 'si' THEN alias ELSE id_usuario END AS nombre, comisiones_compradas AS valor
               FROM USUARIOS WHERE comisiones_compradas > 0 ORDER BY comisiones_compradas DESC, id_usuario LIMIT 5`),
    ]);
    const porRango = new Map(edades.map(e => [e.rango, e.valor]));
    const porK = new Map(eventos.map(e => [e.k, e.valor]));
    const u = resumenU[0];
    return {
      especies, intereses,
      edades: Object.keys(EDADES).map(k => ({ nombre: EDADES[k], valor: porRango.get(k) || 0 })),
      eventosHist: [0, 1, 2, 3, 4, 5].map(k => ({ nombre: k === 5 ? '5+' : String(k), valor: porK.get(k) || 0 })),
      artistas: { total: u.total, usuarios: u.usuarios, comisiones: u.comisiones, eventosPromedio: +u.promedio.toFixed(2) },
      topCompradores: compradores,
    };
  }

  // ---------------------------------------------------------------- 4) ánimo
  async function animo() {
    const ref = await referencia();
    if (!ref) return { fechasAnimo: [], sentimiento: [], umbral: -0.2, ventana: VENTANA_ANIMO };
    const serie = serieAnimo(await filasAnimo(), rango(sumarDias(ref, -(VENTANA - 1)), ref));
    return { fechasAnimo: serie.map(x => etiqueta(x.dia)), sentimiento: serie.map(x => x.valor), umbral: -0.2, ventana: VENTANA_ANIMO };
  }

  // ---------------------------------------------------------------- 5) riesgo
  async function riesgo() {
    const filas = await d1Query(`SELECT * FROM (${SQL_IRA}) WHERE ira >= ? ORDER BY ira DESC, dias DESC, id_usuario LIMIT 6`, [UMBRAL_RIESGO]);
    return {
      umbral: UMBRAL_RIESGO,
      riesgo: filas.map(f => ({ id: f.id_usuario, alias: f.alias, ira: f.ira, ultima: f.dias === 0 ? 'hoy' : `hace ${f.dias} ${f.dias === 1 ? 'día' : 'días'}`, estatus: f.estatus })),
    };
  }

  return { resumen, actividad, comunidad, animo, riesgo };
}

module.exports = { crearMetricas };
