// Pruebas rápidas: node test/smoke.js  (o npm test). No necesitan clave de API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'autofactura-test-'));
process.env.USER_NIF = 'B12345674';
process.env.MOCK_AI = '1';

const v = await import('../lib/validate.js');
const dbm = await import('../lib/db.js');
const { extraerFactura } = await import('../lib/extract.js');

let ok = 0;
const t = (nombre, fn) => {
  fn();
  ok++;
  console.log('  ✔', nombre);
};

console.log('Validaciones');
t('NIF/DNI/NIE/CIF válidos', () => {
  for (const n of ['12345678Z', 'X1234567L', 'A15075062', 'B12345674']) assert.equal(v.validarNif(n), true, n);
});
t('NIF/CIF inválidos', () => {
  for (const n of ['12345678A', 'A15075061', 'B1234567', '']) assert.equal(v.validarNif(n), false, n);
});
t('fechas y trimestres', () => {
  assert.equal(v.fechaIso('05/03/2026'), '2026-03-05');
  assert.equal(v.fechaIso('31/02/2026'), null);
  assert.deepEqual(v.trimestreDe('2026-07-01'), { anio: 2026, trimestre: 'T3' });
  assert.deepEqual(v.trimestreDe('2026-12-31'), { anio: 2026, trimestre: 'T4' });
});
t('números en formato español', () => {
  assert.equal(v.num('1.234,56 €'), 1234.56);
  assert.equal(v.num('12,5'), 12.5);
  assert.equal(v.num(null), 0);
});
t('cuadre OK (factura con IRPF)', () => {
  const o = v.recalcular({ tipo_documento: 'Factura', fecha_emision: '2026-02-10', entidad_nif: '12345678Z', base_21: 1000, cuota_21: 210, irpf_pct: 15, irpf_cuota: 150, importe_total: 1060, confianza: 0.97 });
  assert.equal(o.cuadra, 1);
  assert.equal(o.estado, 'OK');
  assert.equal(o.trimestre, 'T1');
});
t('descuadre detectado y tolerancia de 0,02 €', () => {
  const base = { tipo_documento: 'Factura', fecha_emision: '2026-02-10', entidad_nif: '12345678Z', base_21: 100, cuota_21: 21, confianza: 0.97 };
  assert.equal(v.recalcular({ ...base, importe_total: 121.02 }).cuadra, 1);
  const mal = v.recalcular({ ...base, importe_total: 125 });
  assert.equal(mal.cuadra, 0);
  assert.equal(mal.estado, 'Requiere revisión');
});
t('confianza < 85% y factura sin NIF => revisión; ticket sin NIF no es problema', () => {
  const b = { fecha_emision: '2026-02-10', base_10: 10, cuota_10: 1, importe_total: 11 };
  assert.equal(v.recalcular({ ...b, tipo_documento: 'Ticket', confianza: 0.6 }).estado, 'Requiere revisión');
  assert.equal(v.recalcular({ ...b, tipo_documento: 'Factura', confianza: 0.95 }).estado, 'Requiere revisión');
  assert.equal(v.recalcular({ ...b, tipo_documento: 'Ticket', confianza: 0.95 }).estado, 'OK');
});

console.log('Base de datos');
const factura = (extra = {}) => ({
  flujo: 'Gasto', tipo_documento: 'Factura', fecha_emision: '2026-05-04', numero_factura: 'A-1',
  entidad_nombre: 'Proveedor SL', entidad_nif: 'B12345674', categoria: 'Software',
  base_21: 100, cuota_21: 21, importe_total: 121, confianza: 0.99, archivo_hash: Math.random().toString(36), ...extra,
});
let a, b, c;
t('insertar y recalcular', () => {
  a = dbm.insertar(factura());
  assert.equal(a.estado, 'OK');
  assert.equal(a.trimestre, 'T2');
  assert.equal(a.total_iva, 21);
});
t('duplicado por NIF+fecha+importe', () => {
  b = dbm.insertar(factura({ numero_factura: 'otro' }));
  assert.equal(b.duplicado_de, a.id);
  assert.equal(b.estado, 'Requiere revisión');
});
t('duplicado por mismo nº de factura', () => {
  c = dbm.insertar(factura({ fecha_emision: '2026-05-09', base_21: 50, cuota_21: 10.5, importe_total: 60.5 }));
  assert.equal(c.duplicado_de, a.id);
});
t('los duplicados sin validar no cuentan en el resumen', () => {
  const r = dbm.resumen(2026, 'T2');
  assert.equal(r.totalGastos, 121);
  assert.equal(r.ivaSoportado, 21);
  assert.equal(r.pendientesRevision, 2);
});
t('validar un duplicado lo contabiliza', () => {
  dbm.actualizar(b.id, { revisado: 1 });
  assert.equal(dbm.resumen(2026, 'T2').totalGastos, 242);
});
t('editar una celda recalcula totales y trimestre', () => {
  const e = dbm.actualizar(a.id, { fecha_emision: '01/10/2026', base_21: '200,00' });
  assert.equal(e.trimestre, 'T4');
  assert.equal(e.total_base, 200);
  assert.equal(e.cuadra, 0); // total sigue siendo 121
});
// Con USER_NIF = B12345674, los documentos de muestra emitidos por ese NIF deben salir como Ingreso
const flujos = new Set();
for (let i = 0; i < 40; i++) {
  flujos.add((await extraerFactura({ buffer: Buffer.alloc(0), mime: 'application/pdf', nombre: `doc${i}.pdf` })).flujo);
}
t('flujo Ingreso/Gasto según tu NIF (modo demo)', () => {
  assert.deepEqual([...flujos].sort(), ['Gasto', 'Ingreso']);
});
t('listado con filtros y datos para Excel', () => {
  assert.ok(dbm.listar({ anio: 2026, estado: 'Requiere revisión' }).length >= 1);
  const x = dbm.paraExcel(2026);
  assert.ok(Array.isArray(x.gastos) && Array.isArray(x.ingresos) && Array.isArray(x.incidencias));
});
t('borrar reevalúa duplicados', () => {
  dbm.borrar(a.id);
  assert.equal(dbm.obtener(c.id).duplicado_de, null);
});

console.log('Excel');
let ExcelJS = null;
try {
  ExcelJS = (await import('exceljs')).default;
} catch {
  console.log('  (omitido: exceljs no está instalado todavía; se prueba tras `npm install`)');
}
if (ExcelJS) {
  const { generarExcel } = await import('../lib/excel.js');
  const datos = dbm.paraExcel(2026);
  const buf = await generarExcel({ anio: 2026, ...datos, baseUrl: 'http://localhost:3000' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Resumen Trimestral (IVA e IRPF)', 'Libro de Gastos y Tickets', 'Libro de Ingresos', 'Incidencias - Para Revisar']);
  t('4 pestañas con los nombres esperados', () => {});
  const r = wb.getWorksheet('Resumen Trimestral (IVA e IRPF)');
  assert.ok(String(r.getCell('B7').value.formula).includes('SUMIF'));
  t('el resumen usa fórmulas nativas', () => {});
  const g = wb.getWorksheet('Libro de Gastos y Tickets');
  assert.equal(g.views[0].state, 'frozen');
  assert.ok(g.autoFilter);
  t('cabeceras fijadas y autofiltro', () => {});
}

console.log(`\n${ok} comprobaciones correctas`);
try {
  if (typeof dbm.cerrarDb === 'function') dbm.cerrarDb();
  else if (dbm.db?.close) dbm.db.close();
} catch {}
try {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
} catch {}
