// API REST de métricas para el dashboard. Solo lectura; todas las rutas exigen sesión.
const express = require('express');
const { d1Query } = require('../lib/d1');
const { crearMetricas } = require('../lib/metricas');
const { requiereAuth } = require('../lib/auth');

const router = express.Router();
const metricas = crearMetricas(d1Query);

router.use('/metricas', requiereAuth);
router.use('/metricas', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });   // siempre datos frescos

const servir = fn => async (req, res) => {
  try {
    res.json(await fn());
  } catch (e) {
    console.error(`[API] GET ${req.originalUrl}:`, e.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

router.get('/metricas/resumen', servir(metricas.resumen));        // los 4 indicadores de la franja superior
router.get('/metricas/actividad', servir(metricas.actividad));    // actividad diaria, tipos, plataformas y mapa de calor
router.get('/metricas/comunidad', servir(metricas.comunidad));    // especies, intereses, edades, eventos y comisiones
router.get('/metricas/animo', servir(metricas.animo));            // serie del ánimo (promedio móvil)
router.get('/metricas/riesgo', servir(metricas.riesgo));          // miembros con mayor riesgo de abandono (IRA)

module.exports = router;
