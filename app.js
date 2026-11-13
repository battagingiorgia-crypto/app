import { computeSplit, weekKey, dayNumber } from './calc.js';

// ---------- Datos (guardados en el móvil con localStorage) ----------
const KEY = 'agua-piso-v1';
const DEFAULT = {
  people: [1, 2, 3, 4, 5].map(i => ({ id: 'p' + i, name: 'Persona ' + i })),
  settings: { guestCost: 0.4, freeWashesPerWeek: 2, extraWashPct: 1 },
  entries: {},   // { "2026-11-13": { guests: { p1: 1 }, washes: { p3: 1 } } }
  bills: [],     // facturas guardadas
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...structuredClone(DEFAULT), ...JSON.parse(raw) };
  } catch (e) { /* datos corruptos o almacenamiento bloqueado */ }
  return structuredClone(DEFAULT);
}
let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

// ---------- Utilidades de fecha ----------
const pad = n => String(n).padStart(2, '0');
const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = fromStr(s); d.setDate(d.getDate() + n); return toStr(d); };
const fmtLong = s => fromStr(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = s => fromStr(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const eur = n => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);

const today = toStr(new Date());
let selected = today;
let viewYear = new Date().getFullYear(), viewMonth = new Date().getMonth();

// ---------- Pestañas ----------
document.querySelectorAll('.tabbar button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
  if (btn.dataset.tab === 'calendar') renderCalendar();
  if (btn.dataset.tab === 'bill') renderBillTab();
  if (btn.dataset.tab === 'settings') renderSettings();
}));

// ---------- Calendario ----------
function renderCalendar() {
  const first = new Date(viewYear, viewMonth, 1);
  $('month-title').textContent = first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  let html = '<div class="day empty"></div>'.repeat(offset);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
    const e = state.entries[ds] || {};
    const g = Object.values(e.guests || {}).reduce((a, b) => a + b, 0);
    const w = Object.values(e.washes || {}).reduce((a, b) => a + b, 0);
    const marks = '<span class="dot guest"></span>'.repeat(Math.min(g, 5)) + '<span class="dot wash"></span>'.repeat(Math.min(w, 5));
    const cls = ['day', ds === today && 'today', ds === selected && 'selected'].filter(Boolean).join(' ');
    html += `<button class="${cls}" data-date="${ds}"><span>${d}</span><span class="marks">${marks}</span></button>`;
  }
  $('calendar').innerHTML = html;
  $('calendar').querySelectorAll('.day[data-date]').forEach(b =>
    b.addEventListener('click', () => { selected = b.dataset.date; renderCalendar(); }));
  renderDay();
}

function renderDay() {
  $('day-title').textContent = fmtLong(selected);
  const e = state.entries[selected] || {};
  $('day-people').innerHTML = state.people.map(p => `
    <div class="person">
      <span class="pname">${esc(p.name)}</span>
      <span class="stepper guest" title="Noches de visita">🏠
        <button data-p="${p.id}" data-k="guests" data-d="-1">−</button>
        <span class="val">${e.guests?.[p.id] || 0}</span>
        <button data-p="${p.id}" data-k="guests" data-d="1">+</button></span>
      <span class="stepper wash" title="Lavadoras">🧺
        <button data-p="${p.id}" data-k="washes" data-d="-1">−</button>
        <span class="val">${e.washes?.[p.id] || 0}</span>
        <button data-p="${p.id}" data-k="washes" data-d="1">+</button></span>
    </div>`).join('');
  $('day-people').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    change(selected, b.dataset.k, b.dataset.p, Number(b.dataset.d));
  }));

  // Resumen semanal de lavadoras (lunes-domingo de la semana seleccionada)
  const monday = weekKey(selected);
  const counts = Object.fromEntries(state.people.map(p => [p.id, 0]));
  for (let i = 0; i < 7; i++) {
    const w = state.entries[addDays(monday, i)]?.washes || {};
    for (const [pid, c] of Object.entries(w)) if (pid in counts) counts[pid] += c;
  }
  const free = state.settings.freeWashesPerWeek;
  $('week-summary').innerHTML = state.people.map(p =>
    `<span class="chip ${counts[p.id] > free ? 'over' : ''}">${esc(p.name)}: ${counts[p.id]}/${free}</span>`).join('');
}

function change(date, kind, pid, delta) {
  const e = state.entries[date] ||= {};
  const bucket = e[kind] ||= {};
  bucket[pid] = Math.max(0, (bucket[pid] || 0) + delta);
  if (!bucket[pid]) delete bucket[pid];
  if (!Object.keys(bucket).length) delete e[kind];
  if (!Object.keys(e).length) delete state.entries[date];
  save();
  renderCalendar();
}

$('prev-month').addEventListener('click', () => { if (--viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); });
$('next-month').addEventListener('click', () => { if (++viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); });

// ---------- Factura ----------
let lastResult = null;

function renderBillTab() {
  // Propuesta de fechas: desde el día siguiente a la última factura (o hace 3 meses) hasta hoy
  if (!$('bill-from').value) {
    const last = state.bills[0];
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    $('bill-from').value = last ? addDays(last.to, 1) : toStr(d);
    $('bill-to').value = today;
  }
  renderHistory();
}

