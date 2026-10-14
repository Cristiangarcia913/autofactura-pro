// Lógica pura (sin dependencias): normalización, NIF/CIF, trimestres, cuadre matemático y estado.

export const CATEGORIAS = [
  'Suministros',
  'Dietas',
  'Transporte',
  'Material',
  'Software',
  'Servicios Profesionales',
  'Mercaderias',
  'Arrendamientos',
  'Otros',
];

export const UMBRAL_CONFIANZA = 0.85;
export const TOLERANCIA = 0.02;

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Convierte "1.234,56 €", "12,5", 12.5, null... en número. */
export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/[€\s]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function limpiarNif(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).toUpperCase().replace(/[\s\-.]/g, '');
  return s || null;
}

/** Acepta YYYY-MM-DD o DD/MM/AAAA. Devuelve YYYY-MM-DD o null. */
export function fechaIso(v) {
  if (!v) return null;
  const s = String(v).trim();
  let y, mo, d, m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s))) {
    d = +m[1];
    mo = +m[2];
    y = +m[3];
    if (y < 100) y += 2000;
  } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function trimestreDe(iso) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso || '');
  if (!m) return { anio: null, trimestre: null };
  return { anio: +m[1], trimestre: 'T' + Math.ceil(+m[2] / 3) };
}

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Valida NIF/DNI, NIE, CIF (con dígito de control) y formato de VAT europeo. */
export function validarNif(nif) {
  if (!nif) return false;
  const s = String(nif).toUpperCase();
  let m;
  if ((m = /^(\d{8})([A-Z])$/.exec(s))) return LETRAS_DNI[+m[1] % 23] === m[2];
  if ((m = /^([XYZ])(\d{7})([A-Z])$/.exec(s))) {
    const n = +({ X: '0', Y: '1', Z: '2' }[m[1]] + m[2]);
    return LETRAS_DNI[n % 23] === m[3];
  }
  if ((m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(s))) {
    let suma = 0;
    m[2].split('').map(Number).forEach((d, i) => {
      if (i % 2 === 0) {
        const x = d * 2;
        suma += Math.floor(x / 10) + (x % 10);
      } else suma += d;
    });
    const ctl = (10 - (suma % 10)) % 10;
    const letra = 'JABCDEFGHI'[ctl];
    if ('PQRSNW'.includes(m[1])) return m[3] === letra;
    if ('ABEH'.includes(m[1])) return m[3] === String(ctl);
    return m[3] === String(ctl) || m[3] === letra;
  }
  if (/^[KLM]\d{7}[A-Z0-9]$/.test(s)) return true; // DNI especiales (menores / extranjeros sin NIE)
  if (s.startsWith('ES') && s.length > 9) return validarNif(s.slice(2)); // VAT español
  if (/^(?!ES)[A-Z]{2}[A-Z0-9]{8,12}$/.test(s)) return true; // VAT de otro país de la UE (solo formato)
  return false;
}

const money = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

/**
 * Recibe un documento "en bruto" (de la IA o editado por el usuario) y devuelve el registro
 * completo normalizado: totales recalculados, trimestre, cuadre, problemas y estado.
 */
export function recalcular(d) {
  const o = {};
  for (const c of ['archivo_nombre', 'archivo_ruta', 'archivo_mime', 'archivo_hash']) o[c] = d[c] ?? null;

  o.flujo = d.flujo === 'Ingreso' ? 'Ingreso' : 'Gasto';
  const td = String(d.tipo_documento || '').toLowerCase();
  o.tipo_documento = td.includes('ticket') || td.includes('simplificada') ? 'Ticket' : 'Factura';

  o.numero_factura = d.numero_factura ? String(d.numero_factura).trim() || null : null;
  o.entidad_nombre = d.entidad_nombre ? String(d.entidad_nombre).trim() || null : null;
  o.entidad_nif = limpiarNif(d.entidad_nif);
  o.categoria =
    CATEGORIAS.find((c) => c.toLowerCase() === String(d.categoria || '').trim().toLowerCase()) || 'Otros';

  o.fecha_emision = fechaIso(d.fecha_emision);
  const { anio, trimestre } = trimestreDe(o.fecha_emision);
  o.anio = anio;
  o.trimestre = trimestre;

  for (const c of [
    'base_21', 'cuota_21', 'base_10', 'cuota_10', 'base_4', 'cuota_4', 'base_exenta',
    'irpf_cuota', 'recargo_cuota', 'importe_total',
  ]) o[c] = r2(num(d[c]));
  o.irpf_pct = num(d.irpf_pct);
  o.recargo_pct = num(d.recargo_pct);

  o.total_base = r2(o.base_21 + o.base_10 + o.base_4 + o.base_exenta);
  o.total_iva = r2(o.cuota_21 + o.cuota_10 + o.cuota_4);

  let conf = d.confianza === null || d.confianza === undefined || d.confianza === '' ? null : num(d.confianza);
  if (conf !== null && conf > 1) conf = conf / 100;
  o.confianza = conf;
  o.observaciones = d.observaciones ? String(d.observaciones).trim() || null : null;

  const dif = r2(o.total_base + o.total_iva + o.recargo_cuota - o.irpf_cuota - o.importe_total);
  const sinImportes = o.total_base === 0 && o.importe_total === 0;
  o.cuadra = !sinImportes && Math.abs(dif) <= TOLERANCIA + 1e-9 ? 1 : 0;

  const p = [];
  if (conf === null) p.push('Sin nivel de confianza de lectura');
  else if (conf < UMBRAL_CONFIANZA) p.push(`Confianza baja (${Math.round(conf * 100)}%)`);
  if (!o.fecha_emision) p.push('Fecha ilegible o inválida');
  if (sinImportes) p.push('No se ha leído ningún importe');
  else if (o.importe_total === 0) p.push('Importe total ausente');
  else if (!o.cuadra) p.push(`Descuadre matemático (diferencia ${money(dif)})`);
  if (!o.entidad_nif && o.tipo_documento === 'Factura') p.push('Falta el NIF/CIF');
  else if (o.entidad_nif && !validarNif(o.entidad_nif)) p.push('NIF/CIF con formato no válido (revisar lectura)');
  if (d.duplicado_de) p.push(`Posible duplicado del documento #${d.duplicado_de}`);
  if (o.observaciones) p.push(`IA: ${o.observaciones}`);

  o.duplicado_de = d.duplicado_de || null;
  o.problemas = JSON.stringify(p);
  o.revisado = d.revisado ? 1 : 0;
  o.estado = o.revisado ? 'Validado' : p.length ? 'Requiere revisión' : 'OK';
  return o;
}
