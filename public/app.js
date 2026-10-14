// Frontend sin dependencias: dashboard, carga masiva, tabla editable y filtros.
const $ = (s) => document.querySelector(s);
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let CATS = [];
const hoy = new Date();
const filtros = { anio: hoy.getFullYear(), trimestre: 'T' + Math.ceil((hoy.getMonth() + 1) / 3), flujo: '', categoria: '', estado: '', q: '' };
let docs = [];

const COLUMNAS = [
  { k: 'estado', t: 'Estado', ro: true },
  { k: 'fecha_emision', t: 'Fecha', tipo: 'fecha' },
  { k: 'trimestre', t: 'Trim.', ro: true },
  { k: 'flujo', t: 'Tipo', tipo: 'sel', opts: ['Gasto', 'Ingreso'] },
  { k: 'tipo_documento', t: 'Documento', tipo: 'sel', opts: ['Factura', 'Ticket'] },
  { k: 'numero_factura', t: 'Nº factura', tipo: 'txt' },
  { k: 'entidad_nombre', t: 'Proveedor / Cliente', tipo: 'txt' },
  { k: 'entidad_nif', t: 'NIF/CIF', tipo: 'txt' },
  { k: 'categoria', t: 'Categoría', tipo: 'sel' },
  { k: 'base_21', t: 'Base 21%', tipo: 'num', dinero: true },
  { k: 'cuota_21', t: 'IVA 21%', tipo: 'num', dinero: true },
  { k: 'base_10', t: 'Base 10%', tipo: 'num', dinero: true },
  { k: 'cuota_10', t: 'IVA 10%', tipo: 'num', dinero: true },
  { k: 'base_4', t: 'Base 4%', tipo: 'num', dinero: true },
  { k: 'cuota_4', t: 'IVA 4%', tipo: 'num', dinero: true },
  { k: 'base_exenta', t: 'Exenta', tipo: 'num', dinero: true },
  { k: 'irpf_pct', t: '% IRPF', tipo: 'num', pct: true },
  { k: 'irpf_cuota', t: 'Cuota IRPF', tipo: 'num', dinero: true },
  { k: 'importe_total', t: 'Total', tipo: 'num', dinero: true },
  { k: 'confianza', t: 'Conf.', ro: true },
  { k: '_acc', t: '', ro: true },
];

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

const fechaVista = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const qs = (o) => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null))).toString();

// ---------- Dashboard ----------
function pintarKpis(r) {
  const balance = r.balanceIva;
  const kpis = [
    ['Total gastos', eur.format(r.totalGastos), ''],
    ['Total ingresos', eur.format(r.totalIngresos), ''],
    ['IVA soportado', eur.format(r.ivaSoportado), 'deducible'],
    ['IVA repercutido', eur.format(r.ivaRepercutido), 'devengado'],
    ['Balance de IVA', eur.format(Math.abs(balance)), balance > 0 ? 'a pagar' : balance < 0 ? 'a compensar' : 'sin saldo', balance > 0 ? 'pagar' : balance < 0 ? 'compensar' : ''],
    ['IRPF retenido', eur.format(r.irpfRetenidoIngresos), `en tus ingresos · practicado: ${eur.format(r.irpfPracticadoGastos)}`],
    ['Pendientes de revisión', String(r.pendientesRevision), `${r.documentos} documentos contabilizados`],
  ];
  $('#kpis').innerHTML = kpis
    .map(([t, v, s, c]) => `<div class="kpi ${c || ''}"><small>${esc(t)}</small><b>${esc(v)}</b><em>${esc(s)}</em></div>`)
    .join('');
}

