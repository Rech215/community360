// COMMUNITY 360 - Fase 3 - Cuentas del sistema (login)
// Agrega la columna "usuario" a USUARIOS_SISTEMA si falta y crea las cuentas
// del docente y del administrador. Solo se guarda el hash bcrypt de cada contraseña.
//
// Variables que lee del .env (las contraseñas nunca van escritas en el código):
//   DOCENTE_PASSWORD   contraseña de lizandro.reyes
//   ADMIN_USUARIO      tu usuario            (por defecto hemir.pech)
//   ADMIN_CORREO       tu correo
//   ADMIN_PASSWORD     tu contraseña
//
// Ejecutar: node crear-usuarios.js
const bcrypt = require('bcryptjs');
const { d1Query } = require('./lib/d1');

const COSTO = 12; // iteraciones de bcrypt (2^12)

function falta(nombre) {
  console.error(`✘ Falta la variable ${nombre} en el archivo .env`);
  process.exit(1);
}

async function asegurarColumnaUsuario() {
  const cols = await d1Query('PRAGMA table_info(USUARIOS_SISTEMA)');
  if (!cols.some(c => c.name === 'usuario')) {
    await d1Query('ALTER TABLE USUARIOS_SISTEMA ADD COLUMN usuario TEXT');
    console.log('  ✔ Columna "usuario" agregada a USUARIOS_SISTEMA');
  } else {
    console.log('  ✔ La columna "usuario" ya existía');
  }
  await d1Query('CREATE UNIQUE INDEX IF NOT EXISTS ux_sistema_usuario ON USUARIOS_SISTEMA(usuario)');
}

async function guardarCuenta({ usuario, correo, password, rol }) {
  if (!password || password.length < 8) throw new Error(`La contraseña de ${usuario} debe tener al menos 8 caracteres`);
  const hash = bcrypt.hashSync(password, COSTO);
  await d1Query(
    `INSERT INTO USUARIOS_SISTEMA (usuario, correo, password_hash, rol) VALUES (?, ?, ?, ?)
     ON CONFLICT(correo) DO UPDATE SET usuario = excluded.usuario, password_hash = excluded.password_hash, rol = excluded.rol`,
    [usuario.toLowerCase(), correo.toLowerCase(), hash, rol]
  );
  return hash;
}

async function main() {
  const docentePass = process.env.DOCENTE_PASSWORD || falta('DOCENTE_PASSWORD');
  const adminPass = process.env.ADMIN_PASSWORD || falta('ADMIN_PASSWORD');
  const adminCorreo = process.env.ADMIN_CORREO || falta('ADMIN_CORREO');
  const adminUsuario = process.env.ADMIN_USUARIO || 'hemir.pech';

  console.log('Preparando USUARIOS_SISTEMA...');
  await asegurarColumnaUsuario();

  const cuentas = [
    { usuario: 'lizandro.reyes', correo: 'lizandro.reyes@utmetropolitana.edu.mx', password: docentePass, rol: 'admin' },
    { usuario: adminUsuario, correo: adminCorreo, password: adminPass, rol: 'admin' },
  ];

  console.log('\nCreando cuentas...');
  for (const c of cuentas) {
    await guardarCuenta(c);
    console.log(`  ✔ ${c.usuario} (${c.rol})`);
  }

  console.log('\nContenido de USUARIOS_SISTEMA (solo el inicio del hash):');
  const filas = await d1Query('SELECT id_cuenta, usuario, correo, rol, substr(password_hash, 1, 10) AS inicio_hash, length(password_hash) AS largo_hash FROM USUARIOS_SISTEMA ORDER BY id_cuenta');
  console.table(filas);

  console.log('Verificación de hashes:');
  let todoBien = true;
  for (const c of cuentas) {
    const r = await d1Query('SELECT password_hash FROM USUARIOS_SISTEMA WHERE correo = ?', [c.correo.toLowerCase()]);
    const ok = r.length === 1 && bcrypt.compareSync(c.password, r[0].password_hash) && r[0].password_hash !== c.password;
    todoBien = todoBien && ok;
    console.log(`  ${ok ? '✔' : '✘'} ${c.usuario}: el hash corresponde a la contraseña y no es texto plano`);
  }
  console.log(todoBien ? '\n✔ todo verificado' : '\n✘ revisar las cuentas');
  if (!todoBien) process.exit(1);
}

main().catch(e => { console.error('✘ Error:', e.message); process.exit(1); });
