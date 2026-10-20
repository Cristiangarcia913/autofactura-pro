// Base de datos SQLite con el módulo integrado de Node (node:sqlite): sin compilar nada.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { recalcular } from './validate.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'archivos');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'autofactura.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS documentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  creado_en       TEXT DEFAULT CURRENT_TIMESTAMP,
  archivo_nombre  TEXT,
  archivo_ruta    TEXT,
  archivo_mime    TEXT,
  archivo_hash    TEXT,
  flujo           TEXT NOT NULL DEFAULT 'Gasto' CHECK (flujo IN ('Gasto','Ingreso')),
  tipo_documento  TEXT,
  fecha_emision   TEXT,
  anio            INTEGER,
  trimestre       TEXT,
  numero_factura  TEXT,
  entidad_nombre  TEXT,
  entidad_nif     TEXT,
  categoria       TEXT,
  base_21 REAL DEFAULT 0, cuota_21 REAL DEFAULT 0,
  base_10 REAL DEFAULT 0, cuota_10 REAL DEFAULT 0,
  base_4  REAL DEFAULT 0, cuota_4  REAL DEFAULT 0,
  base_exenta   REAL DEFAULT 0,
  irpf_pct      REAL DEFAULT 0, irpf_cuota    REAL DEFAULT 0,
  recargo_pct   REAL DEFAULT 0, recargo_cuota REAL DEFAULT 0,
  total_base    REAL DEFAULT 0, total_iva     REAL DEFAULT 0,
  importe_total REAL DEFAULT 0,
  confianza     REAL,
  observaciones TEXT,
  cuadra        INTEGER DEFAULT 1,
  duplicado_de  INTEGER,
  problemas     TEXT DEFAULT '[]',
  estado        TEXT DEFAULT 'Requiere revisión',
  revisado      INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_doc_periodo ON documentos (anio, trimestre, flujo);
CREATE INDEX IF NOT EXISTS idx_doc_hash    ON documentos (archivo_hash);
CREATE INDEX IF NOT EXISTS idx_doc_nif     ON documentos (entidad_nif, fecha_emision, importe_total);
`);

const COLS = [
  'archivo_nombre', 'archivo_ruta', 'archivo_mime', 'archivo_hash', 'flujo', 'tipo_documento',
  'fecha_emision', 'anio', 'trimestre', 'numero_factura', 'entidad_nombre', 'entidad_nif', 'categoria',
  'base_21', 'cuota_21', 'base_10', 'cuota_10', 'base_4', 'cuota_4', 'base_exenta',
  'irpf_pct', 'irpf_cuota', 'recargo_pct', 'recargo_cuota', 'total_base', 'total_iva', 'importe_total',
  'confianza', 'observaciones', 'cuadra', 'duplicado_de', 'problemas', 'estado', 'revisado',
];

const parse = (r) => (r ? { ...r, problemas: JSON.parse(r.problemas || '[]') } : null);

export function obtener(id) {
  return parse(db.prepare('SELECT * FROM documentos WHERE id = ?').get(id));
}

export function buscarPorHash(hash) {
  return parse(db.prepare('SELECT * FROM documentos WHERE archivo_hash = ? ORDER BY id LIMIT 1').get(hash));
}

/** Busca un documento ANTERIOR (id menor) que parezca el mismo. */
function buscarDuplicado(o, idActual) {
  const conds = [];
  const vals = [];
  if (o.archivo_hash) {
    conds.push('archivo_hash = ?');
    vals.push(o.archivo_hash);
  }
  if (o.entidad_nif && o.fecha_emision && o.importe_total) {
    conds.push('(entidad_nif = ? AND fecha_emision = ? AND importe_total = ?)');
    vals.push(o.entidad_nif, o.fecha_emision, o.importe_total);
  }
  if (o.entidad_nif && o.numero_factura) {
    conds.push('(entidad_nif = ? AND numero_factura = ?)');
    vals.push(o.entidad_nif, o.numero_factura);
  }
  if (!o.entidad_nif && o.entidad_nombre && o.fecha_emision && o.importe_total) {
    conds.push('(entidad_nif IS NULL AND lower(entidad_nombre) = ? AND fecha_emision = ? AND importe_total = ?)');
    vals.push(o.entidad_nombre.toLowerCase(), o.fecha_emision, o.importe_total);
  }
  if (!conds.length) return null;
  const r = db
    .prepare(`SELECT id FROM documentos WHERE id < ? AND (${conds.join(' OR ')}) ORDER BY id LIMIT 1`)
    .get(idActual, ...vals);
  return r ? r.id : null;
}

function preparar(d, idActual) {
  const base = recalcular({ ...d, duplicado_de: null });
  return recalcular({ ...d, duplicado_de: buscarDuplicado(base, idActual) });
}

export function insertar(d) {
  const o = preparar(d, Number.MAX_SAFE_INTEGER);
  const r = db
    .prepare(`INSERT INTO documentos (${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})`)
    .run(...COLS.map((c) => o[c] ?? null));
  return obtener(Number(r.lastInsertRowid));
}

export function actualizar(id, patch) {
  const cur = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!cur) return null;
  const o = preparar({ ...cur, ...patch }, id);
  db.prepare(`UPDATE documentos SET ${COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
    ...COLS.map((c) => o[c] ?? null),
    id,
  );
  return obtener(id);
}

