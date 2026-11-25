// Crea las 12 tablas de COMMUNITY 360 en Cloudflare D1.
// Ejecutar: node crear-tablas.js
const fs = require('fs');
const path = require('path');
const { d1Query } = require('./lib/d1');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8');
  const sentencias = sql.split(/^--\s*$/m).map(s => s.trim()).filter(Boolean);

  console.log(`Creando ${sentencias.length} tablas...\n`);
  for (const s of sentencias) {
    const nombre = s.match(/EXISTS\s+(\w+)/)[1];
    await d1Query(s);
    console.log(`  ✔ ${nombre}`);
  }

  const tablas = await d1Query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name"
  );
  console.log(`\nTablas en D1 ahora: ${tablas.length}`);
  tablas.forEach(t => console.log('  - ' + t.name));
}

main().catch(e => { console.error('✘ Error:', e.message); process.exit(1); });
