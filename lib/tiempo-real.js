// Tiempo real (Fase 5). El servidor avisa por WebSockets cada vez que una interacción
// se crea, se modifica o se elimina desde la API REST (por ejemplo, desde Postman).
// El dashboard solo escucha: no puede mandar ni cambiar nada por este canal.
const { Server } = require('socket.io');

const VIDA_MAX_MS = 2 * 60 * 60 * 1000; // igual que la sesión (2 h); después el navegador reconecta

// Solo se publican los campos que el panel necesita (sin el texto del mensaje).
function publica(i) {
  if (!i) return {};
  return {
    id_interaccion: i.id_interaccion,
    id_usuario: i.id_usuario,
    fecha_hora: i.fecha_hora,
    plataforma: i.plataforma,
    tipo: i.tipo,
    tema: i.tema,
    sentimiento: i.sentimiento,
    dispositivo: i.dispositivo,
  };
}

function leerCookies(cabecera) {
  const salida = {};
  String(cabecera || '').split(';').forEach(par => {
    const i = par.indexOf('=');
    if (i > 0) salida[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  });
  return salida;
}

function iniciar(servidor, { verificar, eventos }) {
  const io = new Server(servidor, {
    serveClient: true,                 // sirve /socket.io/socket.io.js desde el mismo dominio
    cors: { origin: false },           // nada de otros sitios
    // Evita que otra página abra un WebSocket usando la cookie de sesión de quien la visita
    allowRequest: (req, cb) => {
      const origen = req.headers.origin;
      if (!origen) return cb(null, true);          // clientes que no son navegador (siguen necesitando token)
      try { cb(null, new URL(origen).host === req.headers.host); } catch { cb(null, false); }
    },
  });

  // Solo entra quien tenga sesión válida (cookie del navegador o token Bearer)
  io.use((socket, next) => {
    const h = socket.handshake;
    const token = (h.auth && h.auth.token) || null;
    const falsaPeticion = {
      headers: { ...h.headers, ...(token ? { authorization: 'Bearer ' + token } : {}) },
      cookies: leerCookies(h.headers.cookie),
      get(nombre) { return this.headers[String(nombre).toLowerCase()]; },
    };
    let sesion = null;
    try { sesion = verificar(falsaPeticion); } catch { sesion = null; }
    if (!sesion) return next(new Error('No autenticado'));
    socket.data.sesion = sesion;
    next();
  });

  io.on('connection', socket => {
    const quien = (socket.data.sesion && socket.data.sesion.usuario) || 'cuenta';
    console.log(`[WS] conectado: ${quien} (${io.engine.clientsCount} activos)`);
    const caduca = setTimeout(() => socket.disconnect(true), VIDA_MAX_MS);
    socket.on('disconnect', () => clearTimeout(caduca));
    // No se registra ningún evento de entrada: el cliente no puede enviar datos al servidor.
  });

  const reenviar = (evento, accion) => eventos.on(evento, datos => {
    io.emit('interaccion', { accion, interaccion: publica(datos), hora: new Date().toISOString() });
  });
  reenviar('interaccion:creada', 'creada');
  reenviar('interaccion:modificada', 'modificada');
  reenviar('interaccion:eliminada', 'eliminada');

  return io;
}

module.exports = { iniciar, publica, leerCookies };
