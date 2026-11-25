// Conexión a Cloud Firestore con la cuenta de servicio (archivo JSON local).
require('dotenv').config();
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const rutaLlave = path.resolve(process.env.FIREBASE_KEY_PATH || './firebase-key.json');
initializeApp({ credential: cert(require(rutaLlave)) });

const db = getFirestore();
db.settings({ preferRest: true });
module.exports = { db };
