import { computeSplit, allWashExtras, blockRange, dayNumber } from './calc.js';
import {
  isShared, createLocalStore, createFirebaseStore, createPiso, pisoExists,
  getPisoId, setPisoId, parsePisoInput, loadLocalData,
} from './store.js';

// ---------- Utilidades ----------
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
let store = null;           // se crea en boot()
let activeTab = 'calendar';
const S = () => store.state;

// ---------- Pestañas ----------
function showTab(name) {
  activeTab = name;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $('tabbar').hidden = name === 'join';
  render();
}
document.querySelectorAll('.tabbar button').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

function render() {
  if (!store) return;
  if (activeTab === 'calendar') renderCalendar();
  if (activeTab === 'bill') renderBillTab();
  if (activeTab === 'settings') renderSettings();
}

// ---------- Calendario ----------
// Los botones se crean solo cuando cambia el mes / el día / los nombres. Si solo llegan datos nuevos
// (de otro móvil), se actualizan los números sin rehacer los botones: así no se pierde un toque
// que esté a medias justo cuando llega una actualización.
let calendarKey = '', dayKey = '';

function renderCalendar() {
  const first = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const key = `${viewYear}-${viewMonth}`;
  if (key !== calendarKey) {
    calendarKey = key;
    $('month-title').textContent = first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const offset = (first.getDay() + 6) % 7; // lunes = 0
    let html = '<div class="day empty"></div>'.repeat(offset);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
      html += `<button class="day" data-date="${ds}"><span>${d}</span><span class="marks"></span></button>`;
    }
    $('calendar').innerHTML = html;
  }
  const extras = allWashExtras(S().entries, S().people, S().settings);
  $('calendar').querySelectorAll('.day[data-date]').forEach(btn => {
    const ds = btn.dataset.date;
    const x = Object.values(extras).reduce((a, byDate) => a + (byDate[ds] || 0), 0);
    const e = S().entries[ds] || {};
    const g = Object.values(e.guests || {}).reduce((a, b) => a + b, 0);
    const w = Object.values(e.washes || {}).reduce((a, b) => a + b, 0);
    const marks = '<span class="dot guest"></span>'.repeat(Math.min(g, 5)) +
      '<span class="dot wash"></span>'.repeat(Math.min(w - x, 5)) + '<span class="dot extra"></span>'.repeat(Math.min(x, 5));
    const m = btn.querySelector('.marks');
    if (m.innerHTML !== marks) m.innerHTML = marks;
    btn.classList.toggle('today', ds === today);
    btn.classList.toggle('selected', ds === selected);
  });
  renderDay(extras);
}
$('calendar').addEventListener('click', ev => {
  const btn = ev.target.closest('.day[data-date]');
  if (btn) { selected = btn.dataset.date; renderCalendar(); }
});

function renderDay(extras) {
  const key = selected + '|' + S().people.map(p => p.id + p.name).join('|');
  if (key !== dayKey) {
    dayKey = key;
    $('day-title').textContent = fmtLong(selected);
    const stepper = (p, k, icon, title) => `<span class="stepper ${k === 'guests' ? 'guest' : 'wash'}" title="${title}">${icon}
        <button data-p="${p.id}" data-k="${k}" data-d="-1" aria-label="Quitar">−</button>
        <span class="val" data-val="${p.id}-${k}">0</span>
        <button data-p="${p.id}" data-k="${k}" data-d="1" aria-label="Añadir">+</button></span>`;
    $('day-people').innerHTML = S().people.map(p => `
      <div class="person">
        <span class="pname">${esc(p.name)}</span>
        ${stepper(p, 'guests', '🏠', 'Noches de visita')}
        ${stepper(p, 'washes', '🧺', 'Lavadoras')}
      </div>`).join('');
  }
  const e = S().entries[selected] || {};
  $('day-people').querySelectorAll('[data-val]').forEach(el => {
    const [pid, k] = el.dataset.val.split('-');
    el.textContent = e[k]?.[pid] || 0;
    el.classList.toggle('over', k === 'washes' && !!extras[pid]?.[selected]);
  });

  // Resumen: lavadoras de cada persona en el bloque de N días al que pertenece el día seleccionado
  const { freeWashes: free, windowDays: days, blockStart } = S().settings;
  const [bFrom, bTo] = blockRange(selected, blockStart, days);
  const counts = Object.fromEntries(S().people.map(p => [p.id, 0]));
  for (const [date, entry] of Object.entries(S().entries)) {
    if (date >= bFrom && date <= bTo) for (const [pid, c] of Object.entries(entry.washes || {})) if (pid in counts) counts[pid] += c;
  }
  const short = s => fromStr(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  $('window-title').textContent = `Lavadoras en este bloque de ${days} días (${short(bFrom)} – ${short(bTo)})`;
  $('week-summary').innerHTML = S().people.map(p =>
    `<span class="chip ${counts[p.id] > free ? 'over' : ''}">${esc(p.name)}: ${counts[p.id]}/${free}</span>`).join('');
}
// Un solo "escuchador" para todos los botones + / − (delegación de eventos)
$('day-people').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-k]');
  if (b) store.change(selected, b.dataset.k, b.dataset.p, Number(b.dataset.d));
});

