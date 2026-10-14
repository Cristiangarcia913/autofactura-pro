import './lib/env.js'; // debe ir el primero: carga el .env
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UPLOAD_DIR, actualizar, borrar, buscarPorHash, insertar, listar, obtener, paraExcel, resumen } from './lib/db.js';
import { extraerFactura, mimeValido } from './lib/extract.js';
import { generarExcel } from './lib/excel.js';
import { CATEGORIAS } from './lib/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message });
});

// multer interpreta los nombres de archivo como latin1; los pasamos a UTF-8 (tildes, ñ...)
const nombreUtf8 = (n) => Buffer.from(n, 'latin1').toString('utf8');

app.get('/api/config', (_req, res) => {
  res.json({
    categorias: CATEGORIAS,
    mock: process.env.MOCK_AI === '1',
    tieneClave: Boolean(process.env.ANTHROPIC_API_KEY),
    tieneNif: Boolean(process.env.USER_NIF),
    modelo: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  });
});

// Recibe UN archivo, lo lee con la IA y lo guarda. El frontend sube varios en paralelo.
app.post('/api/upload', upload.single('archivo'), wrap(async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  const nombre = nombreUtf8(f.originalname);
  const mime = mimeValido(nombre, f.mimetype);
  if (!mime) {
    return res.status(415).json({ error: 'Formato no admitido. Usa PDF, JPG, PNG o WEBP (las fotos HEIC del iPhone hay que convertirlas a JPG).' });
  }
  const hash = crypto.createHash('sha256').update(f.buffer).digest('hex');
  const previo = buscarPorHash(hash);
  if (previo) {
    return res.status(409).json({ error: `Este archivo ya estaba subido (documento #${previo.id}); no se procesa de nuevo.` });
  }
  try {
    const doc = await extraerFactura({ buffer: f.buffer, mime, nombre });
    const ruta = `${hash.slice(0, 24)}${path.extname(nombre).toLowerCase() || ''}`;
    await fs.writeFile(path.join(UPLOAD_DIR, ruta), f.buffer);
    const guardado = insertar({ ...doc, archivo_nombre: nombre, archivo_ruta: ruta, archivo_mime: mime, archivo_hash: hash });
    res.json({ ok: true, documento: guardado });
  } catch (e) {
    console.error(`Error con ${nombre}:`, e.message);
    res.status(422).json({ error: `No se pudo procesar "${nombre}": ${e.message}` });
  }
}));

app.get('/api/documentos', wrap((req, res) => {
  const { anio, trimestre, flujo, categoria, estado, q } = req.query;
  res.json(listar({ anio, trimestre, flujo, categoria, estado, q }));
}));

const EDITABLES = new Set([
  'flujo', 'tipo_documento', 'fecha_emision', 'numero_factura', 'entidad_nombre', 'entidad_nif', 'categoria',
  'base_21', 'cuota_21', 'base_10', 'cuota_10', 'base_4', 'cuota_4', 'base_exenta',
  'irpf_pct', 'irpf_cuota', 'recargo_pct', 'recargo_cuota', 'importe_total', 'revisado',
]);

app.patch('/api/documentos/:id', wrap((req, res) => {
  const id = Number(req.params.id);
  const patch = {};
  for (const [k, v] of Object.entries(req.body || {})) if (EDITABLES.has(k)) patch[k] = v;
  const doc = actualizar(id, patch);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  res.json(doc);
}));

app.delete('/api/documentos/:id', wrap((req, res) => {
  if (!borrar(Number(req.params.id))) return res.status(404).json({ error: 'Documento no encontrado' });
  res.json({ ok: true });
}));

app.get('/api/resumen', wrap((req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  res.json(resumen(anio, req.query.trimestre || null));
}));

app.get('/files/:id', wrap(async (req, res) => {
  const d = obtener(Number(req.params.id));
  if (!d || !d.archivo_ruta) return res.status(404).send('No encontrado');
  res.type(d.archivo_mime || 'application/octet-stream');
  res.sendFile(path.join(UPLOAD_DIR, d.archivo_ruta));
}));

app.get('/api/export', wrap(async (req, res) => {
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const datos = paraExcel(anio);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const buf = await generarExcel({ anio, ...datos, baseUrl });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="AutoFactura_${anio}.xlsx"`);
  res.send(Buffer.from(buf));
}));

// Errores de multer (archivo demasiado grande, etc.)
app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera los 20 MB' : err.message });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`AutoFactura Pro en http://localhost:${PORT}`);
  if (process.env.MOCK_AI === '1') console.log('  · MODO DEMO: no se llama a la IA, se usan datos de ejemplo');
  else if (!process.env.ANTHROPIC_API_KEY) console.log('  · ATENCIÓN: falta ANTHROPIC_API_KEY en .env');
  if (!process.env.USER_NIF) console.log('  · Aviso: sin USER_NIF todos los documentos se clasifican como Gasto');
});
