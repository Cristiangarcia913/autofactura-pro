// Generación del Excel de 4 pestañas con ExcelJS. Las fórmulas se guardan con nombres en inglés
// (SUMIF, SUM...) y Excel en español las muestra como SUMAR.SI, SUMA...
import ExcelJS from 'exceljs';

const S_RESUMEN = 'Resumen Trimestral (IVA e IRPF)';
const S_GASTOS = 'Libro de Gastos y Tickets';
const S_INGRESOS = 'Libro de Ingresos';
const S_INCID = 'Incidencias - Para Revisar'; // "/" no está permitido en nombres de hoja de Excel

const EUR = '#,##0.00 "€"';
const AZUL = 'FF1F3A5F';
const AMARILLO = 'FFFFF4CC';

const COLUMNAS = (entidad) => [
  ['id', 'ID Interno', 11], ['fecha', 'Fecha', 12, 'dd/mm/yyyy'], ['trimestre', 'Trimestre', 11],
  ['tipo', 'Tipo Doc', 10], ['numero', 'Nº Factura', 16], ['entidad', entidad, 30],
  ['nif', 'NIF/CIF', 13], ['categoria', 'Categoría', 22],
  ['b21', 'Base 21%', 13, EUR], ['i21', 'IVA 21%', 12, EUR], ['b10', 'Base 10%', 13, EUR],
  ['i10', 'IVA 10%', 12, EUR], ['b4', 'Base 4%', 13, EUR], ['i4', 'IVA 4%', 12, EUR],
  ['bex', 'Base Exenta', 13, EUR], ['tbase', 'Total Base', 13, EUR], ['tiva', 'Total IVA', 12, EUR],
  ['irpfp', '% IRPF', 9, '0%'], ['irpfc', 'Cuota IRPF', 12, EUR], ['total', 'Total Factura', 14, EUR],
  ['estado', 'Estado Validación', 20], ['enlace', 'Enlace al Archivo', 16],
];
// Letras: A id, B fecha, C trimestre, D tipo, E nº, F entidad, G nif, H categoría, I b21, J i21, K b10,
// L i10, M b4, N i4, O bex, P tbase, Q tiva, R %irpf, S cuota irpf, T total, U estado, V enlace

const idInterno = (d) => `AF-${String(d.id).padStart(4, '0')}`;
const aFecha = (iso) => (iso ? new Date(iso + 'T00:00:00Z') : null);