export function borrar(id) {
  const cur = db.prepare('SELECT archivo_ruta FROM documentos WHERE id = ?').get(id);
  if (!cur) return false;
  db.prepare('DELETE FROM documentos WHERE id = ?').run(id);
  if (cur.archivo_ruta) fs.rm(path.join(UPLOAD_DIR, cur.archivo_ruta), { force: true }, () => {});
  // Los que apuntaban a este como original se reevalúan
  for (const h of db.prepare('SELECT id FROM documentos WHERE duplicado_de = ?').all(id)) actualizar(h.id, {});
  return true;
}

export function listar(f = {}) {
  const w = [];
  const v = [];
  if (f.anio) {
    w.push('(anio = ? OR anio IS NULL)'); // los de fecha ilegible siempre se ven para revisarlos
    v.push(+f.anio);
  }
  if (f.trimestre) {
    w.push('(trimestre = ? OR trimestre IS NULL)');
    v.push(f.trimestre);
  }
  if (f.flujo) {
    w.push('flujo = ?');
    v.push(f.flujo);
  }
  if (f.categoria) {
    w.push('categoria = ?');
    v.push(f.categoria);
  }
  if (f.estado) {
    w.push('estado = ?');
    v.push(f.estado);
  }
  if (f.q) {
    w.push('(entidad_nombre LIKE ? OR numero_factura LIKE ? OR entidad_nif LIKE ?)');
    v.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const sql = `SELECT * FROM documentos ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
               ORDER BY (fecha_emision IS NULL) DESC, fecha_emision DESC, id DESC`;
  return db.prepare(sql).all(...v).map(parse);
}

/** KPIs. Los duplicados sin validar no cuentan (para no contabilizar dos veces). */
export function resumen(anio, trimestre) {
  const w = ['(duplicado_de IS NULL OR revisado = 1)', 'anio = ?'];
  const v = [+anio];
  if (trimestre) {
    w.push('trimestre = ?');
    v.push(trimestre);
  }
  const filas = db
    .prepare(
      `SELECT flujo, COUNT(*) n, COALESCE(SUM(importe_total),0) total, COALESCE(SUM(total_base),0) base,
              COALESCE(SUM(total_iva),0) iva, COALESCE(SUM(irpf_cuota),0) irpf
       FROM documentos WHERE ${w.join(' AND ')} GROUP BY flujo`,
    )
    .all(...v);
  const g = filas.find((x) => x.flujo === 'Gasto') || { n: 0, total: 0, base: 0, iva: 0, irpf: 0 };
  const i = filas.find((x) => x.flujo === 'Ingreso') || { n: 0, total: 0, base: 0, iva: 0, irpf: 0 };
  const pend = db
    .prepare(
      `SELECT COUNT(*) n FROM documentos WHERE estado = 'Requiere revisión' AND (anio = ? OR anio IS NULL)
       ${trimestre ? 'AND (trimestre = ? OR trimestre IS NULL)' : ''}`,
    )
    .get(...(trimestre ? [+anio, trimestre] : [+anio])).n;
  const r = (n) => Math.round(n * 100) / 100;
  return {
    totalGastos: r(g.total),
    totalIngresos: r(i.total),
    ivaSoportado: r(g.iva),
    ivaRepercutido: r(i.iva),
    balanceIva: r(i.iva - g.iva), // >0 a pagar, <0 a compensar
    irpfRetenidoIngresos: r(i.irpf), // retenciones que te han practicado a ti
    irpfPracticadoGastos: r(g.irpf), // retenciones que tú has practicado (Modelo 111)
    documentos: g.n + i.n,
    pendientesRevision: pend,
  };
}

export function paraExcel(anio) {
  const libros = db
    .prepare(
      `SELECT * FROM documentos WHERE anio = ? AND (duplicado_de IS NULL OR revisado = 1)
       ORDER BY fecha_emision, id`,
    )
    .all(+anio)
    .map(parse);
  const incidencias = db
    .prepare(
      `SELECT * FROM documentos WHERE (anio = ? OR anio IS NULL) AND revisado = 0 AND problemas <> '[]'
       ORDER BY id`,
    )
    .all(+anio)
    .map(parse);
  return {
    gastos: libros.filter((x) => x.flujo === 'Gasto'),
    ingresos: libros.filter((x) => x.flujo === 'Ingreso'),
    incidencias,
  };
}

export function cerrarDb() {
  try {
    db.close();
  } catch {}
}
