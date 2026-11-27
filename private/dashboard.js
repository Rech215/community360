const G = window.Graficas;
const $ = id => document.getElementById(id);
const signo = v => (v > 0 ? '+' : '') + v.toFixed(2);
const palabraAnimo = v => (v >= 0.15 ? 'Positivo' : v <= -0.15 ? 'Negativo' : 'Neutral');

// ============ Pintado del panel (se puede volver a llamar con datos nuevos) ============
function indicador(id, ind, fmtValor, fmtDelta, unidadDelta) {
  const t = $(id);
  t.querySelector('.valor').textContent = fmtValor(ind.valor);
  const d = t.querySelector('.delta');
  const caja = t.querySelector('.mini-caja');
  if (ind.delta === undefined) {                       // sin historial que comparar: solo una nota
    d.className = 'delta nota';
    d.textContent = ind.nota || '';
    d.title = ind.umbral ? `Riesgo de ${ind.umbral} o más (en una escala de 0 a 100)` : 'No hay datos en los 30 días anteriores para comparar';
    if (ind.serie && ind.serie.length > 1) G.mini(caja, ind.serie, '#6fe0d4'); else caja.replaceChildren();
    return;
  }
  const sube = ind.delta >= 0;
  d.className = 'delta ' + (ind.delta === 0 ? '' : ((sube === ind.buenoSiSube) ? 'bueno' : 'malo'));
  d.textContent = `${ind.delta === 0 ? '' : (sube ? '▲ ' : '▼ ')}${fmtDelta(Math.abs(ind.delta))}${unidadDelta} `;
  d.title = 'Comparado con los 30 días previos';
  if (ind.serie.length > 1) G.mini(caja, ind.serie, sube === ind.buenoSiSube ? '#6fe0d4' : '#f4a58a');
  else caja.replaceChildren();
}

const cuerpo = k => document.querySelector(`[data-grafica="${k}"] .grafica`);

function pintar(D) {
  const I = D.indicadores;
  indicador('ind-interacciones', I.interacciones, G.fmtN, n => n.toFixed(1), ' %');
  indicador('ind-usuarios', I.usuarios, G.fmtN, n => n.toFixed(1), ' %');
  indicador('ind-sentimiento', I.sentimiento, v => palabraAnimo(v) + ' ' + signo(v), n => n.toFixed(2), '');
  indicador('ind-riesgo', I.riesgo, G.fmtN, n => String(n), '');

  const A = D.artistas;
  $('dato-artistas').textContent = G.fmtN(A.total);
  $('dato-artistas-pct').textContent = `${(A.total / A.usuarios * 100).toFixed(0)} % de los usuarios`;
  $('dato-comisiones').textContent = G.fmtN(A.comisiones);
  $('dato-eventos').textContent = A.eventosPromedio.toFixed(1);

  const maxDia = Math.max(1, ...D.interacciones);
  G.linea(cuerpo('tendencia'), { titulo: 'Interacciones por día', etiquetas: D.fechas, valores: D.interacciones, min: 0, max: Math.max(5, Math.ceil(maxDia / 5) * 5), color: G.COL[0],
    nombre: 'interacciones', fmtEje: v => String(Math.round(v)), fmtValor: v => G.fmtN(v) });
  G.dona(cuerpo('tipos'), D.tipos);
  G.barras(cuerpo('plataformas'), D.plataformas, 'participaciones');
  G.calor(cuerpo('calor'), D);
  G.barras(cuerpo('especies'), D.especies, 'personas');
  G.barras(cuerpo('intereses'), D.intereses, 'personas');
  G.segmentada(cuerpo('edades'), D.edades);
  G.columnas(cuerpo('eventos'), D.eventosHist, 'usuarios');
  G.barras(cuerpo('topartistas'), D.topCompradores, 'comisiones');

  const sent = D.sentimiento;
  const lim = Math.min(1, Math.max(0.6, Math.ceil(Math.max(0, ...sent.map(Math.abs)) * 5) / 5));
  G.linea(cuerpo('sentimiento'), { titulo: 'Ánimo promedio', etiquetas: D.fechasAnimo, valores: sent, min: -lim, max: lim, color: G.COL[2],
    nombre: 'ánimo', umbral: -0.2, etiquetaUmbral: 'Alerta −0.2',
    zonas: [{ desde: 0, hasta: lim, color: '#2e9e5b', opacidad: 0.07 }, { desde: -lim, hasta: -0.2, color: '#c4572f', opacidad: 0.09 }],
    fmtEje: v => (v > 0 ? '+' : '') + v.toFixed(1), fmtValor: signo });

  if (sent.length) {
    const actual = sent[sent.length - 1];
    const iMin = sent.indexOf(Math.min(...sent));
    $('b-actual').textContent = signo(actual);
    $('b-actual-txt').textContent = palabraAnimo(actual);
    $('b-minimo').textContent = signo(sent[iMin]);
    $('b-minimo-txt').textContent = D.fechasAnimo[iMin];
    $('b-alertas').textContent = String(sent.filter(v => v < -0.2).length);
  }

  const cuerpoRiesgo = document.querySelector('#tabla-riesgo tbody');
  cuerpoRiesgo.replaceChildren();
  if (!D.riesgo.length) {
    const tr = document.createElement('tr'); const td = G.el('td', { colspan: '3' }, 'Nadie supera el nivel de riesgo.'); tr.appendChild(td); cuerpoRiesgo.appendChild(tr);
  }
  D.riesgo.slice(0, 6).forEach(u => {
    const color = u.ira >= 75 ? '#b3261e' : u.ira >= 55 ? '#d98a00' : '#c98a14';
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.append(G.el('strong', {}, u.alias), G.el('span', { class: 'alias' }, u.id));
    const td2 = document.createElement('td');
    const caja = G.el('div', { class: 'ira' });
    const medidor = G.el('div', { class: 'medidor' }); medidor.appendChild(G.el('i', { style: `width:${u.ira}%;background:${color}` }));
    caja.append(medidor, G.el('b', {}, `${u.ira}`)); caja.title = u.ira >= 75 ? 'Riesgo alto' : u.ira >= 55 ? 'Riesgo medio' : 'Riesgo moderado';
    td2.appendChild(caja);
    tr.append(td1, td2, G.el('td', {}, u.ultima.replace('hace ', '')));
    cuerpoRiesgo.appendChild(tr);
  });
}

