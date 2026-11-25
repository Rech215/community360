// COMMUNITY 360 - Servidor (Express). Fase 3: autenticación y rutas protegidas.
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { verificar, requiereAuthPagina } = require('./lib/auth');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('✘ Falta JWT_SECRET en el .env (mínimo 32 caracteres).');
  process.exit(1);
}

const PRODUCCION = process.env.NODE_ENV === 'production';
const app = express();
app.set('trust proxy', 1);            // Render pone un proxy delante
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      upgradeInsecureRequests: PRODUCCION ? [] : null,
    },
  },
}));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

// ---- API ----
app.get('/api/health', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ---- Páginas ----
app.use('/static', express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect(verificar(req) ? '/app/' : '/login'));
app.get('/login', (req, res) => {
  if (verificar(req)) return res.redirect('/app/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
// Todo lo que está en /private (el dashboard) exige sesión iniciada
app.use('/app', requiereAuthPagina, express.static(path.join(__dirname, 'private'), { index: 'dashboard.html' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

const servidor = http.createServer(app);   // se reutiliza para los WebSockets (Fase 5)
const PUERTO = process.env.PORT || 3000;
servidor.listen(PUERTO, () => console.log(`COMMUNITY 360 escuchando en http://localhost:${PUERTO}`));