function resultHtml(r, bill, saved) {
  const s = state.settings;
  return `<div class="card">
    <h3>Reparto ${fmtShort(bill.from)} – ${fmtShort(bill.to)}</h3>
    <table>
      <tr><th>Persona</th><th>🏠</th><th>🧺 (extra)</th><th>Paga</th></tr>
      ${r.rows.map(x => `<tr><td>${esc(x.name)}</td><td>${x.guestNights}</td><td>${x.washes} (${x.extraWashes})</td>
        <td class="total">${eur(x.total)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td></td><td></td><td class="total">${eur(r.total)}</td></tr>
    </table>
    <h4>¿Cómo se ha calculado?</h4>
    <p class="small muted">1) Visitas: ${eur(s.guestCost)} por noche → suman ${eur(r.guestTotal)}, que paga quien tuvo la visita.<br>
    2) El resto (${eur(r.rest)}) se reparte entre ${r.rows.length}. Quien hizo más de ${s.freeWashesPerWeek} lavadoras en una semana
    paga un ${s.extraWashPct}% más que la parte normal por cada lavadora extra.</p>
    ${r.rows.filter(x => x.guestNights || x.extraWashes).map(x =>
      `<p class="small">• <b>${esc(x.name)}</b>: ${eur(x.baseAmount)} de parte base${x.guestNights ? ` + ${eur(x.guestAmount)} por ${x.guestNights} noche(s) de visita` : ''}${x.extraWashes ? ` (incluye +${eur(x.laundryDiff)} por ${x.extraWashes} lavadora(s) extra)` : ''}.</p>`).join('')}
    ${saved ? '' : '<button id="save-bill" class="primary">Guardar factura</button>'}
  </div>`;
}

$('calc-btn').addEventListener('click', () => {
  const from = $('bill-from').value, to = $('bill-to').value, total = parseFloat($('bill-total').value);
  if (!from || !to || dayNumber(from) > dayNumber(to)) return alert('Revisa las fechas.');
  if (!(total > 0)) return alert('Introduce el importe de la factura.');
  const bill = { from, to, total };
  lastResult = computeSplit({ ...state, ...bill });
  $('bill-result').innerHTML = resultHtml(lastResult, bill, false);
  $('save-bill').addEventListener('click', () => {
    state.bills.unshift({ id: Date.now(), ...bill, settings: { ...state.settings }, result: lastResult });
    save();
    $('bill-result').innerHTML = resultHtml(lastResult, bill, true);
    renderHistory();
  });
});

function renderHistory() {
  if (!state.bills.length) { $('bill-history').innerHTML = '<p class="muted">Aún no hay facturas guardadas.</p>'; return; }
  $('bill-history').innerHTML = state.bills.map(b => `
    <div class="history-item">
      <span>${fmtShort(b.from)} – ${fmtShort(b.to)}<br><b>${eur(b.total)}</b></span>
      <span class="row" style="flex:0 0 auto"><button data-view="${b.id}">Ver</button><button data-del="${b.id}">🗑</button></span>
    </div>`).join('');
  $('bill-history').querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
    const b = state.bills.find(x => x.id == btn.dataset.view);
    $('bill-result').innerHTML = resultHtml(b.result, b, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  $('bill-history').querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
    if (!confirm('¿Borrar esta factura del historial?')) return;
    state.bills = state.bills.filter(x => x.id != btn.dataset.del);
    save(); renderHistory();
  }));
}

// ---------- Ajustes ----------
function renderSettings() {
  $('names').innerHTML = state.people.map((p, i) =>
    `<label>Persona ${i + 1}<input type="text" data-pid="${p.id}" value="${esc(p.name)}" maxlength="20"></label>`).join('');
  $('names').querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
    state.people.find(p => p.id === inp.dataset.pid).name = inp.value.trim() || 'Sin nombre';
    save();
  }));
  $('set-guest').value = state.settings.guestCost;
  $('set-free').value = state.settings.freeWashesPerWeek;
  $('set-pct').value = state.settings.extraWashPct;
}
[['set-guest', 'guestCost'], ['set-free', 'freeWashesPerWeek'], ['set-pct', 'extraWashPct']].forEach(([id, key]) =>
  $(id).addEventListener('change', () => {
    const v = parseFloat($(id).value);
    if (v >= 0) { state.settings[key] = v; save(); }
  }));

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `agua-piso-${today}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('import-file').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.people) || typeof data.entries !== 'object') throw new Error();
    if (!confirm('Esto sustituirá los datos de este móvil por los del archivo. ¿Continuar?')) return;
    state = { ...structuredClone(DEFAULT), ...data };
    save(); renderSettings(); alert('Datos importados.');
  } catch { alert('El archivo no es válido.'); }
  ev.target.value = '';
});
$('reset-btn').addEventListener('click', () => {
  if (!confirm('¿Seguro? Se borrarán calendario, facturas y nombres.')) return;
  state = structuredClone(DEFAULT); save(); renderSettings();
});

// ---------- Inicio ----------
renderCalendar();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
