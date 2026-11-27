// Componentes de gráficas sin librerías: reciben datos y dibujan SVG/HTML.
// Los textos se insertan siempre con textContent (los datos no se tratan como HTML).
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const COL = ['#008f85', '#c4572f', '#2f6fb8', '#c98a14', '#9b4a8a'];   // paleta categórica validada (orden fijo)
  const fmtN = n => Number(n).toLocaleString('es-MX');

  function el(tag, attrs, texto, svg) {
    const e = svg ? document.createElementNS(NS, tag) : document.createElement(tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (texto !== undefined) e.textContent = texto;
    return e;
  }
  const s = (tag, attrs, texto) => el(tag, attrs, texto, true);

  // ---- Tooltip único ----
  const tip = el('div', { class: 'tooltip', role: 'status' });
  document.body.appendChild(tip);
  function verTip(x, y, titulo, filas) {
    tip.replaceChildren();
    tip.appendChild(el('div', { class: 'tt-titulo' }, titulo));
    for (const f of filas) {
      const fila = el('div', { class: 'tt-fila' });
      if (f.color) fila.appendChild(el('i', { style: `background:${f.color}` }));
      fila.appendChild(el('strong', {}, f.valor));
      fila.appendChild(el('span', {}, f.nombre));
      tip.appendChild(fila);
    }
    tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(x + 14, window.innerWidth - w - 8) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  const ocultarTip = () => { tip.style.display = 'none'; };

  // ---- Vista de tabla (equivalente accesible de cada gráfica) ----
  function tabla(cabeceras, filas) {
    const t = el('table', { class: 'tabla-datos' });
    const th = el('thead'); const trh = el('tr');
    cabeceras.forEach(c => trh.appendChild(el('th', { scope: 'col' }, c)));
    th.appendChild(trh); t.appendChild(th);
    const tb = el('tbody');
    filas.forEach(f => { const tr = el('tr'); f.forEach(c => tr.appendChild(el('td', {}, String(c)))); tb.appendChild(tr); });
    t.appendChild(tb);
    return t;
  }

  // ---- Línea / área con cursor ----
  function linea(cont, o) {
    const W = 640, H = 230, m = { l: 46, r: 18, t: 14, b: 28 };
    const n = o.valores.length;
    const x = i => m.l + (i / (n - 1)) * (W - m.l - m.r);
    const y = v => m.t + (1 - (v - o.min) / (o.max - o.min)) * (H - m.t - m.b);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'svg-grafica', role: 'img', 'aria-label': o.titulo });

    const paso = (o.max - o.min) / 4;
    for (let k = 0; k <= 4; k++) {
      const v = o.min + k * paso;
      svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(s('text', { x: m.l - 8, y: y(v) + 4, class: 'eje', 'text-anchor': 'end' }, o.fmtEje(v)));
    }
    const cada = Math.ceil(n / 6);
    for (let i = 0; i < n; i += cada) svg.appendChild(s('text', { x: x(i), y: H - 8, class: 'eje', 'text-anchor': 'middle' }, o.etiquetas[i]));

    (o.zonas || []).forEach(z => {
      svg.appendChild(s('rect', { x: m.l, y: y(z.hasta), width: W - m.l - m.r, height: Math.max(0, y(z.desde) - y(z.hasta)), fill: z.color, opacity: z.opacidad, rx: 3 }));
    });
    if (o.umbral !== undefined) {
      svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: y(o.umbral), y2: y(o.umbral), class: 'umbral' }));
      svg.appendChild(s('text', { x: W - m.r, y: y(o.umbral) - 6, class: 'eje umbral-txt', 'text-anchor': 'end' }, o.etiquetaUmbral));
    }
    const pts = o.valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    svg.appendChild(s('path', { d: `M${pts[0]} L${pts.join(' L')} L${x(n - 1)},${y(o.min)} L${x(0)},${y(o.min)} Z`, fill: o.color, opacity: .1 }));
    svg.appendChild(s('polyline', { points: pts.join(' '), fill: 'none', stroke: o.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    if (o.umbral !== undefined) {
      o.valores.forEach((v, i) => { if (v < o.umbral) {
        svg.appendChild(s('circle', { cx: x(i), cy: y(v), r: 4, fill: '#c4572f', stroke: '#fffdf9', 'stroke-width': 2 }));
      } });
    }
    const u = n - 1;
    svg.appendChild(s('circle', { cx: x(u), cy: y(o.valores[u]), r: 4.5, fill: o.color, stroke: '#fffdf9', 'stroke-width': 2 }));

    const guia = s('line', { y1: m.t, y2: H - m.b, class: 'guia', style: 'display:none' });
    const punto = s('circle', { r: 4.5, fill: o.color, stroke: '#fffdf9', 'stroke-width': 2, style: 'display:none' });
    svg.appendChild(guia); svg.appendChild(punto);
    const capa = s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
    capa.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
      guia.setAttribute('x1', x(i)); guia.setAttribute('x2', x(i)); guia.style.display = '';
      punto.setAttribute('cx', x(i)); punto.setAttribute('cy', y(o.valores[i])); punto.style.display = '';
      verTip(e.clientX, e.clientY, o.etiquetas[i], [{ color: o.color, valor: o.fmtValor(o.valores[i]), nombre: o.nombre }]);
    });
    capa.addEventListener('pointerleave', () => { guia.style.display = 'none'; punto.style.display = 'none'; ocultarTip(); });
    svg.appendChild(capa);
    cont.replaceChildren(svg);
  }

  // ---- Barras horizontales (una serie = un solo color) ----
  function barras(cont, items, unidad = 'participaciones') {
    const max = Math.max(...items.map(i => i.valor));
    const suma = items.reduce((a, i) => a + i.valor, 0);
    const lista = el('div', { class: 'barras' });
    items.forEach((it, k) => {
      const fila = el('div', { class: 'barra-fila' + (k === 0 ? ' primera' : ''), tabindex: '0' });
      fila.appendChild(el('span', { class: 'barra-nombre' }, it.nombre));
      const pista = el('div', { class: 'barra-pista' });
      pista.appendChild(el('div', { class: 'barra', style: `width:${Math.max(3, (it.valor / max) * 100)}%` }));
      fila.appendChild(pista);
      const num = el('span', { class: 'barra-valor' }, fmtN(it.valor));
      num.appendChild(el('small', {}, `${(it.valor / suma * 100).toFixed(0)} %`));
      fila.appendChild(num);
      const mostrar = e => { const r = fila.getBoundingClientRect(); verTip(e.clientX || r.left + 80, e.clientY || r.top, it.nombre, [{ color: COL[0], valor: fmtN(it.valor), nombre: `${unidad} · ${(it.valor / suma * 100).toFixed(1)} %` }]); };
      fila.addEventListener('pointermove', mostrar); fila.addEventListener('focus', mostrar);
      fila.addEventListener('pointerleave', ocultarTip); fila.addEventListener('blur', ocultarTip);
      lista.appendChild(fila);
    });
    cont.replaceChildren(lista);
  }

  // ---- Dona (parte de un todo, 5 segmentos) ----
  function dona(cont, items) {
    const total = items.reduce((a, i) => a + i.valor, 0);
    const R = 66, C = 2 * Math.PI * R, GAP = 2.5;
    const svg = s('svg', { viewBox: '0 0 180 180', class: 'svg-dona', role: 'img', 'aria-label': 'Interacciones por tipo' });
    let acum = 0;
    items.forEach((it, k) => {
      const largo = (it.valor / total) * C;
      const seg = s('circle', { cx: 90, cy: 90, r: R, fill: 'none', stroke: COL[k], 'stroke-width': 24,
        'stroke-dasharray': `${Math.max(largo - GAP, 0.5)} ${C}`, 'stroke-dashoffset': -acum, transform: 'rotate(-90 90 90)', class: 'segmento', tabindex: '0' });
      const mostrar = e => { const r = seg.getBoundingClientRect(); verTip(e.clientX || r.left + r.width / 2, e.clientY || r.top, it.nombre, [{ color: COL[k], valor: fmtN(it.valor), nombre: `${(it.valor / total * 100).toFixed(1)} %` }]); };
      seg.addEventListener('pointermove', mostrar); seg.addEventListener('focus', mostrar);
      seg.addEventListener('pointerleave', ocultarTip); seg.addEventListener('blur', ocultarTip);
      svg.appendChild(seg);
      acum += largo;
    });
    svg.appendChild(s('text', { x: 90, y: 90, class: 'dona-total', 'text-anchor': 'middle' }, fmtN(total)));
    svg.appendChild(s('text', { x: 90, y: 108, class: 'dona-sub', 'text-anchor': 'middle' }, 'participaciones'));

    const leyenda = el('ul', { class: 'leyenda' });
    items.forEach((it, k) => {
      const li = el('li');
      li.appendChild(el('i', { style: `background:${COL[k]}` }));
      li.appendChild(el('span', {}, it.nombre));
      li.appendChild(el('b', {}, `${(it.valor / total * 100).toFixed(0)} %`));
      leyenda.appendChild(li);
    });
    const caja = el('div', { class: 'dona-caja' });
    caja.appendChild(svg); caja.appendChild(leyenda);
    cont.replaceChildren(caja);
  }

  // ---- Mapa de calor día × franja horaria (una sola tinta, de claro a oscuro) ----
  const DIA_LARGO = { Lun: 'lunes', Mar: 'martes', 'Mié': 'miércoles', Jue: 'jueves', Vie: 'viernes', 'Sáb': 'sábado', Dom: 'domingo' };
  function calor(cont, d) {
    const max = Math.max(...d.calor.flat(), 1);
    let pico = { v: -1, r: 0, c: 0 };
    d.calor.forEach((fila, r) => fila.forEach((v, c) => { if (v > pico.v) pico = { v, r, c }; }));
    const mezcla = t => {
      const a = [231, 244, 242], b = [8, 78, 72];
      return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * Math.pow(t, 0.85))).join(',')})`;
    };
    const resumen = el('p', { class: 'calor-resumen' });
    resumen.appendChild(document.createTextNode('Momento más activo: '));
    resumen.appendChild(el('strong', {}, `${DIA_LARGO[d.dias[pico.r]] || d.dias[pico.r]}, de ${d.bloques[pico.c].replace('–', ' a ')} h`));
    resumen.appendChild(el('span', {}, ` · ${fmtN(pico.v)} participaciones`));
    const malla = el('div', { class: 'calor' });
    malla.appendChild(el('span'));
    d.bloques.forEach((b, i) => malla.appendChild(el('span', { class: 'calor-col' }, i % 2 === 0 ? b.split('–')[0] + ' h' : '')));
    d.dias.forEach((dia, r) => {
      malla.appendChild(el('span', { class: 'calor-fila' }, dia));
      d.calor[r].forEach((v, c) => {
        const esPico = r === pico.r && c === pico.c;
        const celda = el('span', { class: 'celda' + (esPico ? ' pico' : ''), style: `background:${mezcla(v / max)}`, tabindex: '0' });
        const mostrar = e => { const b = celda.getBoundingClientRect(); verTip(e.clientX || b.left, e.clientY || b.top, `${dia}, ${d.bloques[c]} h`, [{ valor: fmtN(v), nombre: 'participaciones' }]); };
        celda.addEventListener('pointermove', mostrar); celda.addEventListener('focus', mostrar);
        celda.addEventListener('pointerleave', ocultarTip); celda.addEventListener('blur', ocultarTip);
        malla.appendChild(celda);
      });
    });
    const escala = el('div', { class: 'escala' });
    escala.appendChild(el('span', {}, 'Menos'));
    const barra = el('i'); barra.style.background = `linear-gradient(90deg, ${mezcla(0)}, ${mezcla(1)})`;
    escala.appendChild(barra); escala.appendChild(el('span', {}, 'Más'));
    cont.replaceChildren(resumen, malla, escala);
  }

  // ---- Minigráfica para las tarjetas de indicadores ----
  let idMini = 0;
  function mini(cont, serie, color) {
    const W = 240, H = 48, min = Math.min(...serie), max = Math.max(...serie), n = serie.length;
    const px = i => (i / (n - 1)) * W;
    const py = v => 8 + (1 - (v - min) / ((max - min) || 1)) * (H - 14);
    const id = 'mini-g' + (idMini++);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mini', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const defs = s('defs'); const gr = s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    gr.appendChild(s('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '.22' }));
    gr.appendChild(s('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }));
    defs.appendChild(gr); svg.appendChild(defs);
    const pts = serie.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
    svg.appendChild(s('polygon', { points: `0,${H} ${pts.join(' ')} ${W},${H}`, fill: `url(#${id})` }));
    svg.appendChild(s('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    cont.replaceChildren(svg);
  }

  // ---- Columnas verticales (una serie) ----
  function columnas(cont, items, nombre) {
    const W = 420, H = 210, m = { l: 40, r: 10, t: 12, b: 30 };
    const max = Math.max(...items.map(i => i.valor));
    const tope = Math.ceil(max / 100) * 100;
    const y = v => m.t + (1 - v / tope) * (H - m.t - m.b);
    const banda = (W - m.l - m.r) / items.length;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'svg-grafica', role: 'img', 'aria-label': nombre });
    const defs = s('defs'); const gr = s('linearGradient', { id: 'grad-col', x1: 0, y1: 0, x2: 0, y2: 1 });
    gr.appendChild(s('stop', { offset: '0%', 'stop-color': '#12a79b' })); gr.appendChild(s('stop', { offset: '100%', 'stop-color': '#0a6f67' }));
    defs.appendChild(gr); svg.appendChild(defs);
    for (let k = 0; k <= 4; k++) {
      const v = (tope / 4) * k;
      svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(s('text', { x: m.l - 8, y: y(v) + 4, class: 'eje', 'text-anchor': 'end' }, fmtN(v)));
    }
    items.forEach((it, i) => {
      const ancho = Math.min(30, banda - 12);
      const x0 = m.l + banda * i + (banda - ancho) / 2;
      const alto = y(0) - y(it.valor);
      const r = Math.min(7, alto);
      const d = `M${x0},${y(0)} V${y(it.valor) + r} Q${x0},${y(it.valor)} ${x0 + r},${y(it.valor)} H${x0 + ancho - r} Q${x0 + ancho},${y(it.valor)} ${x0 + ancho},${y(it.valor) + r} V${y(0)} Z`;
      const col = s('path', { d, fill: 'url(#grad-col)', class: 'columna', tabindex: '0' });
      const mostrar = e => { const b = col.getBoundingClientRect(); verTip(e.clientX || b.left + b.width / 2, e.clientY || b.top, it.nombre, [{ color: COL[0], valor: fmtN(it.valor), nombre }]); };
      col.addEventListener('pointermove', mostrar); col.addEventListener('focus', mostrar);
      col.addEventListener('pointerleave', ocultarTip); col.addEventListener('blur', ocultarTip);
      svg.appendChild(col);
      svg.appendChild(s('text', { x: x0 + ancho / 2, y: y(it.valor) - 6, class: 'eje valor-col', 'text-anchor': 'middle' }, fmtN(it.valor)));
      svg.appendChild(s('text', { x: x0 + ancho / 2, y: H - 10, class: 'eje', 'text-anchor': 'middle' }, it.nombre));
    });
    cont.replaceChildren(svg);
  }

  // ---- Barra segmentada: un todo dividido en partes ordenadas (una sola tinta) ----
  function segmentada(cont, items) {
    const total = items.reduce((a, i) => a + i.valor, 0) || 1;
    const tonos = ['#6fbcb3', '#2e978d', '#0f7a70', '#0b554e'];
    const textos = ['#1c2b2a', '#ffffff', '#ffffff', '#ffffff'];
    const mayor = items.reduce((m, i, k) => (i.valor > items[m].valor ? k : m), 0);
    const pctDe = it => it.valor / total * 100;
    const hero = el('p', { class: 'edad-hero' });
    hero.appendChild(document.createTextNode('El grupo más grande es '));
    hero.appendChild(el('strong', {}, items[mayor].nombre));
    hero.appendChild(document.createTextNode(` (${pctDe(items[mayor]).toFixed(0)} % de la comunidad)`));
    const barra = el('div', { class: 'segmentada', role: 'img', 'aria-label': 'Distribución por rango de edad' });
    items.forEach((it, k) => {
      const pct = pctDe(it);
      const seg = el('div', { class: 'seg', style: `width:${pct}%;background:${tonos[k]};color:${textos[k]}`, tabindex: '0' });
      const mostrar = e => { const bb = seg.getBoundingClientRect(); verTip(e.clientX || bb.left, e.clientY || bb.top, it.nombre, [{ valor: fmtN(it.valor), nombre: `${pct.toFixed(1)} % de los usuarios` }]); };
      seg.addEventListener('pointermove', mostrar); seg.addEventListener('focus', mostrar);
      seg.addEventListener('pointerleave', ocultarTip); seg.addEventListener('blur', ocultarTip);
      barra.appendChild(seg);
    });
    const rejilla = el('ul', { class: 'edad-grupos' });
    items.forEach((it, k) => {
      const t = el('li', { class: 'edad-grupo' + (k === mayor ? ' mayor' : '') });
      const nom = el('span', { class: 'edad-nombre' }); nom.appendChild(el('i', { style: `background:${tonos[k]}` })); nom.appendChild(document.createTextNode(it.nombre));
      t.appendChild(nom);
      t.appendChild(el('small', {}, fmtN(it.valor) + ' personas'));
      t.appendChild(el('strong', {}, pctDe(it).toFixed(0) + ' %'));
      rejilla.appendChild(t);
    });
    cont.replaceChildren(barra, rejilla);
  }

  window.Graficas = { linea, barras, dona, calor, mini, tabla, columnas, segmentada, fmtN, COL, el };
})();