$('prev-month').addEventListener('click', () => { if (--viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar(); });
$('next-month').addEventListener('click', () => { if (++viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar(); });

// ---------- Factura ----------
let shownBill = null; // { bill, result, saved }

function renderBillTab() {
  // Propuesta de fechas: desde el día siguiente a la última factura (o hace 3 meses) hasta hoy
  if (!$('bill-from').value) {
    const last = S().bills[0];
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    $('bill-from').value = last ? addDays(last.to, 1) : toStr(d);
    $('bill-to').value = today;
  }
  renderHistory();
}

function showResult(bill, result, saved) {
  shownBill = { bill, result, saved };
  const s = bill.settings || S().settings;
  const r = result;
  $('bill-result').innerHTML = `<div class="card">
    <h3>Reparto ${fmtShort(bill.from)} – ${fmtShort(bill.to)}</h3>
    <table>
      <tr><th>Persona</th><th>🏠</th><th>🧺 (extra)</th><th>Paga</th></tr>
      ${r.rows.map(x => `<tr><td>${esc(x.name)}</td><td>${x.guestNights}</td><td>${x.washes} (${x.extraWashes})</td>
        <td class="total">${eur(x.total)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td></td><td></td><td class="total">${eur(r.total)}</td></tr>
    </table>
    <h4>¿Cómo se ha calculado?</h4>
    <p class="small muted">1) Visitas: ${eur(s.guestCost)} por noche → suman ${eur(r.guestTotal)}, que paga quien tuvo la visita.<br>
    2) El resto (${eur(r.rest)}) se reparte entre ${r.rows.length}. En cada bloque de ${s.windowDays} días, cada lavadora a partir de la ${s.freeWashes + 1}ª
    (las naranjas del calendario) suma un ${s.extraWashPct}% a la parte de quien la puso.</p>
    ${r.rows.filter(x => x.guestNights || x.extraWashes).map(x =>
      `<p class="small">• <b>${esc(x.name)}</b>: ${eur(x.baseAmount)} de parte base${x.guestNights ? ` + ${eur(x.guestAmount)} por ${x.guestNights} noche(s) de visita` : ''}${x.extraWashes ? ` (incluye +${eur(x.laundryDiff)} por ${x.extraWashes} lavadora(s) extra)` : ''}.</p>`).join('')}
    ${saved ? '' : '<button id="save-bill" class="primary">Guardar factura</button>'}
  </div>`;
  if (!saved) $('save-bill').addEventListener('click', () => {
    store.addBill({ id: Date.now(), ...bill, settings: { ...S().settings }, result });
    showResult(bill, result, true);
  });
}

$('calc-btn').addEventListener('click', () => {
  const from = $('bill-from').value, to = $('bill-to').value, total = parseFloat($('bill-total').value);
  if (!from || !to || dayNumber(from) > dayNumber(to)) return alert('Revisa las fechas.');
  if (!(total > 0)) return alert('Introduce el importe de la factura.');
  const bill = { from, to, total };
  showResult(bill, computeSplit({ ...S(), ...bill }), false);
});

function renderHistory() {
  if (!S().bills.length) { $('bill-history').innerHTML = '<p class="muted">Aún no hay facturas guardadas.</p>'; return; }
  $('bill-history').innerHTML = S().bills.map(b => `
    <div class="history-item">
      <span>${fmtShort(b.from)} – ${fmtShort(b.to)}<br><b>${eur(b.total)}</b></span>
      <span class="row" style="flex:0 0 auto"><button data-view="${b.id}">Ver</button><button data-del="${b.id}">🗑</button></span>
    </div>`).join('');
  $('bill-history').querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
    const b = S().bills.find(x => x.id == btn.dataset.view);
    showResult(b, b.result, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  $('bill-history').querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
    if (confirm('¿Borrar esta factura del historial? (se borrará para todas)')) store.deleteBill(btn.dataset.del);
  }));
}

// ---------- Ajustes ----------
const shareUrl = () => `${location.origin}${location.pathname}?piso=${store.pisoId}`;

function renderSettings() {
  // No tocar el campo que la persona está escribiendo, aunque lleguen cambios de otro móvil
  const focused = document.activeElement;
  $('names').innerHTML = S().people.map((p, i) =>
    `<label>Persona ${i + 1}<input type="text" data-pid="${p.id}" value="${esc(p.name)}" maxlength="20"></label>`).join('');
  if (focused?.dataset?.pid) {
    const again = $('names').querySelector(`[data-pid="${focused.dataset.pid}"]`);
    again.value = focused.value; again.focus();
  }
  $('names').querySelectorAll('input').forEach(inp => inp.addEventListener('change', () =>
    store.setPersonName(inp.dataset.pid, inp.value.trim() || 'Sin nombre')));
  for (const [id, key] of [...SETTING_FIELDS, ['set-start', 'blockStart']]) if (document.activeElement !== $(id)) $(id).value = S().settings[key];

  $('share-card').hidden = store.mode !== 'shared';
  if (store.mode === 'shared') $('share-link').value = shareUrl();
  $('reset-btn').textContent = store.mode === 'shared' ? 'Borrar todos los datos del piso (para todas)' : 'Borrar todos los datos';
}
const SETTING_FIELDS = [['set-guest', 'guestCost'], ['set-free', 'freeWashes'], ['set-days', 'windowDays'], ['set-pct', 'extraWashPct']];
// Fecha en la que empieza el primer bloque de días
$('set-start').addEventListener('change', () => { if ($('set-start').value) store.setSetting('blockStart', $('set-start').value); });
SETTING_FIELDS.forEach(([id, key]) => $(id).addEventListener('change', () => {
  const v = parseFloat($(id).value);
  if (v >= 0) store.setSetting(key, v);
}));

$('share-btn').addEventListener('click', async () => {
  const url = shareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: 'Agua del Piso', text: 'Únete a nuestro piso en la app del agua:', url }); return; } catch {}
  }
  try { await navigator.clipboard.writeText(url); alert('Enlace copiado. Pégalo en el grupo del piso.'); }
  catch { $('share-link').select(); }
});
$('leave-btn').addEventListener('click', () => {
  if (!confirm('Este móvil dejará de ver el piso (los datos NO se borran). Para volver necesitarás el enlace. ¿Salir?')) return;
  setPisoId(null);
  location.reload();
});

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(S(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `agua-piso-${today}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('import-file').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!Array.isArray(data.people) || typeof data.entries !== 'object') throw new Error();
  } catch { return alert('El archivo no es válido.'); }
  if (!confirm('Esto sustituirá TODOS los datos por los del archivo. ¿Continuar?')) return;
  try { await store.importAll(data); alert('Datos importados.'); } catch { alert('No se pudo importar. ¿Hay conexión?'); }
});
$('reset-btn').addEventListener('click', async () => {
  if (!confirm('¿Seguro? Se borrarán calendario, facturas y nombres' + (store.mode === 'shared' ? ' para TODAS las personas del piso.' : '.'))) return;
  try { await store.resetAll(); } catch { alert('No se pudo borrar. ¿Hay conexión?'); }
});

