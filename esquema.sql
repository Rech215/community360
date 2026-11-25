CREATE TABLE IF NOT EXISTS PAISES (
  id_pais INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
) STRICT;
--
CREATE TABLE IF NOT EXISTS ESTADOS (
  id_estado INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  id_pais INTEGER NOT NULL REFERENCES PAISES(id_pais)
) STRICT;
--
CREATE TABLE IF NOT EXISTS CIUDADES (
  id_ciudad INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  id_estado INTEGER NOT NULL REFERENCES ESTADOS(id_estado),
  zona_horaria TEXT NOT NULL
) STRICT;
--
CREATE TABLE IF NOT EXISTS ESPECIES_FURSONA (
  id_especie INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
) STRICT;
--
CREATE TABLE IF NOT EXISTS INTERESES (
  id_interes INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
) STRICT;
--
CREATE TABLE IF NOT EXISTS PLATAFORMAS (
  id_plataforma INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
) STRICT;
--
CREATE TABLE IF NOT EXISTS TEMAS (
  id_tema INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
) STRICT;
--
CREATE TABLE IF NOT EXISTS ETIQUETAS (
  id_etiqueta INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
) STRICT;
--
CREATE TABLE IF NOT EXISTS USUARIOS (
  id_usuario TEXT PRIMARY KEY CHECK (id_usuario GLOB 'U[0-9][0-9][0-9][0-9][0-9][0-9]'),
  alias TEXT NOT NULL UNIQUE,
  fecha_ingreso TEXT NOT NULL CHECK (fecha_ingreso GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  id_ciudad INTEGER REFERENCES CIUDADES(id_ciudad),
  latitud REAL CHECK (latitud BETWEEN -90 AND 90),
  longitud REAL CHECK (longitud BETWEEN -180 AND 180),
  rango_edad TEXT NOT NULL CHECK (rango_edad IN ('18-24','25-31','32-38','39+')),
  id_especie INTEGER NOT NULL REFERENCES ESPECIES_FURSONA(id_especie),
  id_interes INTEGER NOT NULL REFERENCES INTERESES(id_interes),
  id_plataforma INTEGER NOT NULL REFERENCES PLATAFORMAS(id_plataforma),
  es_artista INTEGER NOT NULL CHECK (es_artista IN (0,1)),
  mensajes_30d INTEGER NOT NULL CHECK (mensajes_30d >= 0),
  reacciones_30d INTEGER NOT NULL CHECK (reacciones_30d >= 0),
  eventos_asistidos INTEGER NOT NULL CHECK (eventos_asistidos >= 0),
  comisiones_compradas INTEGER NOT NULL CHECK (comisiones_compradas >= 0),
  sentimiento_promedio REAL NOT NULL CHECK (sentimiento_promedio BETWEEN -1 AND 1),
  ultima_actividad TEXT NOT NULL CHECK (ultima_actividad GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' AND ultima_actividad >= fecha_ingreso),
  estatus TEXT NOT NULL CHECK (estatus IN ('activo','en_riesgo','inactivo')),
  consentimiento_datos TEXT NOT NULL CHECK (consentimiento_datos IN ('si','no')),
  es_atipico INTEGER NOT NULL DEFAULT 0 CHECK (es_atipico IN (0,1))
) STRICT;
--
CREATE TABLE IF NOT EXISTS INTERACCIONES (
  id_interaccion TEXT PRIMARY KEY CHECK (id_interaccion GLOB 'I[0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  id_usuario TEXT NOT NULL REFERENCES USUARIOS(id_usuario),
  fecha_hora TEXT NOT NULL CHECK (fecha_hora GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*'),
  id_plataforma INTEGER NOT NULL REFERENCES PLATAFORMAS(id_plataforma),
  tipo TEXT NOT NULL CHECK (tipo IN ('mensaje','comentario','reaccion','respuesta_encuesta','rsvp_evento')),
  texto TEXT CHECK (texto IS NOT NULL OR tipo = 'reaccion'),
  id_tema INTEGER NOT NULL REFERENCES TEMAS(id_tema),
  sentimiento REAL NOT NULL CHECK (sentimiento BETWEEN -1 AND 1),
  dispositivo TEXT NOT NULL CHECK (dispositivo IN ('Android','iOS','Web','Escritorio')),
  longitud_texto INTEGER NOT NULL CHECK (longitud_texto >= 0),
  reacciones_recibidas INTEGER NOT NULL CHECK (reacciones_recibidas >= 0)
) STRICT;
--
CREATE TABLE IF NOT EXISTS INTERACCION_ETIQUETA (
  id_interaccion TEXT NOT NULL REFERENCES INTERACCIONES(id_interaccion) ON DELETE CASCADE,
  id_etiqueta INTEGER NOT NULL REFERENCES ETIQUETAS(id_etiqueta),
  PRIMARY KEY (id_interaccion, id_etiqueta)
) STRICT;
--
CREATE TABLE IF NOT EXISTS USUARIOS_SISTEMA (
  id_cuenta INTEGER PRIMARY KEY AUTOINCREMENT,
  correo TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','moderador')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