function cabecera(ws) {
  const fila = ws.getRow(1);
  fila.height = 22;
  fila.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function libro(wb, nombre, filas, entidad, baseUrl) {
  const ws = wb.addWorksheet(nombre);
  const cols = COLUMNAS(entidad);
  ws.columns = cols.map(([key, header, width, numFmt]) => ({ key, header, width, style: numFmt ? { numFmt } : {} }));
  cabecera(ws);

  for (const d of filas) {
    const fila = ws.addRow({
      id: idInterno(d), fecha: aFecha(d.fecha_emision), trimestre: d.trimestre,
      tipo: d.tipo_documento, numero: d.numero_factura, entidad: d.entidad_nombre, nif: d.entidad_nif,
      categoria: d.categoria,
      b21: d.base_21, i21: d.cuota_21, b10: d.base_10, i10: d.cuota_10, b4: d.base_4, i4: d.cuota_4,
      bex: d.base_exenta, tbase: d.total_base, tiva: d.total_iva,
      irpfp: (d.irpf_pct || 0) / 100, irpfc: d.irpf_cuota, total: d.importe_total, estado: d.estado,
    });
    if (d.archivo_ruta) {
      fila.getCell('enlace').value = { text: 'Abrir archivo', hyperlink: `${baseUrl}/files/${d.id}` };
      fila.getCell('enlace').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
    if (d.estado === 'Requiere revisión') {
      fila.eachCell({ includeEmpty: true }, (c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
      });
    }
  }

  const n = filas.length;
  const tot = ws.getRow(n + 3);
  tot.getCell(1).value = 'TOTALES';
  ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'S', 'T'].forEach((L) => {
    const c = tot.getCell(L);
    c.value = n ? { formula: `SUBTOTAL(109,${L}2:${L}${n + 1})` } : 0;
    c.numFmt = EUR;
  });
  tot.font = { bold: true };
  tot.eachCell({ includeEmpty: true }, (c) => {
    c.border = { top: { style: 'thin' } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

function incidencias(wb, filas, baseUrl) {
  const ws = wb.addWorksheet(S_INCID);
  ws.columns = [
    { key: 'id', header: 'ID Interno', width: 11 },
    { key: 'flujo', header: 'Tipo', width: 10 },
    { key: 'fecha', header: 'Fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { key: 'entidad', header: 'Proveedor / Cliente', width: 30 },
    { key: 'nif', header: 'NIF/CIF', width: 13 },
    { key: 'numero', header: 'Nº Factura', width: 16 },
    { key: 'total', header: 'Total Factura', width: 14, style: { numFmt: EUR } },
    { key: 'problemas', header: 'Qué hay que confirmar', width: 80 },
    { key: 'enlace', header: 'Enlace al Archivo', width: 16 },
  ];
  cabecera(ws);
  for (const d of filas) {
    const fila = ws.addRow({
      id: idInterno(d), flujo: d.flujo, fecha: aFecha(d.fecha_emision), entidad: d.entidad_nombre,
      nif: d.entidad_nif, numero: d.numero_factura, total: d.importe_total, problemas: d.problemas.join(' · '),
    });
    fila.getCell('problemas').alignment = { wrapText: true, vertical: 'top' };
    if (d.archivo_ruta) {
      fila.getCell('enlace').value = { text: 'Abrir archivo', hyperlink: `${baseUrl}/files/${d.id}` };
      fila.getCell('enlace').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
  return ws;
}

function resumen(wb, anio) {
  const ws = wb.addWorksheet(S_RESUMEN, { properties: { tabColor: { argb: AZUL } } });
  ws.getColumn(1).width = 52;
  for (let i = 2; i <= 6; i++) ws.getColumn(i).width = 16;

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `AutoFactura Pro · Resumen fiscal ${anio}`;
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: AZUL } };
  ws.mergeCells('A2:F2');
  ws.getCell('A2').value =
    'Cálculo orientativo a partir de los libros de las pestañas siguientes. Confírmalo con tu gestor antes de presentar.';
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };

  const Q = ['B', 'C', 'D', 'E'];
  const sumif = (hoja, colVal, colQ, fila) =>
    `SUMIF('${hoja}'!$C:$C,${colQ}$${fila},'${hoja}'!$${colVal}:$${colVal})`;

  const titulo = (fila, texto) => {
    ws.getCell(`A${fila}`).value = texto;
    for (let c = 1; c <= 6; c++) {
      const cel = ws.getCell(fila, c);
      cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
      if (c > 1) cel.alignment = { horizontal: 'center' };
    }
  };
  const seccion = (fila, texto) => {
    ws.getCell(`A${fila}`).value = texto;
    for (let c = 1; c <= 6; c++) {
      ws.getCell(fila, c).font = { bold: true };
      ws.getCell(fila, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
    }
  };
  const linea = (fila, etiqueta, fn, { total = true, negrita = false } = {}) => {
    ws.getCell(`A${fila}`).value = etiqueta;
    Q.forEach((L) => {
      ws.getCell(`${L}${fila}`).value = { formula: fn(L) };
      ws.getCell(`${L}${fila}`).numFmt = EUR;
    });
    if (total) {
      ws.getCell(`F${fila}`).value = { formula: `SUM(B${fila}:E${fila})` };
      ws.getCell(`F${fila}`).numFmt = EUR;
    }
    if (negrita) for (let c = 1; c <= 6; c++) ws.getCell(fila, c).font = { bold: true };
  };

  // ---- Modelo 303
  titulo(4, 'MODELO 303 · IVA');
  ['T1', 'T2', 'T3', 'T4', 'Año'].forEach((t, i) => (ws.getCell(4, i + 2).value = t));
  seccion(5, 'IVA DEVENGADO (facturas emitidas)');
  linea(6, 'Base imponible 21%  (casilla 07)', (L) => sumif(S_INGRESOS, 'I', L, 4));
  linea(7, 'Cuota 21%  (casilla 09)', (L) => sumif(S_INGRESOS, 'J', L, 4));
  linea(8, 'Base imponible 10%  (casilla 04)', (L) => sumif(S_INGRESOS, 'K', L, 4));
  linea(9, 'Cuota 10%  (casilla 06)', (L) => sumif(S_INGRESOS, 'L', L, 4));
  linea(10, 'Base imponible 4%  (casilla 01)', (L) => sumif(S_INGRESOS, 'M', L, 4));
  linea(11, 'Cuota 4%  (casilla 03)', (L) => sumif(S_INGRESOS, 'N', L, 4));
  linea(12, 'Total cuota devengada  (casilla 27)', (L) => `${L}7+${L}9+${L}11`, { negrita: true });
  seccion(13, 'IVA DEDUCIBLE (gastos y compras)');
  linea(14, 'Base 21% soportada', (L) => sumif(S_GASTOS, 'I', L, 4));
  linea(15, 'Cuota 21% soportada', (L) => sumif(S_GASTOS, 'J', L, 4));
  linea(16, 'Base 10% soportada', (L) => sumif(S_GASTOS, 'K', L, 4));
  linea(17, 'Cuota 10% soportada', (L) => sumif(S_GASTOS, 'L', L, 4));
  linea(18, 'Base 4% soportada', (L) => sumif(S_GASTOS, 'M', L, 4));
  linea(19, 'Cuota 4% soportada', (L) => sumif(S_GASTOS, 'N', L, 4));
  linea(20, 'Total IVA deducible  (casilla 45)', (L) => `${L}15+${L}17+${L}19`, { negrita: true });
  linea(21, 'RESULTADO (positivo = a ingresar · negativo = a compensar)', (L) => `${L}12-${L}20`, { negrita: true });
  for (let c = 1; c <= 6; c++) {
    ws.getCell(21, c).border = { top: { style: 'medium' } };
    ws.getCell(21, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBDD' } };
  }

  // ---- Modelo 130
  titulo(23, 'MODELO 130 · IRPF (pagos fraccionados, acumulado desde enero)');
  ['T1', 'T2', 'T3', 'T4'].forEach((t, i) => (ws.getCell(23, i + 2).value = t));
  ws.getCell('F23').value = '';
  linea(24, 'Ingresos del trimestre (base imponible)', (L) => sumif(S_INGRESOS, 'P', L, 23));
  linea(25, 'Gastos deducibles del trimestre (base imponible)', (L) => sumif(S_GASTOS, 'P', L, 23));
  linea(26, 'Rendimiento neto del trimestre', (L) => `${L}24-${L}25`);
  linea(27, 'Ingresos acumulados', (L) => `SUM($B24:${L}24)`, { total: false });
  linea(28, 'Gastos acumulados', (L) => `SUM($B25:${L}25)`, { total: false });
  linea(29, 'Rendimiento neto acumulado', (L) => `${L}27-${L}28`, { total: false, negrita: true });
  linea(30, '20% del rendimiento neto acumulado', (L) => `MAX(0,${L}29)*0.2`, { total: false });
  linea(31, 'Retenciones de IRPF soportadas en el trimestre', (L) => sumif(S_INGRESOS, 'S', L, 23));
  linea(32, 'Retenciones de IRPF acumuladas', (L) => `SUM($B31:${L}31)`, { total: false });
  ws.getCell('A33').value = 'Pagos de trimestres anteriores (acumulado) · rellenar a mano';
  Q.forEach((L) => {
    const c = ws.getCell(`${L}33`);
    c.value = 0;
    c.numFmt = EUR;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
  });
  linea(34, 'RESULTADO A INGRESAR (casilla 07/19 orientativa)', (L) => `MAX(0,${L}30-${L}32-${L}33)`, {
    total: false, negrita: true,
  });
  for (let c = 1; c <= 6; c++) {
    ws.getCell(34, c).border = { top: { style: 'medium' } };
    ws.getCell(34, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBDD' } };
  }

  ws.mergeCells('A36:F38');
  ws.getCell('A36').value =
    'Notas: no incluye deducciones específicas (p. ej. gastos de difícil justificación, límites de dietas, ' +
    'reducciones por vivienda o vehículo) ni compensaciones de trimestres anteriores. Las filas en amarillo de ' +
    'los libros están pendientes de revisión; los duplicados sin validar no se contabilizan.';
  ws.getCell('A36').alignment = { wrapText: true, vertical: 'top' };
  ws.getCell('A36').font = { italic: true, color: { argb: 'FF666666' } };
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return ws;
}

export async function generarExcel({ anio, gastos, ingresos, incidencias: incs, baseUrl }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AutoFactura Pro';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true; // que Excel calcule las fórmulas al abrir

  resumen(wb, anio);
  libro(wb, S_GASTOS, gastos, 'Proveedor', baseUrl);
  libro(wb, S_INGRESOS, ingresos, 'Cliente', baseUrl);
  incidencias(wb, incs, baseUrl);
  return wb.xlsx.writeBuffer();
}
