// Lógica de negocio de las interacciones: validación y consultas a D1.
// Recibe la función d1Query para poder probarla sin conexión a la nube.

const TIPOS = ['mensaje', 'comentario', 'reaccion', 'respuesta_encuesta', 'rsvp_evento'];
const DISPOSITIVOS = ['Android', 'iOS', 'Web', 'Escritorio'];
const CAMPOS = ['id_usuario', 'fecha_hora', 'id_plataforma', 'tipo', 'texto', 'id_tema',
  'sentimiento', 'dispositivo', 'reacciones_recibidas', 'etiquetas'];
const OBLIGATORIOS = ['id_usuario', 'fecha_hora', 'id_plataforma', 'tipo', 'id_tema', 'sentimiento', 'dispositivo'];

const RE_ID = /^I\d{7}$/;
const RE_USUARIO = /^U\d{6}$/;
const RE_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_TEXTO = 2000;
const MAX_ETIQUETAS = 10;

class ErrorHttp extends Error {
  constructor(estado, mensaje, detalles) {
    super(mensaje);
    this.estado = estado;
    this.detalles = detalles;
  }
}

function fechaReal(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// ---- Validadores por campo: devuelven { valor } o { error } ----
const validadores = {
  id_usuario: v => (typeof v === 'string' && RE_USUARIO.test(v)) ? { valor: v } : { error: 'debe tener el formato U000000' },
  fecha_hora: v => {
    const m = typeof v === 'string' && RE_FECHA_HORA.exec(v);
    if (!m) return { error: 'debe ser una fecha y hora ISO, por ejemplo 2026-11-25T14:30:00' };
    const [, a, mes, d, h, mi, s] = m;
    if (!fechaReal(+a, +mes, +d) || +h > 23 || +mi > 59 || (s !== undefined && +s > 59)) return { error: 'la fecha u hora no existe' };
    return { valor: v };
  },
  id_plataforma: v => (Number.isInteger(v) && v > 0) ? { valor: v } : { error: 'debe ser un entero positivo' },
  id_tema: v => (Number.isInteger(v) && v > 0) ? { valor: v } : { error: 'debe ser un entero positivo' },
  tipo: v => TIPOS.includes(v) ? { valor: v } : { error: `debe ser uno de: ${TIPOS.join(', ')}` },
  dispositivo: v => DISPOSITIVOS.includes(v) ? { valor: v } : { error: `debe ser uno de: ${DISPOSITIVOS.join(', ')}` },
  sentimiento: v => (typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= 1) ? { valor: v } : { error: 'debe ser un número entre -1 y 1' },
  reacciones_recibidas: v => (Number.isInteger(v) && v >= 0 && v <= 1000000) ? { valor: v } : { error: 'debe ser un entero mayor o igual a 0' },
  texto: v => {
    if (v === null) return { valor: null };
    if (typeof v !== 'string') return { error: 'debe ser texto o null' };
    const t = v.trim();
    if (t.length > MAX_TEXTO) return { error: `no puede pasar de ${MAX_TEXTO} caracteres` };
    return { valor: t === '' ? null : t };
  },
  etiquetas: v => {
    if (!Array.isArray(v)) return { error: 'debe ser una lista de ids' };
    if (v.length > MAX_ETIQUETAS) return { error: `máximo ${MAX_ETIQUETAS} etiquetas` };
    if (!v.every(x => Number.isInteger(x) && x > 0)) return { error: 'cada etiqueta debe ser un entero positivo' };
    return { valor: [...new Set(v)] };
  },
};

// Revisa el cuerpo recibido. Con completo=true exige todos los campos obligatorios (POST).
function validarCuerpo(body, completo) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ErrorHttp(400, 'El cuerpo debe ser un objeto JSON');
  }
  const errores = [];
  const datos = {};
  for (const k of Object.keys(body)) {
    if (!CAMPOS.includes(k)) { errores.push(`${k}: campo no permitido`); continue; }
    const r = validadores[k](body[k]);
    if (r.error) errores.push(`${k}: ${r.error}`); else datos[k] = r.valor;
  }
  if (completo) {
    for (const k of OBLIGATORIOS) if (!(k in body)) errores.push(`${k}: es obligatorio`);
  } else if (Object.keys(body).length === 0) {
    errores.push('envía al menos un campo para modificar');
  }
  if (errores.length) throw new ErrorHttp(400, 'Datos inválidos', errores);
  return datos;
}

