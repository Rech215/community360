// DATOS DE EJEMPLO: solo sirven para ver el diseño. En la Fase 6 se reemplazan
// por la información real que entrega la API REST desde la base de datos en la nube.
window.DATOS_EJEMPLO = (() => {
  let semilla = 11;
  const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hoy = new Date();

  const fechas = [];
  const interacciones = [];
  const sentimiento = [];
  for (let i = 0; i < 30; i++) {
    const f = new Date(hoy); f.setDate(hoy.getDate() - (29 - i));
    fechas.push(`${f.getDate()} ${MESES[f.getMonth()]}`);
    const finde = f.getDay() === 0 || f.getDay() === 6;
    interacciones.push(Math.round(34 + i * 0.5 + (finde ? 12 : 0) + azar() * 14));
    const bache = Math.exp(-Math.pow((i - 20) / 2.6, 2)) * 0.55;
    sentimiento.push(+(0.2 + 0.08 * Math.sin(i / 4) - bache + (azar() - 0.5) * 0.04).toFixed(2));
  }

  const calor = [];
  for (let d = 0; d < 7; d++) {
    const fila = [];
    for (let b = 0; b < 12; b++) {
      const pico = Math.exp(-Math.pow((b - 9.5) / 2.4, 2));
      const dia = d >= 5 ? 1.35 : 1;
      fila.push(Math.round((3 + pico * 30 * dia + azar() * 5)));
    }
    calor.push(fila);
  }

  return {
    fechas, interacciones, sentimiento, calor,
    especies: [
      { nombre: 'Lobo', valor: 168 }, { nombre: 'Zorro', valor: 151 }, { nombre: 'Perro', valor: 119 },
      { nombre: 'Dragón', valor: 104 }, { nombre: 'Gato', valor: 97 }, { nombre: 'Tigre', valor: 72 },
    ],
    intereses: [
      { nombre: 'Arte digital', valor: 212 }, { nombre: 'Videojuegos', valor: 187 }, { nombre: 'Música', valor: 143 },
      { nombre: 'Cosplay', valor: 118 }, { nombre: 'Convenciones', valor: 96 }, { nombre: 'Escritura', valor: 71 },
    ],
    edades: [
      { nombre: '18–24 años', valor: 438 }, { nombre: '25–31 años', valor: 352 },
      { nombre: '32–38 años', valor: 182 }, { nombre: '39 o más', valor: 96 },
    ],
    eventosHist: [
      { nombre: '0', valor: 310 }, { nombre: '1', valor: 262 }, { nombre: '2', valor: 198 },
      { nombre: '3', valor: 126 }, { nombre: '4', valor: 74 }, { nombre: '5+', valor: 98 },
    ],
    artistas: { total: 214, usuarios: 1068, comisiones: 538, eventosPromedio: 2.4 },
    topArtistas: [
      { nombre: 'kitsu_art', valor: 34 }, { nombre: 'tinta_roja', valor: 29 }, { nombre: 'luna_gris', valor: 24 },
      { nombre: 'zorro_dev', valor: 19 }, { nombre: 'nube_azul', valor: 15 },
    ],
    dias: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
    bloques: ['0–2', '2–4', '4–6', '6–8', '8–10', '10–12', '12–14', '14–16', '16–18', '18–20', '20–22', '22–24'],
    indicadores: {
      interacciones: { valor: 1284, delta: 8.4, buenoSiSube: true, serie: [31, 33, 30, 36, 38, 35, 40, 42, 41, 44, 43, 47] },
      usuarios: { valor: 642, delta: 3.1, buenoSiSube: true, serie: [610, 612, 615, 614, 620, 624, 626, 630, 633, 636, 640, 642] },
      sentimiento: { valor: 0.18, delta: -0.04, buenoSiSube: true, serie: [0.24, 0.23, 0.25, 0.22, 0.2, 0.21, 0.19, 0.2, 0.18, 0.17, 0.19, 0.18] },
      riesgo: { valor: 37, delta: 5, buenoSiSube: false, serie: [26, 27, 27, 29, 30, 30, 32, 33, 34, 34, 36, 37] },
    },
    tipos: [
      { nombre: 'Mensaje', valor: 412 }, { nombre: 'Comentario', valor: 318 }, { nombre: 'Reacción', valor: 296 },
      { nombre: 'Respuesta de encuesta', valor: 141 }, { nombre: 'RSVP a evento', valor: 117 },
    ],
    plataformas: [
      { nombre: 'Discord', valor: 402 }, { nombre: 'Telegram', valor: 288 }, { nombre: 'Twitter/X', valor: 231 },
      { nombre: 'Bluesky', valor: 166 }, { nombre: 'FurAffinity', valor: 121 }, { nombre: 'Instagram', valor: 76 },
    ],
    riesgo: [
      { id: 'U000412', alias: 'luna_gris', ira: 86, ultima: 'hace 41 días', estatus: 'inactivo' },
      { id: 'U000087', alias: 'kitsu_art', ira: 79, ultima: 'hace 36 días', estatus: 'en_riesgo' },
      { id: 'U000530', alias: 'rafa.wolf', ira: 73, ultima: 'hace 33 días', estatus: 'en_riesgo' },
      { id: 'U000219', alias: 'nube_azul', ira: 64, ultima: 'hace 27 días', estatus: 'en_riesgo' },
      { id: 'U000901', alias: 'tinta_roja', ira: 58, ultima: 'hace 24 días', estatus: 'en_riesgo' },
      { id: 'U000144', alias: 'zorro_dev', ira: 47, ultima: 'hace 19 días', estatus: 'en_riesgo' },
    ],
    vivo: [
      { hora: '14:32:08', alias: 'luna_gris', tipo: 'Comentario', plataforma: 'Discord', sentimiento: 0.62 },
      { hora: '14:31:40', alias: 'kitsu_art', tipo: 'Reacción', plataforma: 'Telegram', sentimiento: 0.35 },
      { hora: '14:30:12', alias: 'nube_azul', tipo: 'Mensaje', plataforma: 'Discord', sentimiento: -0.41 },
      { hora: '14:28:57', alias: 'rafa.wolf', tipo: 'RSVP a evento', plataforma: 'Bluesky', sentimiento: 0.8 },
      { hora: '14:27:03', alias: 'tinta_roja', tipo: 'Mensaje', plataforma: 'Twitter/X', sentimiento: 0.1 },
      { hora: '14:25:44', alias: 'zorro_dev', tipo: 'Respuesta de encuesta', plataforma: 'Telegram', sentimiento: -0.12 },
    ],
  };
})();
