// Tokens de sesión (JWT) y filtros de acceso.
const jwt = require('jsonwebtoken');

const COOKIE = 'c360_token';
const DURACION_HORAS = 2;

function firmar(cuenta) {
  return jwt.sign(
    { usuario: cuenta.usuario, rol: cuenta.rol },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', subject: String(cuenta.id_cuenta), expiresIn: `${DURACION_HORAS}h` }
  );
}

// El token puede venir en la cookie (navegador) o en "Authorization: Bearer ..." (Postman)
function leerToken(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim();
  return (req.cookies && req.cookies[COOKIE]) || null;
}

function verificar(req) {
  const t = leerToken(req);
  if (!t) return null;
  try {
    const p = jwt.verify(t, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return { id_cuenta: Number(p.sub), usuario: p.usuario, rol: p.rol };
  } catch {
    return null;
  }
}

function requiereAuth(req, res, next) {
  const u = verificar(req);
  if (!u) return res.status(401).json({ error: 'No autenticado' });
  req.usuario = u;
  next();
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) return res.status(403).json({ error: 'No tienes permiso para esta operación' });
    next();
  };
}

function requiereAuthPagina(req, res, next) {
  const u = verificar(req);
  if (!u) return res.redirect('/login');
  req.usuario = u;
  next();
}

const opcionesCookie = () => ({
  httpOnly: true,                                  // el JavaScript de la página no puede leerla
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',   // solo por HTTPS cuando está desplegado
  maxAge: DURACION_HORAS * 3600 * 1000,
  path: '/',
});

module.exports = { COOKIE, firmar, verificar, requiereAuth, requiereRol, requiereAuthPagina, opcionesCookie };