// ============ Métricas reales (API REST → Cloudflare D1) ============
const hora = () => new Date().toLocaleTimeString('es-MX', { hour12: false });
let cargandoMetricas = false, repetirMetricas = false;
async function cargarMetricas() {
  if (cargandoMetricas) { repetirMetricas = true; return; }     // si ya hay una consulta en curso, se repite al terminar
  cargandoMetricas = true;
  const chip = $('estado-datos');
  try {
    const [r, a, c, n, k] = await Promise.all(['resumen', 'actividad', 'comunidad', 'animo', 'riesgo'].map(x => pedir('/api/metricas/' + x)));
    pintar({ ...a, ...c, ...n, ...k, indicadores: r.indicadores });
    chip.className = 'chip-datos ok';
    chip.textContent = 'Actualizado ' + hora();
    chip.title = r.referencia ? `El mes se cuenta hacia atrás desde el último día con actividad (${r.referencia}).` : 'Todavía no hay interacciones.';
  } catch (e) {
    chip.className = 'chip-datos error';
    chip.textContent = 'No se pudieron cargar los datos';
  } finally {
    cargandoMetricas = false;
    if (repetirMetricas) { repetirMetricas = false; cargarMetricas(); }
  }
}
cargarMetricas();
let pendienteMetricas = null;
document.addEventListener('c360:cambio', () => {
  clearTimeout(pendienteMetricas); pendienteMetricas = setTimeout(cargarMetricas, 400);   // junta avisos seguidos en una sola consulta
});

// ============ En vivo (WebSockets) ============
const vivo = $('vivo');
const MAX_VIVO = 12;
const TIPOS = { mensaje: 'Mensaje', comentario: 'Comentario', reaccion: 'Reacción', respuesta_encuesta: 'Respuesta de encuesta', rsvp_evento: 'RSVP a evento' };
const ACCIONES = { creada: 'Nueva', modificada: 'Modificada', eliminada: 'Eliminada' };
const contador = { creada: 0, modificada: 0, eliminada: 0 };

