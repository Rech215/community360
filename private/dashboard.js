const quien = document.getElementById('quien');
const respuesta = document.getElementById('respuesta');

async function cargarSesion() {
  try {
    const r = await fetch('/api/auth/me');
    if (r.status === 401) { window.location.href = '/login'; return; }
    const datos = await r.json();
    quien.textContent = `${datos.usuario} (${datos.rol})`;
    respuesta.textContent = `HTTP ${r.status}\n` + JSON.stringify(datos, null, 2);
  } catch {
    respuesta.textContent = 'No se pudo consultar la sesión.';
  }
}

document.getElementById('salir').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/login'; }
});

cargarSesion();
