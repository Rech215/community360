// Canal interno de eventos. Las rutas REST avisan aquí cuando cambia una interacción;
// en la Fase 5 los WebSockets escucharán este canal para avisar al dashboard.
const { EventEmitter } = require('events');
module.exports = new EventEmitter();
