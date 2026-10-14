// Motor de extracción: envía la factura/ticket a Claude (visión + PDF) y devuelve el JSON contable.
import crypto from 'node:crypto';
import { limpiarNif } from './validate.js';

export const SYSTEM_PROMPT = `Eres un auditor contable experto en fiscalidad española. Tu única tarea es analizar imágenes o PDFs de facturas y tickets de compra y extraer su información contable con precisión milimétrica.

Reglas estrictas de extracción:
1. Desglose de IVA: en muchos tickets de supermercado, restaurantes o gasolineras el IVA está incluido en el precio o hay varios tipos de IVA (21%, 10%, 4%). Busca siempre la tabla de desglose de impuestos al pie del ticket. Si solo aparece el "Total con IVA incluido" y el porcentaje, calcula la Base Imponible como Base = Total / (1 + Tipo IVA / 100) y la cuota como Total - Base.
2. Propinas o tasas exentas: si hay conceptos sin IVA (tasas municipales, suplidos), inclúyelos en base_exenta.
3. NIF/CIF: limpia espacios y guiones (ejemplo: B12345678). Identifica claramente quién es el proveedor (quien vende / emite) y no lo confundas con el cliente. Rellena los datos del cliente solo si aparecen.
4. IRPF: si hay retención, devuelve el porcentaje y la cuota (positiva). Recargo de equivalencia: porcentaje y cuota si aparecen.
5. Cero alucinaciones: si un campo no es visible, está cortado o es ilegible, devuelve null en ese campo y explica el motivo en observaciones_revision. No inventes números, NIF ni fechas.
6. nivel_confianza_lectura es un número entre 0 y 1 que refleja la nitidez y la certeza de TODA la lectura. Si el documento está borroso o arrugado, baja la confianza.
7. cuadre_matematico_correcto: true solo si total_base_imponible + total_cuota_iva + recargo - cuota_irpf = importe_total_factura (tolerancia 0,02 €).
8. Formato de salida: responde ÚNICAMENTE con un objeto JSON válido que siga exactamente este esquema, sin bloques de código Markdown ni texto adicional. Los importes son números con punto decimal, sin símbolo de moneda.

{
  "tipo_documento": "Factura | Ticket",
  "fecha_emision": "YYYY-MM-DD",
  "trimestre": "T1 | T2 | T3 | T4",
  "numero_factura": "string o null",
  "proveedor_nombre": "string",
  "proveedor_nif": "string o null",
  "cliente_nombre": "string o null",
  "cliente_nif": "string o null",
  "categoria_sugerida": "Suministros | Dietas | Transporte | Material | Software | Servicios Profesionales | Mercaderias | Arrendamientos | Otros",
  "desglose_iva": {
    "base_21": 0.00, "cuota_21": 0.00,
    "base_10": 0.00, "cuota_10": 0.00,
    "base_4": 0.00, "cuota_4": 0.00,
    "base_exenta": 0.00
  },
  "irpf": { "porcentaje": 0, "cuota": 0.00 },
  "recargo_equivalencia": { "porcentaje": 0, "cuota": 0.00 },
  "total_base_imponible": 0.00,
  "total_cuota_iva": 0.00,
  "importe_total_factura": 0.00,
  "cuadre_matematico_correcto": true,
  "nivel_confianza_lectura": 0.98,
  "observaciones_revision": "string o null"
}`;

const IMAGENES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1 };
const POR_EXTENSION = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
};

export function mimeValido(nombre, mime) {
  if (mime === 'application/pdf' || IMAGENES[mime]) return mime;
  const ext = (/\.[^.]+$/.exec(String(nombre).toLowerCase()) || [''])[0];
  return POR_EXTENSION[ext] || null;
}

function extraerJson(texto) {
  const t = String(texto).replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('La IA no devolvió un JSON válido');
  return JSON.parse(t.slice(a, b + 1));
}

let cliente = null;
async function llamarClaude({ buffer, mime }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Falta ANTHROPIC_API_KEY en el archivo .env (o usa MOCK_AI=1 para probar sin IA)');
  }
  if (!cliente) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  const esPdf = mime === 'application/pdf';
  if (!esPdf && buffer.length > 5 * 1024 * 1024) {
    throw new Error('La imagen supera los 5 MB; reduce su tamaño o súbela como PDF');
  }
  const data = buffer.toString('base64');
  const bloque = esPdf
    ? { type: 'document', source: { type: 'base64', media_type: mime, data } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data } };

  const userNif = limpiarNif(process.env.USER_NIF);
  const pista = userNif
    ? `El NIF/CIF del usuario es ${userNif} (puede aparecer como emisor o como receptor).`
    : 'No se conoce el NIF del usuario.';

  const resp = await cliente.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: [bloque, { type: 'text', text: `${pista}\nExtrae los datos contables de este documento.` }] },
    ],
  });
  const texto = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return extraerJson(texto);
}

