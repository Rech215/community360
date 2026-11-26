const D = window.DATOS_EJEMPLO;
const G = window.Graficas;
const $ = id => document.getElementById(id);


// ---- Indicadores ----
function indicador(id, ind, fmtValor, fmtDelta, unidadDelta) {
  const t = $(id);
  t.querySelector('.valor').textContent = fmtValor(ind.valor);
  const sube = ind.delta >= 0;
  const d = t.querySelector('.delta');
  d.className = 'delta ' + ((sube === ind.buenoSiSube) ? 'bueno' : 'malo');
  d.textContent = `${sube ? '▲' : '▼'} ${fmtDelta(Math.abs(ind.delta))}${unidadDelta} `;
  d.title = 'Comparado con los 30 días previos';
  G.mini(t.querySelector('.mini-caja'), ind.serie, sube === ind.buenoSiSube ? '#6fe0d4' : '#f4a58a');
}
const I = D.indicadores;
indicador('ind-interacciones', I.interacciones, G.fmtN, n => n.toFixed(1), ' %');
indicador('ind-usuarios', I.usuarios, G.fmtN, n => n.toFixed(1), ' %');
indicador('ind-sentimiento', I.sentimiento, v => (v >= 0.15 ? 'Positivo ' : v <= -0.15 ? 'Negativo ' : 'Neutral ') + (v > 0 ? '+' : '') + v.toFixed(2), n => n.toFixed(2), '');
indicador('ind-riesgo', I.riesgo, G.fmtN, n => String(n), ' personas más');

// ---- Datos rápidos de artistas y eventos ----
const A = D.artistas;
$('dato-artistas').textContent = G.fmtN(A.total);
$('dato-artistas-pct').textContent = `${(A.total / A.usuarios * 100).toFixed(0)} % de los usuarios`;
$('dato-comisiones').textContent = G.fmtN(A.comisiones);
$('dato-eventos').textContent = A.eventosPromedio.toFixed(1);

// ---- Gráficas ----
const cuerpo = k => document.querySelector(`[data-grafica="${k}"] .grafica`);
const total = arr => arr.reduce((a, t) => a + t.valor, 0);

G.linea(cuerpo('tendencia'), { titulo: 'Interacciones por día', etiquetas: D.fechas, valores: D.interacciones, min: 0, max: 80, color: G.COL[0],
  nombre: 'interacciones', fmtEje: v => String(Math.round(v)), fmtValor: v => G.fmtN(v) });
G.dona(cuerpo('tipos'), D.tipos);
G.barras(cuerpo('plataformas'), D.plataformas);
G.calor(cuerpo('calor'), D);
G.barras(cuerpo('especies'), D.especies);
G.barras(cuerpo('intereses'), D.intereses);
G.segmentada(cuerpo('edades'), D.edades);
G.columnas(cuerpo('eventos'), D.eventosHist, 'usuarios');
G.barras(cuerpo('topartistas'), D.topArtistas);
G.linea(cuerpo('sentimiento'), { titulo: 'Sentimiento promedio', etiquetas: D.fechas, valores: D.sentimiento, min: -0.6, max: 0.6, color: G.COL[2],
  nombre: 'ánimo', umbral: -0.2, etiquetaUmbral: 'Umbral −0.2', fmtEje: v => (v > 0 ? '+' : '') + v.toFixed(1), fmtValor: v => (v > 0 ? '+' : '') + v.toFixed(2) });

// ---- Usuarios en riesgo (tabla) ----
const cuerpoRiesgo = document.querySelector('#tabla-riesgo tbody');
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

// ---- En vivo (WebSockets) ----
const vivo = $('vivo');
const MAX_VIVO = 12;
const TIPOS = { mensaje: 'Mensaje', comentario: 'Comentario', reaccion: 'Reacción', respuesta_encuesta: 'Respuesta de encuesta', rsvp_evento: 'RSVP a evento' };
const ACCIONES = { creada: 'Nueva', modificada: 'Modificada', eliminada: 'Eliminada' };

function ponerEstado(clase, texto) {
  const e = $('estado-ws');
  e.className = 'estado ' + clase;
  e.lastElementChild.textContent = texto;
}

function agregarMovimiento(msg) {
  const i = msg.interaccion || {};
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
    li.appendChild(G.el('span', { class: 'sent ' + clase }, flecha + (i.sentimiento > 0 ? '+' : '') + i.sentimiento.toFixed(2)));
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
    // La Fase 6 escucha este aviso para volver a pedir las métricas a la API
    document.dispatchEvent(new CustomEvent('c360:cambio', { detail: msg }));
  });
} else {
  ponerEstado('', 'Sin conexión');
}

// ---- Sesión ----
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
  try { await fetch('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/login'; }
});
cargarSesion();

// ---- Vistas (pestañas) ----
const pestanas = document.querySelectorAll('[data-vista]');
function mostrar(nombre) {
  pestanas.forEach(b => b.setAttribute('aria-selected', String(b.dataset.vista === nombre)));
  document.querySelectorAll('.panel').forEach(v => { v.hidden = v.id !== 'v-' + nombre; });
  history.replaceState(null, '', '#' + nombre);
}
pestanas.forEach(b => b.addEventListener('click', () => mostrar(b.dataset.vista)));
const inicial = location.hash.slice(1);
if ([...pestanas].some(b => b.dataset.vista === inicial)) mostrar(inicial);
