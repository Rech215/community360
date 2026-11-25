const formulario = document.getElementById('formulario');
const usuario = document.getElementById('usuario');
const password = document.getElementById('password');
const mensaje = document.getElementById('mensaje');
const entrar = document.getElementById('entrar');
const ver = document.getElementById('ver');

function mostrar(texto, info = false) {
  mensaje.textContent = texto;
  mensaje.classList.toggle('info', info);
}

ver.addEventListener('click', () => {
  const oculta = password.type === 'password';
  password.type = oculta ? 'text' : 'password';
  ver.textContent = oculta ? 'Ocultar' : 'Ver';
});

formulario.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrar('');
  if (!usuario.value.trim() || !password.value) {
    mostrar('Escribe tu usuario (o correo) y tu contraseña.');
    return;
  }
  entrar.disabled = true;
  entrar.textContent = 'Entrando...';
  // Si el servidor estaba dormido, la primera respuesta tarda; se avisa al usuario.
  const aviso = setTimeout(() => mostrar('Conectando con el servidor, puede tardar un momento...', true), 4000);
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario.value.trim(), password: password.value }),
    });
    const datos = await r.json().catch(() => ({}));
    if (r.ok) {
      window.location.href = '/app/';
      return;
    }
    mostrar(datos.error || 'No se pudo iniciar sesión.');
    password.select();
  } catch {
    mostrar('No hay conexión con el servidor. Inténtalo de nuevo.');
  } finally {
    clearTimeout(aviso);
    entrar.disabled = false;
    entrar.textContent = 'Entrar';
  }
});
