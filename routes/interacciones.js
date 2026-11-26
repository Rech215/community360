// API REST de interacciones, catálogos y usuarios. Todas las rutas exigen sesión.
const express = require('express');
const { d1Query } = require('../lib/d1');
const { crearServicio, ErrorHttp } = require('../lib/interacciones');
const { requiereAuth, requiereRol } = require('../lib/auth');
const eventos = require('../lib/eventos');

const router = express.Router();
const servicio = crearServicio(d1Query);

router.use(requiereAuth);

// Convierte los errores de validación en respuestas HTTP; los demás se registran y salen como 500 genérico
const manejar = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof ErrorHttp) {
      return res.status(e.estado).json({ error: e.message, ...(e.detalles ? { detalles: e.detalles } : {}) });
    }
    console.error(`[API] ${req.method} ${req.originalUrl}:`, e.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// ---- Consulta (cualquier cuenta con sesión) ----
router.get('/catalogos', manejar(async (req, res) => res.json(await servicio.catalogos())));
router.get('/usuarios', manejar(async (req, res) => res.json(await servicio.usuarios(req.query))));
router.get('/interacciones', manejar(async (req, res) => res.json(await servicio.listar(req.query))));
router.get('/interacciones/:id', manejar(async (req, res) => res.json(await servicio.obtener(req.params.id))));

// ---- Administración ----
router.post('/interacciones', requiereRol('admin', 'moderador'), manejar(async (req, res) => {
  const nueva = await servicio.crear(req.body);
  eventos.emit('interaccion:creada', nueva);
  res.status(201).location(`/api/interacciones/${nueva.id_interaccion}`).json(nueva);
}));

router.put('/interacciones/:id', requiereRol('admin', 'moderador'), manejar(async (req, res) => {
  const modificada = await servicio.actualizar(req.params.id, req.body);
  eventos.emit('interaccion:modificada', modificada);
  res.json(modificada);
}));

router.delete('/interacciones/:id', requiereRol('admin'), manejar(async (req, res) => {
  const borrada = await servicio.eliminar(req.params.id);
  eventos.emit('interaccion:eliminada', borrada);
  res.json({ eliminada: borrada.id_interaccion });
}));

module.exports = router;