// Datos de ejemplo para probar la interfaz sin clave de API (MOCK_AI=1).
function simulado({ nombre }) {
  const h = crypto.createHash('md5').update(nombre).digest();
  const dias = h[0] % 60;
  const f = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const muestras = [
    {
      tipo_documento: 'Ticket', proveedor_nombre: 'Supermercado Ejemplo S.L.', proveedor_nif: 'B12345674',
      categoria_sugerida: 'Suministros', numero_factura: null,
      desglose_iva: { base_21: 20, cuota_21: 4.2, base_10: 10, cuota_10: 1, base_4: 5, cuota_4: 0.2, base_exenta: 0 },
      irpf: { porcentaje: 0, cuota: 0 }, importe_total_factura: 40.4, nivel_confianza_lectura: 0.95,
    },
    {
      tipo_documento: 'Factura', proveedor_nombre: 'Gestoría Ejemplo', proveedor_nif: '12345678Z',
      categoria_sugerida: 'Servicios Profesionales', numero_factura: 'F-2026/118',
      desglose_iva: { base_21: 1000, cuota_21: 210, base_10: 0, cuota_10: 0, base_4: 0, cuota_4: 0, base_exenta: 0 },
      irpf: { porcentaje: 15, cuota: 150 }, importe_total_factura: 1060, nivel_confianza_lectura: 0.97,
    },
    {
      tipo_documento: 'Ticket', proveedor_nombre: 'Bar La Esquina', proveedor_nif: null,
      categoria_sugerida: 'Dietas', numero_factura: null,
      desglose_iva: { base_21: 0, cuota_21: 0, base_10: 12.5, cuota_10: 1.25, base_4: 0, cuota_4: 0, base_exenta: 0 },
      irpf: { porcentaje: 0, cuota: 0 }, importe_total_factura: 13.75, nivel_confianza_lectura: 0.62,
      observaciones_revision: 'Ticket borroso: el NIF y parte del desglose no se leen bien',
    },
    {
      tipo_documento: 'Factura', proveedor_nombre: 'Software Ejemplo Inc.', proveedor_nif: 'A15075062',
      categoria_sugerida: 'Software', numero_factura: 'INV-5521',
      desglose_iva: { base_21: 49.59, cuota_21: 10.41, base_10: 0, cuota_10: 0, base_4: 0, cuota_4: 0, base_exenta: 0 },
      irpf: { porcentaje: 0, cuota: 0 }, importe_total_factura: 60, nivel_confianza_lectura: 0.98,
    },
  ];
  return { fecha_emision: f, ...muestras[h[1] % muestras.length] };
}

/** Devuelve el documento ya en el formato interno (flujo, entidad, etc.). */
export async function extraerFactura({ buffer, mime, nombre }) {
  const ia = process.env.MOCK_AI === '1' ? simulado({ nombre }) : await llamarClaude({ buffer, mime });

  const userNif = limpiarNif(process.env.USER_NIF);
  const provNif = limpiarNif(ia.proveedor_nif);
  const esIngreso = Boolean(userNif && provNif && provNif === userNif);
  const iva = ia.desglose_iva || {};

  return {
    flujo: esIngreso ? 'Ingreso' : 'Gasto',
    tipo_documento: ia.tipo_documento,
    fecha_emision: ia.fecha_emision,
    numero_factura: ia.numero_factura,
    entidad_nombre: esIngreso ? ia.cliente_nombre : ia.proveedor_nombre,
    entidad_nif: esIngreso ? ia.cliente_nif : ia.proveedor_nif,
    categoria: ia.categoria_sugerida,
    base_21: iva.base_21, cuota_21: iva.cuota_21,
    base_10: iva.base_10, cuota_10: iva.cuota_10,
    base_4: iva.base_4, cuota_4: iva.cuota_4,
    base_exenta: iva.base_exenta,
    irpf_pct: ia.irpf?.porcentaje, irpf_cuota: ia.irpf?.cuota,
    recargo_pct: ia.recargo_equivalencia?.porcentaje, recargo_cuota: ia.recargo_equivalencia?.cuota,
    importe_total: ia.importe_total_factura,
    confianza: ia.nivel_confianza_lectura,
    observaciones: ia.observaciones_revision,
  };
}
