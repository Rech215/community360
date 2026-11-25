// Inicio de sesión, cierre de sesión y consulta de la sesión actual.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { d1Query } = require('../lib/d1');
const { COOKIE, firmar, requiereAuth, opcionesCookie } = require('../lib/auth');

const router = express.Router();

// Hash de relleno: se compara aunque el usuario no exista, para que el tiempo de
// respuesta no revele si una cuenta existe o no.
const HASH_RELLENO = bcrypt.hashSync('relleno-sin-uso', 12);

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,       // solo cuentan los intentos fallidos
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' },
});

// POST /api/auth/login   { "usuario": "lizandro.reyes" | "correo", "password": "..." }
router.post('/login', limitador, async (req, res) => {
  const { usuario, password } = req.body || {};
  if (typeof usuario !== 'string' || typeof password !== 'string' ||
      !usuario.trim() || !password || usuario.length > 120 || password.length > 200) {
    return res.status(400).json({ error: 'Escribe tu usuario (o correo) y tu contraseña' });
  }
  try {
    const id = usuario.trim().toLowerCase();
    const filas = await d1Query(
      'SELECT id_cuenta, usuario, correo, password_hash, rol FROM USUARIOS_SISTEMA WHERE usuario = ? OR correo = ? LIMIT 1',
      [id, id]
    );
    const cuenta = filas[0];
    const ok = await bcrypt.compare(password, cuenta ? cuenta.password_hash : HASH_RELLENO);
    if (!cuenta || !ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const token = firmar(cuenta);
    res.cookie(COOKIE, token, opcionesCookie());
    // El token también se devuelve en el cuerpo para poder usarlo desde Postman.
    res.json({ usuario: cuenta.usuario, rol: cuenta.rol, token });
  } catch (e) {
    console.error('Error en login:', e.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión. Inténtalo de nuevo.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { ...opcionesCookie(), maxAge: undefined });
  res.json({ ok: true });
});

// GET /api/auth/me   (protegido)
router.get('/me', requiereAuth, (req, res) => res.json(req.usuario));

module.exports = router;