// ---------- Tabla ----------
function celda(c, d) {
  if (c.k === 'estado') {
    const cls = d.estado === 'OK' ? 'ok' : d.estado === 'Validado' ? 'val' : 'warn';
    const probs = d.problemas?.length && d.estado !== 'Validado' ? `<ul class="probs">${d.problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    return `<td><span class="badge ${cls}">${esc(d.estado)}</span>${probs}</td>`;
  }
  if (c.k === 'trimestre') return `<td>${esc(d.trimestre || '—')}</td>`;
  if (c.k === 'confianza') return `<td class="num">${d.confianza == null ? '—' : Math.round(d.confianza * 100) + '%'}</td>`;
  if (c.k === '_acc') {
    const archivo = d.archivo_ruta ? `<a href="/files/${d.id}" target="_blank" rel="noopener"><button title="Ver archivo original">📄</button></a>` : '';
    return `<td class="acc"><button data-acc="validar" title="${d.revisado ? 'Quitar validación' : 'Marcar como revisado'}">${d.revisado ? '↩' : '✔'}</button>${archivo}<button data-acc="borrar" title="Eliminar">🗑</button></td>`;
  }
  const v = d[c.k];
  let txt;
  if (c.tipo === 'fecha') txt = fechaVista(v);
  else if (c.dinero) txt = v ? eur.format(v) : '–';
  else if (c.pct) txt = v ? `${v}%` : '–';
  else txt = v ?? '';
  const vacio = txt === '' || txt === '–' ? ' vacio' : '';
  const ph = txt === '' ? '—' : esc(txt);
  return `<td class="edit${c.tipo === 'num' ? ' num' : ''}${vacio}" data-k="${c.k}">${ph}</td>`;
}

function pintarTabla() {
  const cab = `<thead><tr>${COLUMNAS.map((c) => `<th>${esc(c.t)}</th>`).join('')}</tr></thead>`;
  const cuerpo = docs.length
    ? docs.map((d) => `<tr data-id="${d.id}" class="${d.estado === 'Requiere revisión' ? 'warn' : ''}">${COLUMNAS.map((c) => celda(c, d)).join('')}</tr>`).join('')
    : `<tr><td colspan="${COLUMNAS.length}" class="vacio-tabla">No hay documentos con estos filtros. Sube facturas o tickets arriba.</td></tr>`;
  $('#tabla').innerHTML = `${cab}<tbody>${cuerpo}</tbody>`;
  $('#contador').textContent = `(${docs.length})`;
}

function editar(td) {
  const tr = td.closest('tr');
  const d = docs.find((x) => x.id === +tr.dataset.id);
  const c = COLUMNAS.find((x) => x.k === td.dataset.k);
  let el;
  if (c.tipo === 'sel') {
    el = document.createElement('select');
    const opts = c.k === 'categoria' ? CATS : c.opts;
    el.innerHTML = opts.map((o) => `<option ${o === d[c.k] ? 'selected' : ''}>${esc(o)}</option>`).join('');
  } else {
    el = document.createElement('input');
    const v = d[c.k];
    el.value = c.tipo === 'fecha' ? fechaVista(v) : c.tipo === 'num' ? String(v ?? '').replace('.', ',') : v ?? '';
    if (c.tipo === 'fecha') el.placeholder = 'DD/MM/AAAA';
  }
  td.innerHTML = '';
  td.append(el);
  el.focus();
  let hecho = false;
  const cerrar = async (guardar) => {
    if (hecho) return;
    hecho = true;
    if (!guardar) return pintarTabla();
    try {
      const nuevo = await api(`/api/documentos/${d.id}`, { method: 'PATCH', body: JSON.stringify({ [c.k]: el.value }) });
      docs = docs.map((x) => (x.id === nuevo.id ? nuevo : x));
      cargarResumen();
    } catch (e) {
      alert(e.message);
    }
    pintarTabla();
  };
  el.addEventListener('blur', () => cerrar(true));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.blur();
    if (e.key === 'Escape') cerrar(false);
  });
  if (c.tipo === 'sel') el.addEventListener('change', () => el.blur());
}

$('#tabla').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-acc]');
  const tr = e.target.closest('tr[data-id]');
  if (btn && tr) {
    const id = +tr.dataset.id;
    const d = docs.find((x) => x.id === id);
    if (btn.dataset.acc === 'validar') {
      const nuevo = await api(`/api/documentos/${id}`, { method: 'PATCH', body: JSON.stringify({ revisado: d.revisado ? 0 : 1 }) });
      docs = docs.map((x) => (x.id === id ? nuevo : x));
    } else if (confirm(`¿Eliminar este documento${d.entidad_nombre ? ` (${d.entidad_nombre})` : ''}? Se borra también el archivo guardado.`)) {
      await api(`/api/documentos/${id}`, { method: 'DELETE' });
      docs = docs.filter((x) => x.id !== id);
    }
    pintarTabla();
    cargarResumen();
    return;
  }
  const td = e.target.closest('td.edit');
  if (td && !td.querySelector('input,select')) editar(td);
});

// ---------- Carga ----------
const drop = $('#drop');
const input = $('#file');
drop.addEventListener('click', () => input.click());
drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && input.click());
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => subir([...e.dataTransfer.files]));
input.addEventListener('change', () => { subir([...input.files]); input.value = ''; });

async function subir(archivos) {
  if (!archivos.length) return;
  const cont = $('#progreso');
  cont.hidden = false;
  $('#aviso').hidden = true;
  cont.innerHTML = `<b id="p-txt"></b><div class="barra"><i id="p-barra"></i></div><ul id="p-lista"></ul>`;
  const lista = $('#p-lista');
  let hechos = 0;
  const fuera = [];
  const actualizar = () => {
    $('#p-txt').textContent = `Procesando ${hechos} de ${archivos.length}…`;
    $('#p-barra').style.width = `${(hechos / archivos.length) * 100}%`;
  };
  actualizar();

  const cola = [...archivos];
  const trabajador = async () => {
    while (cola.length) {
      const f = cola.shift();
      const li = document.createElement('li');
      li.textContent = `${f.name}…`;
      lista.append(li);
      try {
        const fd = new FormData();
        fd.append('archivo', f);
        const r = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
        li.className = 'ok';
        li.textContent = `✔ ${f.name}`;
        const d = data.documento;
        if (d.anio !== filtros.anio || (filtros.trimestre && d.trimestre !== filtros.trimestre)) fuera.push(d);
      } catch (e) {
        li.className = 'error';
        li.textContent = `✘ ${e.message}`;
      }
      hechos++;
      actualizar();
    }
  };
  await Promise.all([trabajador(), trabajador(), trabajador()]); // 3 a la vez
  $('#p-txt').textContent = `Terminado: ${archivos.length} archivo(s) procesados`;

  if (fuera.length) {
    const a = $('#aviso');
    a.hidden = false;
    a.innerHTML = `${fuera.length} documento(s) pertenecen a otro periodo y no se ven con el filtro actual. <button id="ver-todos">Ver todos los trimestres</button>`;
    $('#ver-todos').onclick = () => {
      filtros.trimestre = '';
      if (fuera[0].anio) filtros.anio = fuera[0].anio;
      sincronizarFiltros();
      cargar();
      a.hidden = true;
    };
  }
  cargar();
}

// ---------- Datos y filtros ----------
async function cargarResumen() {
  pintarKpis(await api('/api/resumen?' + qs({ anio: filtros.anio, trimestre: filtros.trimestre })));
}
async function cargar() {
  [docs] = await Promise.all([api('/api/documentos?' + qs(filtros)), cargarResumen()]);
  pintarTabla();
}

function sincronizarFiltros() {
  const anios = new Set([hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2, hoy.getFullYear() - 3, filtros.anio]);
  $('#f-anio').innerHTML = [...anios].sort((a, b) => b - a).map((a) => `<option ${a === filtros.anio ? 'selected' : ''}>${a}</option>`).join('');
  $('#f-trimestre').value = filtros.trimestre;
  $('#f-flujo').value = filtros.flujo;
  $('#f-categoria').value = filtros.categoria;
  $('#f-estado').value = filtros.estado;
}

let t;
const ids = { 'f-anio': 'anio', 'f-trimestre': 'trimestre', 'f-flujo': 'flujo', 'f-categoria': 'categoria', 'f-estado': 'estado', 'f-q': 'q' };
for (const [id, k] of Object.entries(ids)) {
  $('#' + id).addEventListener('input', (e) => {
    filtros[k] = k === 'anio' ? +e.target.value : e.target.value;
    clearTimeout(t);
    t = setTimeout(cargar, k === 'q' ? 250 : 0);
  });
}

$('#btn-export').addEventListener('click', async () => {
  const r = await api('/api/resumen?' + qs({ anio: filtros.anio }));
  if (r.pendientesRevision && !confirm(`Hay ${r.pendientesRevision} documento(s) pendientes de revisión. Se exportarán marcados en amarillo y aparecerán en la pestaña de incidencias. ¿Exportar igualmente?`)) return;
  location.href = '/api/export?' + qs({ anio: filtros.anio });
});

(async function init() {
  const cfg = await api('/api/config');
  CATS = cfg.categorias;
  $('#f-categoria').innerHTML += CATS.map((c) => `<option>${esc(c)}</option>`).join('');
  const modo = $('#modo');
  if (cfg.mock) { modo.hidden = false; modo.textContent = 'MODO DEMO · datos de ejemplo, sin IA'; }
  else if (!cfg.tieneClave) { modo.hidden = false; modo.textContent = 'Falta ANTHROPIC_API_KEY en .env'; }
  sincronizarFiltros();
  await cargar();
})();
