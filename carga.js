// COMMUNITY 360 - Fase 2 - Paso 8: carga a Cloudflare D1 y Cloud Firestore.
// Lee salida/datos-para-carga.json (lo genera etl-transformar.js).
//
//   node --use-system-ca carga.js            carga real
//   node carga.js --simular                  solo genera salida/carga-simulada.sql, no toca la nube
//
// Se puede volver a ejecutar: primero vacía las tablas de datos y la colección cuarentena.
const fs = require('fs');
const path = require('path');

const SIMULAR = process.argv.includes('--simular');
const datos = JSON.parse(fs.readFileSync(path.join(__dirname, 'salida', 'datos-para-carga.json'), 'utf8'));

// ---------- helpers para D1 ----------
function literal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Número inválido: ' + v);
    return String(v);
  }
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function inserts(tabla, filas, columnas, tam = 50) {
  const out = [];
  for (let i = 0; i < filas.length; i += tam) {
    const bloque = filas.slice(i, i + tam)
      .map(f => '(' + columnas.map(c => literal(f[c])).join(', ') + ')').join(',\n');
    out.push(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES\n${bloque}`);
  }
  return out;
}

// Orden de carga: primero los padres, después los hijos.
const c = datos.catalogos;
const plan = [
  ['PAISES', c.PAISES, ['id_pais', 'nombre']],
  ['ESTADOS', c.ESTADOS, ['id_estado', 'nombre', 'id_pais']],
  ['CIUDADES', c.CIUDADES, ['id_ciudad', 'nombre', 'id_estado', 'zona_horaria']],
  ['ESPECIES_FURSONA', c.ESPECIES_FURSONA, ['id_especie', 'nombre']],
  ['INTERESES', c.INTERESES, ['id_interes', 'nombre']],
  ['PLATAFORMAS', c.PLATAFORMAS, ['id_plataforma', 'nombre']],
  ['TEMAS', c.TEMAS, ['id_tema', 'nombre']],
  ['ETIQUETAS', c.ETIQUETAS, ['id_etiqueta', 'nombre']],
  ['USUARIOS', datos.USUARIOS, ['id_usuario', 'alias', 'fecha_ingreso', 'id_ciudad', 'latitud', 'longitud', 'rango_edad', 'id_especie', 'id_interes', 'id_plataforma', 'es_artista', 'mensajes_30d', 'reacciones_30d', 'eventos_asistidos', 'comisiones_compradas', 'sentimiento_promedio', 'ultima_actividad', 'estatus', 'consentimiento_datos', 'es_atipico']],
  ['INTERACCIONES', datos.INTERACCIONES, ['id_interaccion', 'id_usuario', 'fecha_hora', 'id_plataforma', 'tipo', 'texto', 'id_tema', 'sentimiento', 'dispositivo', 'longitud_texto', 'reacciones_recibidas']],
  ['INTERACCION_ETIQUETA', datos.INTERACCION_ETIQUETA, ['id_interaccion', 'id_etiqueta']],
];
// Para vaciar se va al revés (primero los hijos). USUARIOS_SISTEMA no se toca.
const vaciar = [...plan].reverse().map(p => `DELETE FROM ${p[0]}`);

async function main() {
  const inicio = new Date();
  const sentencias = [];
  for (const [tabla, filas, cols] of plan) sentencias.push({ tabla, sqls: inserts(tabla, filas, cols) });

  if (SIMULAR) {
    const todo = [...vaciar, ...sentencias.flatMap(s => s.sqls)].join(';\n') + ';\n';
    fs.writeFileSync(path.join(__dirname, 'salida', 'carga-simulada.sql'), todo, 'utf8');
    console.log('Simulación lista: salida/carga-simulada.sql (no se tocó la nube).');
    return;
  }

  const { d1Query } = require('./lib/d1');
  const { db } = require('./lib/firestore');
  const { Timestamp } = require('firebase-admin/firestore');

  // ----- D1 -----
  console.log('=== Cloudflare D1 ===');
  for (const q of vaciar) await d1Query(q);
  console.log('Tablas de datos vaciadas (por si era una segunda ejecución).');
  for (const { tabla, sqls } of sentencias) {
    for (const q of sqls) await d1Query(q);
    console.log(`  ✔ ${tabla}: ${plan.find(p => p[0] === tabla)[1].length} filas`);
  }

  // ----- Verificación en D1 -----
  console.log('\nVerificación en D1:');
  let todoBien = true;
  for (const [tabla, filas] of plan) {
    const r = await d1Query(`SELECT COUNT(*) AS n FROM ${tabla}`);
    const ok = r[0].n === filas.length;
    todoBien = todoBien && ok;
    console.log(`  ${ok ? '✔' : '✘'} ${tabla}: esperadas ${filas.length}, en D1 ${r[0].n}`);
  }
  const sinUbic = await d1Query(`SELECT COUNT(*) AS n FROM USUARIOS WHERE consentimiento_datos='no' AND id_ciudad IS NULL AND latitud IS NULL AND longitud IS NULL`);
  const conUbic = await d1Query(`SELECT COUNT(*) AS n FROM USUARIOS WHERE consentimiento_datos='no' AND (id_ciudad IS NOT NULL OR latitud IS NOT NULL OR longitud IS NOT NULL)`);
  console.log(`  Usuarios sin consentimiento y sin ubicación: ${sinUbic[0].n}; con ubicación guardada: ${conUbic[0].n}`);
  const huerf = await d1Query(`SELECT COUNT(*) AS n FROM INTERACCIONES WHERE id_usuario NOT IN (SELECT id_usuario FROM USUARIOS)`);
  console.log(`  Interacciones sin usuario en D1: ${huerf[0].n}`);
  const fk = await d1Query('PRAGMA foreign_key_check');
  console.log(`  Violaciones de llave foránea: ${fk.length}`);
  if (!todoBien || conUbic[0].n !== 0 || huerf[0].n !== 0 || fk.length !== 0) {
    console.error('\n✘ La verificación en D1 falló. No se cargó nada a Firestore.');
    process.exit(1);
  }

  // ----- Firestore -----
  console.log('\n=== Cloud Firestore ===');
  const corridaId = 'corrida_' + inicio.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  // vaciar cuarentena (segunda ejecución)
  const previos = await db.collection('cuarentena').select().get();
  for (let i = 0; i < previos.docs.length; i += 400) {
    const b = db.batch();
    previos.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
    await b.commit();
  }
  if (previos.size) console.log(`Cuarentena anterior borrada (${previos.size} documentos).`);

  const ahora = Timestamp.now();
  const docs = datos.cuarentena;
  for (let i = 0; i < docs.length; i += 400) {
    const b = db.batch();
    for (const q of docs.slice(i, i + 400)) {
      b.set(db.collection('cuarentena').doc(), {
        origen: 'interacciones',
        id_registro: q.id_interaccion,
        id_usuario_ref: q.id_usuario_ref,
        registro_original: q.registro_original,
        errores: [{ codigo: 'USUARIO_INEXISTENTE', campo: 'id_usuario', detalle: `El usuario ${q.id_usuario_ref} no existe en el padrón de usuarios.` }],
        estado: 'en_cuarentena',
        fecha_rechazo: ahora,
        fecha_liberacion: null,
        corrida_id: corridaId,
      });
    }
    await b.commit();
    console.log(`  cuarentena: ${Math.min(i + 400, docs.length)} / ${docs.length}`);
  }

  const r = datos.reporte;
  const nulos =
    datos.USUARIOS.reduce((n, u) => n + (u.id_ciudad === null) + (u.latitud === null) + (u.longitud === null), 0) +
    datos.INTERACCIONES.reduce((n, x) => n + (x.texto === null), 0);
  await db.collection('bitacora_etl').doc(corridaId).set({
    tipo_corrida: 'carga',
    inicio: Timestamp.fromDate(inicio),
    fin: Timestamp.now(),
    archivos: ['comunidad_virtual_usuarios.csv', 'comunidad_virtual_interacciones_1000.csv'],
    recibidos: r.recibidos,
    aceptados: r.aceptados,
    rechazados: { usuarios: r.rechazados.usuarios, interacciones: r.cuarentena + r.rechazados.interacciones },
    transformados: {
      fechas: r.transformados.fechas_convertidas_a_iso,
      nulos,
      atipicos: r.transformados.usuarios_marcados_atipicos,
      anonimizados: r.transformados.usuarios_sin_consentimiento_con_ubicacion_borrada,
    },
    cuadra: r.cuadra,
  });
  console.log(`  bitacora_etl: documento ${corridaId} creado.`);

  // ----- Verificación en Firestore -----
  const nCuar = (await db.collection('cuarentena').count().get()).data().count;
  const bit = (await db.collection('bitacora_etl').doc(corridaId).get()).data();
  console.log('\nVerificación en Firestore:');
  console.log(`  ${nCuar === docs.length ? '✔' : '✘'} cuarentena: esperados ${docs.length}, en Firestore ${nCuar}`);
  console.log(`  ✔ bitacora_etl: recibidos ${JSON.stringify(bit.recibidos)}, aceptados ${JSON.stringify(bit.aceptados)}, rechazados ${JSON.stringify(bit.rechazados)}, cuadra = ${bit.cuadra}`);
  console.log(`\n✔ Carga terminada. Corrida: ${corridaId}`);
}

main().catch(e => { console.error('✘ Error:', e.message); process.exit(1); });