function ponerEstado(clase, texto) {
  const e = $('estado-ws');
  e.className = 'estado ' + clase;
  e.lastElementChild.textContent = texto;
}

function agregarMovimiento(msg) {
  const i = msg.interaccion || {};
  contador[msg.accion] = (contador[msg.accion] || 0) + 1;
  $('c-' + msg.accion).textContent = String(contador[msg.accion]);
  const hora = new Date(msg.hora).toLocaleTimeString('es-MX', { hour12: false });
  const li = document.createElement('li');
  li.className = 'accion-' + msg.accion;
  li.appendChild(G.el('span', { class: 'hora' }, hora));
  const q = G.el('span', { class: 'quien-vivo' }, (i.id_usuario || '—') + ' · ' + (i.id_interaccion || ''));
  if (i.plataforma) q.appendChild(G.el('small', {}, i.plataforma));
  li.appendChild(q);
  li.appendChild(G.el('span', { class: 'tipo etiqueta-' + msg.accion }, ACCIONES[msg.accion] + (i.tipo ? ' · ' + (TIPOS[i.tipo] || i.tipo) : '')));
  if (typeof i.sentimiento === 'number') {
    const clase = i.sentimiento > 0.15 ? 'pos' : i.sentimiento < -0.15 ? 'neg' : 'neu';
    const flecha = clase === 'pos' ? '▲ ' : clase === 'neg' ? '▼ ' : '● ';
    li.appendChild(G.el('span', { class: 'sent ' + clase }, flecha + signo(i.sentimiento)));
  } else {
    li.appendChild(G.el('span', { class: 'sent neu' }, '—'));
  }
  $('vivo-vacio').hidden = true;
  vivo.prepend(li);
  while (vivo.children.length > MAX_VIVO) vivo.lastElementChild.remove();
  li.classList.add('nuevo');
  setTimeout(() => li.classList.remove('nuevo'), 2500);
}

if (window.io) {
  const socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => ponerEstado('ok', 'Conectado en vivo'));
  socket.on('disconnect', () => ponerEstado('', 'Reconectando…'));
  socket.on('connect_error', err => {
    if (err && err.message === 'No autenticado') { window.location.href = '/login'; return; }
    ponerEstado('', 'Sin conexión');
  });
  socket.on('interaccion', msg => {
    agregarMovimiento(msg);
    // El historial y (en la Fase 6) las métricas se vuelven a pedir a la API cuando algo cambia
    document.dispatchEvent(new CustomEvent('c360:cambio', { detail: msg }));
  });
} else {
  ponerEstado('', 'Sin conexión');
}

// ============ Historial (API REST) ============
const POR_PAGINA = 12;
const hist = { offset: 0, total: 0, listo: false, catalogos: false };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const bonito = t => String(t).replace(/_/g, ' ');

async function pedir(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 401) { window.location.href = '/login'; throw new Error('sin sesión'); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function cargarCatalogos() {
  if (hist.catalogos) return;
  const c = await pedir('/api/catalogos');
  c.tipos.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = TIPOS[t] || t; $('f-tipo').appendChild(o); });
  c.plataformas.forEach(p => { const o = document.createElement('option'); o.value = String(p.id_plataforma); o.textContent = p.nombre; $('f-plataforma').appendChild(o); });
  hist.catalogos = true;
}

