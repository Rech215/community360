// Conexión a Cloudflare D1 mediante su API REST.
// Las credenciales se leen del archivo .env (nunca se escriben aquí).
require('dotenv').config();

const { CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CF_API_TOKEN } = process.env;
const URL_D1 = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;

// Ejecuta una sentencia SQL (con parámetros ? opcionales) y regresa las filas.
async function d1Query(sql, params = []) {
  const res = await fetch(URL_D1, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const data = await res.json();
  if (!data.success) {
    const msg = (data.errors || []).map(e => e.message).join(' | ') || `HTTP ${res.status}`;
    throw new Error(`D1: ${msg}`);
  }
  return data.result[0].results;
}

module.exports = { d1Query };
