// Prueba de conexión a las dos bases de datos de COMMUNITY 360.
// Uso: node test-conexion.js
const { d1Query } = require('./lib/d1');
const { db } = require('./lib/firestore');

async function probarD1() {
  const filas = await d1Query("SELECT datetime('now') AS hora_servidor");
  console.log('✔ Cloudflare D1 conectado');
  console.log(`   Hora del servidor (UTC): ${filas[0].hora_servidor}`);
  const tablas = await d1Query("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'");
  console.log(`   Tablas creadas por el usuario: ${tablas[0].total}`);
}

async function probarFirestore() {
  // Escribe un documento de prueba, lo lee y lo borra.
  const ref = db.collection('_prueba_conexion').doc('ping');
  await ref.set({ mensaje: 'hola desde COMMUNITY 360', fecha: new Date() });
  const doc = await ref.get();
  await ref.delete();
  console.log('✔ Cloud Firestore conectado');
  console.log(`   Escritura y lectura correctas: "${doc.data().mensaje}" (documento de prueba eliminado)`);
}

(async () => {
  console.log('Probando conexiones...\n');
  try { await probarD1(); } catch (e) { console.error('✘ Error en D1:', e.message); }
  console.log('');
  try { await probarFirestore(); } catch (e) { console.error('✘ Error en Firestore:', e.message); }
})();