async function cargarHistorial() {
  const q = new URLSearchParams({ limit: String(POR_PAGINA), offset: String(hist.offset) });
  if ($('f-tipo').value) q.set('tipo', $('f-tipo').value);
  if ($('f-plataforma').value) q.set('id_plataforma', $('f-plataforma').value);
  if ($('f-desde').value) q.set('desde', $('f-desde').value);
  if ($('f-hasta').value) q.set('hasta', $('f-hasta').value);
  const cuerpoTabla = document.querySelector('#tabla-historial tbody');
  try {
    const r = await pedir('/api/interacciones?' + q);
    hist.total = r.total;
    cuerpoTabla.replaceChildren();
    r.datos.forEach(d => {
      const tr = document.createElement('tr');
      const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(d.fecha_hora));
      const tdFecha = document.createElement('td'); tdFecha.className = 'nowrap';
      tdFecha.appendChild(G.el('span', { class: 'p1' }, m ? `${m[3]} ${MESES[+m[2] - 1]}` : String(d.fecha_hora)));
      if (m) tdFecha.appendChild(G.el('span', { class: 'p2' }, `${m[4]}:${m[5]}`));
      tr.appendChild(tdFecha);
      const tdUsr = document.createElement('td'); tdUsr.className = 'nowrap';
      tdUsr.appendChild(G.el('span', { class: 'p1' }, d.id_usuario));
      tdUsr.appendChild(G.el('span', { class: 'p2' }, d.plataforma));
      tr.appendChild(tdUsr);
      const tdTipo = document.createElement('td'); tdTipo.appendChild(G.el('span', { class: 'pastilla' }, TIPOS[d.tipo] || d.tipo)); tr.appendChild(tdTipo);
      tr.appendChild(G.el('td', { class: 'tema' }, bonito(d.tema)));
      const clase = d.sentimiento > 0.15 ? 'pos' : d.sentimiento < -0.15 ? 'neg' : 'neu';
      const tdAnimo = document.createElement('td');
      tdAnimo.appendChild(G.el('span', { class: 'animo ' + clase }, (clase === 'pos' ? '▲ ' : clase === 'neg' ? '▼ ' : '● ') + signo(d.sentimiento)));
      tr.appendChild(tdAnimo);
      tr.appendChild(G.el('td', { class: 'texto-celda', title: d.texto || '' }, d.texto || '— (reacción)'));
      cuerpoTabla.appendChild(tr);
    });
    $('hist-vacio').hidden = r.datos.length > 0;
    const ini = r.total === 0 ? 0 : hist.offset + 1, fin = hist.offset + r.datos.length;
    $('hist-rango').textContent = `Mostrando ${ini}–${fin} de ${G.fmtN(r.total)}`;
    $('hist-ant').disabled = hist.offset === 0;
    $('hist-sig').disabled = hist.offset + POR_PAGINA >= r.total;
    hist.listo = true;
  } catch (e) {
    $('hist-rango').textContent = 'No se pudo cargar el historial.';
  }
}

async function abrirHistorial() {
  try { await cargarCatalogos(); } catch { /* se queda sin filtros */ }
  cargarHistorial();
}
$('filtros').addEventListener('change', () => { hist.offset = 0; cargarHistorial(); });
$('filtros').addEventListener('reset', () => setTimeout(() => { hist.offset = 0; cargarHistorial(); }, 0));
$('hist-ant').addEventListener('click', () => { hist.offset = Math.max(0, hist.offset - POR_PAGINA); cargarHistorial(); });
$('hist-sig').addEventListener('click', () => { hist.offset += POR_PAGINA; cargarHistorial(); });
let pendiente = null;
document.addEventListener('c360:cambio', () => {
  if (!hist.listo) return;
  clearTimeout(pendiente); pendiente = setTimeout(cargarHistorial, 400);   // junta avisos seguidos en una sola consulta
});

// ============ Sesión ============
async function cargarSesion() {
  try {
    const r = await fetch('/api/auth/me');
    if (r.status === 401) { window.location.href = '/login'; return; }
    const datos = await r.json();
    $('quien').textContent = datos.usuario;
    $('rol').textContent = datos.rol;
  } catch { /* se queda con los puntos */ }
}
$('salir').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* da igual */ }
  window.location.href = '/login';
});
cargarSesion();

// ============ Pestañas ============
const pestanas = document.querySelectorAll('[data-vista]');
function mostrar(nombre) {
  pestanas.forEach(b => b.setAttribute('aria-selected', String(b.dataset.vista === nombre)));
  document.querySelectorAll('.panel').forEach(v => { v.hidden = v.id !== 'v-' + nombre; });
  history.replaceState(null, '', '#' + nombre);
  if (nombre === 'historial' && !hist.listo) abrirHistorial();
}
pestanas.forEach(b => b.addEventListener('click', () => mostrar(b.dataset.vista)));
const inicial = location.hash.slice(1);
if ([...pestanas].some(b => b.dataset.vista === inicial)) mostrar(inicial);