function parametroEntero(valor, nombre, defecto, min, max) {
  if (valor === undefined) return defecto;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) throw new ErrorHttp(400, `${nombre} debe ser un entero`);
  const n = Number(valor);
  if (n < min || n > max) throw new ErrorHttp(400, `${nombre} debe estar entre ${min} y ${max}`);
  return n;
}

function parametroFecha(valor, nombre) {
  if (valor === undefined) return undefined;
  const m = typeof valor === 'string' && RE_FECHA.exec(valor);
  if (!m || !fechaReal(+m[1], +m[2], +m[3])) throw new ErrorHttp(400, `${nombre} debe tener el formato AAAA-MM-DD`);
  return valor;
}

function crearServicio(d1Query) {
  const marcas = n => Array(n).fill('?').join(',');

  async function existen(tabla, columna, ids) {
    if (!ids.length) return true;
    const r = await d1Query(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${columna} IN (${marcas(ids.length)})`, ids);
    return r[0].n === ids.length;
  }

  // Comprueba que los ids enviados existan, para dar un error claro y no uno de llave foránea
  async function revisarReferencias(datos) {
    const errores = [];
    if ('id_usuario' in datos && !(await existen('USUARIOS', 'id_usuario', [datos.id_usuario]))) errores.push('id_usuario: el usuario no existe');
    if ('id_plataforma' in datos && !(await existen('PLATAFORMAS', 'id_plataforma', [datos.id_plataforma]))) errores.push('id_plataforma: la plataforma no existe');
    if ('id_tema' in datos && !(await existen('TEMAS', 'id_tema', [datos.id_tema]))) errores.push('id_tema: el tema no existe');
    if ('etiquetas' in datos && !(await existen('ETIQUETAS', 'id_etiqueta', datos.etiquetas))) errores.push('etiquetas: alguna etiqueta no existe');
    if (errores.length) throw new ErrorHttp(422, 'Referencias inexistentes', errores);
  }

  function validarId(id) {
    if (!RE_ID.test(id)) throw new ErrorHttp(400, 'El id debe tener el formato I0000000');
  }

  async function obtener(id) {
    validarId(id);
    const f = await d1Query(
      `SELECT i.id_interaccion, i.id_usuario, i.fecha_hora, i.id_plataforma, p.nombre AS plataforma,
              i.tipo, i.texto, i.id_tema, t.nombre AS tema, i.sentimiento, i.dispositivo,
              i.longitud_texto, i.reacciones_recibidas
         FROM INTERACCIONES i
         JOIN PLATAFORMAS p ON p.id_plataforma = i.id_plataforma
         JOIN TEMAS t ON t.id_tema = i.id_tema
        WHERE i.id_interaccion = ?`, [id]);
    if (!f.length) throw new ErrorHttp(404, 'La interacción no existe');
    const e = await d1Query(
      `SELECT e.id_etiqueta, e.nombre FROM INTERACCION_ETIQUETA ie
         JOIN ETIQUETAS e ON e.id_etiqueta = ie.id_etiqueta
        WHERE ie.id_interaccion = ? ORDER BY e.id_etiqueta`, [id]);
    return { ...f[0], etiquetas: e };
  }

  async function listar(q) {
    const limit = parametroEntero(q.limit, 'limit', 20, 1, 100);
    const offset = parametroEntero(q.offset, 'offset', 0, 0, 10000000);
    const desde = parametroFecha(q.desde, 'desde');
    const hasta = parametroFecha(q.hasta, 'hasta');
    const cond = [];
    const params = [];
    if (q.tipo !== undefined) {
      if (!TIPOS.includes(q.tipo)) throw new ErrorHttp(400, `tipo debe ser uno de: ${TIPOS.join(', ')}`);
      cond.push('i.tipo = ?'); params.push(q.tipo);
    }
    if (q.id_usuario !== undefined) {
      if (!RE_USUARIO.test(q.id_usuario)) throw new ErrorHttp(400, 'id_usuario debe tener el formato U000000');
      cond.push('i.id_usuario = ?'); params.push(q.id_usuario);
    }
    for (const [nombre, col] of [['id_plataforma', 'i.id_plataforma'], ['id_tema', 'i.id_tema']]) {
      if (q[nombre] !== undefined) {
        cond.push(`${col} = ?`); params.push(parametroEntero(q[nombre], nombre, 0, 1, 1000000));
      }
    }
    if (desde) { cond.push('substr(i.fecha_hora, 1, 10) >= ?'); params.push(desde); }
    if (hasta) { cond.push('substr(i.fecha_hora, 1, 10) <= ?'); params.push(hasta); }
    const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

    const total = await d1Query(`SELECT COUNT(*) AS total FROM INTERACCIONES i ${donde}`, params);
    const datos = await d1Query(
      `SELECT i.id_interaccion, i.id_usuario, i.fecha_hora, p.nombre AS plataforma, i.tipo,
              i.texto, t.nombre AS tema, i.sentimiento, i.dispositivo, i.reacciones_recibidas
         FROM INTERACCIONES i
         JOIN PLATAFORMAS p ON p.id_plataforma = i.id_plataforma
         JOIN TEMAS t ON t.id_tema = i.id_tema
         ${donde}
        ORDER BY i.fecha_hora DESC, i.id_interaccion DESC
        LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { total: total[0].total, limit, offset, datos };
  }

  async function crear(body) {
    const datos = validarCuerpo(body, true);
    if (datos.texto === undefined) datos.texto = null;
    if (datos.tipo !== 'reaccion' && datos.texto === null) {
      throw new ErrorHttp(400, 'Datos inválidos', ['texto: es obligatorio salvo en las reacciones']);
    }
    if (datos.reacciones_recibidas === undefined) datos.reacciones_recibidas = 0;
    const etiquetas = datos.etiquetas || [];
    await revisarReferencias({ ...datos, etiquetas });

    let id;
    for (let intento = 0; intento < 3; intento++) {
      const m = await d1Query(`SELECT COALESCE(MAX(CAST(SUBSTR(id_interaccion, 2) AS INTEGER)), 0) AS m FROM INTERACCIONES`);
      id = 'I' + String(m[0].m + 1).padStart(7, '0');
      try {
        await d1Query(
          `INSERT INTO INTERACCIONES (id_interaccion, id_usuario, fecha_hora, id_plataforma, tipo, texto,
                                      id_tema, sentimiento, dispositivo, longitud_texto, reacciones_recibidas)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [id, datos.id_usuario, datos.fecha_hora, datos.id_plataforma, datos.tipo, datos.texto,
            datos.id_tema, datos.sentimiento, datos.dispositivo, datos.texto ? datos.texto.length : 0,
            datos.reacciones_recibidas]);
        break;
      } catch (e) {
        if (intento === 2 || !/UNIQUE|PRIMARY/i.test(e.message)) throw e;   // otro proceso tomó el mismo id: reintenta
      }
    }
    if (etiquetas.length) {
      try {
        await d1Query(
          `INSERT INTO INTERACCION_ETIQUETA (id_interaccion, id_etiqueta) VALUES ${etiquetas.map(() => '(?,?)').join(',')}`,
          etiquetas.flatMap(e => [id, e]));
      } catch (e) {
        await d1Query('DELETE FROM INTERACCIONES WHERE id_interaccion = ?', [id]);   // no dejar la interacción a medias
        throw e;
      }
    }
    return obtener(id);
  }

  async function actualizar(id, body) {
    validarId(id);
    const datos = validarCuerpo(body, false);
    const actual = await obtener(id);
    await revisarReferencias(datos);

    const final = { tipo: actual.tipo, texto: actual.texto, ...datos };
    if (final.tipo !== 'reaccion' && !final.texto) {
      throw new ErrorHttp(400, 'Datos inválidos', ['texto: es obligatorio salvo en las reacciones']);
    }
    const cambios = { ...datos };
    delete cambios.etiquetas;
    if ('texto' in cambios) cambios.longitud_texto = cambios.texto ? cambios.texto.length : 0;
    const columnas = Object.keys(cambios);
    if (columnas.length) {
      await d1Query(
        `UPDATE INTERACCIONES SET ${columnas.map(c => `${c} = ?`).join(', ')} WHERE id_interaccion = ?`,
        [...columnas.map(c => cambios[c]), id]);
    }
    if (datos.etiquetas) {
      await d1Query('DELETE FROM INTERACCION_ETIQUETA WHERE id_interaccion = ?', [id]);
      if (datos.etiquetas.length) {
        await d1Query(
          `INSERT INTO INTERACCION_ETIQUETA (id_interaccion, id_etiqueta) VALUES ${datos.etiquetas.map(() => '(?,?)').join(',')}`,
          datos.etiquetas.flatMap(e => [id, e]));
      }
    }
    return obtener(id);
  }

  async function eliminar(id) {
    const previa = await obtener(id);     // valida el formato y lanza 404 si no existe
    await d1Query('DELETE FROM INTERACCION_ETIQUETA WHERE id_interaccion = ?', [id]);
    await d1Query('DELETE FROM INTERACCIONES WHERE id_interaccion = ?', [id]);
    return previa;
  }

  async function catalogos() {
    const [plataformas, temas, etiquetas] = await Promise.all([
      d1Query('SELECT id_plataforma, nombre FROM PLATAFORMAS ORDER BY id_plataforma'),
      d1Query('SELECT id_tema, nombre FROM TEMAS ORDER BY id_tema'),
      d1Query('SELECT id_etiqueta, nombre FROM ETIQUETAS ORDER BY id_etiqueta'),
    ]);
    return { plataformas, temas, etiquetas, tipos: TIPOS, dispositivos: DISPOSITIVOS };
  }

  // Usuarios: sin coordenadas ni consentimiento de ubicación (la privacidad geográfica se mantiene)
  async function usuarios(q) {
    const limit = parametroEntero(q.limit, 'limit', 20, 1, 100);
    const offset = parametroEntero(q.offset, 'offset', 0, 0, 10000000);
    const cond = [];
    const params = [];
    if (q.estatus !== undefined) {
      if (!['activo', 'en_riesgo', 'inactivo'].includes(q.estatus)) throw new ErrorHttp(400, 'estatus debe ser activo, en_riesgo o inactivo');
      cond.push('estatus = ?'); params.push(q.estatus);
    }
    const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const total = await d1Query(`SELECT COUNT(*) AS total FROM USUARIOS ${donde}`, params);
    const datos = await d1Query(
      `SELECT id_usuario, alias, fecha_ingreso, rango_edad, es_artista, mensajes_30d, reacciones_30d,
              eventos_asistidos, comisiones_compradas, sentimiento_promedio, ultima_actividad, estatus
         FROM USUARIOS ${donde} ORDER BY id_usuario LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { total: total[0].total, limit, offset, datos };
  }

  return { listar, obtener, crear, actualizar, eliminar, catalogos, usuarios };
}

module.exports = { crearServicio, ErrorHttp };