// ---------- Estado de sincronización ----------
const STATUS = {
  local: '', synced: '☁️ Sincronizado', pending: '⏳ Sincronizando…',
  offline: '📴 Sin conexión', error: '⚠️ Error de conexión',
};

// ---------- Crear / unirse a un piso ----------
async function enterPiso(id) {
  setPisoId(id);
  store = await createFirebaseStore(id);
  store.onChange(render);
  store.onStatus(s => { $('sync-status').textContent = STATUS[s] ?? ''; });
  showTab('calendar');
}

$('create-piso').addEventListener('click', async () => {
  const btn = $('create-piso');
  const local = loadLocalData();
  const hasLocal = Object.keys(local.entries).length || local.bills.length;
  const upload = hasLocal && confirm('Este móvil ya tiene datos apuntados. ¿Quieres subirlos al piso nuevo?');
  btn.disabled = true; btn.textContent = 'Creando…';
  try {
    await enterPiso(await createPiso(upload ? local : undefined));
    showTab('settings'); // para que vea enseguida el enlace para compartir
  } catch (e) {
    console.error(e);
    alert('No se pudo crear el piso. Comprueba la conexión.');
  } finally { btn.disabled = false; btn.textContent = 'Crear un piso nuevo'; }
});

$('join-piso').addEventListener('click', async () => {
  const id = parsePisoInput($('join-input').value);
  $('join-error').textContent = '';
  if (!id) { $('join-error').textContent = 'Ese enlace o código no es válido.'; return; }
  try {
    if (!(await pisoExists(id))) { $('join-error').textContent = 'No existe ningún piso con ese código.'; return; }
    await enterPiso(id);
  } catch (e) {
    console.error(e);
    $('join-error').textContent = 'No se pudo comprobar el piso. ¿Hay conexión?';
  }
});

// ---------- Inicio ----------
async function boot() {
  if (!isShared) {
    store = createLocalStore();
    store.onChange(render);
    showTab('calendar');
    return;
  }
  $('backup-help').textContent = 'Los datos están en la nube, pero puedes exportar una copia de seguridad.';

  // ¿Han abierto un enlace de invitación (?piso=...)?
  const params = new URLSearchParams(location.search);
  const invited = parsePisoInput(params.get('piso') ? '?piso=' + params.get('piso') : '');
  if (invited) history.replaceState(null, '', location.pathname);
  let id = getPisoId();
  if (invited && invited !== id && (!id || confirm('Has abierto el enlace de otro piso. ¿Cambiar a ese piso?'))) id = invited;

  if (id) {
    try { await enterPiso(id); return; } catch (e) { console.error(e); }
  }
  showTab('join');
}

boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
