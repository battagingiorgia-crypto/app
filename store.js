// Capa de datos. La interfaz (app.js) solo habla con un "store", que puede ser:
//  - local:     datos guardados solo en este móvil (localStorage)
//  - compartido: datos en Firebase Firestore, sincronizados entre todos los móviles del piso
import { firebaseConfig, emulatorHost } from './firebase-config.js';

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const DEFAULT = {
  people: [1, 2, 3, 4, 5].map(i => ({ id: 'p' + i, name: 'Persona ' + i })),
  // blockStart: día 1 del mes en que se empieza a usar la app (se puede cambiar en Ajustes)
  settings: { guestCost: 0.4, freeWashes: 2, windowDays: 9, extraWashPct: 2, blockStart: firstOfMonth() },
  entries: {},   // { "2026-11-13": { guests: { p1: 1 }, washes: { p3: 1 } } }
  bills: [],     // facturas guardadas (la más reciente primero)
};
export const isShared = !!firebaseConfig;

const LOCAL_KEY = 'agua-piso-v1';
const PISO_KEY = 'agua-piso-id';
const FB = 'https://www.gstatic.com/firebasejs/11.0.2/';

// ---------- Recordar en qué piso está este móvil ----------
export const getPisoId = () => { try { return localStorage.getItem(PISO_KEY); } catch { return null; } };
export const setPisoId = id => { try { id ? localStorage.setItem(PISO_KEY, id) : localStorage.removeItem(PISO_KEY); } catch {} };

/** Código aleatorio de 20 caracteres: imposible de adivinar, hace de "contraseña" del piso. */
export function newPisoId() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), b => abc[b % abc.length]).join('');
}

/** Acepta un código o un enlace completo con ?piso=... y devuelve solo el código. */
export function parsePisoInput(text) {
  const t = text.trim();
  const m = t.match(/[?&]piso=([A-Za-z0-9]+)/);
  const id = m ? m[1] : t;
  return /^[A-Za-z0-9]{20,}$/.test(id) ? id : null;
}

/** Quita contadores a 0 o negativos (pueden quedar tras restar). */
function cleanDay(d) {
  const out = {};
  for (const k of ['guests', 'washes']) {
    const b = Object.fromEntries(Object.entries(d[k] || {}).filter(([, v]) => v > 0));
    if (Object.keys(b).length) out[k] = b;
  }
  return out;
}

// Pequeño "emisor de eventos" compartido por los dos stores
function emitter() {
  const subs = { change: [], status: [] };
  return {
    on: (ev, cb) => subs[ev].push(cb),
    emit: (ev, v) => subs[ev].forEach(cb => cb(v)),
  };
}

// ======================= STORE LOCAL =======================
/** Completa los datos con los valores por defecto (p. ej. reglas nuevas que no existían antes). */
function withDefaults(data) {
  const base = structuredClone(DEFAULT);
  return { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
}

export function loadLocalData() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return withDefaults(JSON.parse(raw));
  } catch {}
  return structuredClone(DEFAULT);
}

export function createLocalStore() {
  const ev = emitter();
  let state = loadLocalData();
  const commit = () => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch {} ev.emit('change', state); };
  // Guardar ya al empezar, para fijar la fecha de inicio de los bloques (si no, cambiaría cada mes)
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch {}
  return {
    mode: 'local',
    get state() { return state; },
    onChange: cb => ev.on('change', cb),
    onStatus: cb => { ev.on('status', cb); cb('local'); },
    change(date, kind, pid, delta) {
      const e = state.entries[date] ||= {};
      const b = e[kind] ||= {};
      b[pid] = Math.max(0, (b[pid] || 0) + delta);
      state.entries[date] = cleanDay(e);
      if (!Object.keys(state.entries[date]).length) delete state.entries[date];
      commit();
    },
    setPersonName(pid, name) { state.people.find(p => p.id === pid).name = name; commit(); },
    setSetting(key, value) { state.settings[key] = value; commit(); },
    addBill(bill) { state.bills.unshift(bill); commit(); },
    deleteBill(id) { state.bills = state.bills.filter(b => b.id != id); commit(); },
    importAll(data) { state = withDefaults(data); commit(); },
    resetAll() { state = structuredClone(DEFAULT); commit(); },
  };
}

// ======================= STORE COMPARTIDO (Firebase) =======================
let fbCache = null;
async function firebase() {
  if (fbCache) return fbCache;
  const [appMod, fs] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js')]);
  const app = appMod.initializeApp(firebaseConfig);
  // Caché persistente: la app funciona sin conexión y sube los cambios cuando vuelve internet.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  if (emulatorHost) { const [h, p] = emulatorHost.split(':'); fs.connectFirestoreEmulator(db, h, Number(p)); }
  return (fbCache = { fs, db });
}

/** Escribe muchos documentos en tandas (Firestore admite hasta 500 operaciones por tanda). */
async function writeInBatches(fs, db, ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = fs.writeBatch(db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
}

function uploadOps(fs, pisoRef, data) {
  const ops = [];
  for (const [date, day] of Object.entries(data.entries || {})) {
    const clean = cleanDay(day);
    if (Object.keys(clean).length) ops.push(b => b.set(fs.doc(pisoRef, 'days', date), clean));
  }
  for (const bill of data.bills || []) ops.push(b => b.set(fs.doc(pisoRef, 'bills', String(bill.id)), bill));
  return ops;
}

/** Crea un piso nuevo en la nube (opcionalmente con los datos que ya había en el móvil). */
export async function createPiso(initial = DEFAULT) {
  const { fs, db } = await firebase();
  const id = newPisoId();
  const pisoRef = fs.doc(db, 'pisos', id);
  await fs.setDoc(pisoRef, { people: initial.people, settings: initial.settings, createdAt: fs.serverTimestamp() });
  await writeInBatches(fs, db, uploadOps(fs, pisoRef, initial));
  return id;
}

/** Comprueba que un piso existe (necesita conexión). */
export async function pisoExists(id) {
  const { fs, db } = await firebase();
  return (await fs.getDocFromServer(fs.doc(db, 'pisos', id))).exists();
}

export async function createFirebaseStore(pisoId) {
  const { fs, db } = await firebase();
  const ev = emitter();
  const pisoRef = fs.doc(db, 'pisos', pisoId);
  const state = structuredClone(DEFAULT);
  const pending = { piso: false, days: false, bills: false };
  let loaded = 0;

  const status = () => ev.emit('status',
    !navigator.onLine ? 'offline' : Object.values(pending).some(Boolean) ? 'pending' : 'synced');
  addEventListener('online', status);
  addEventListener('offline', status);

  const fail = err => { console.error(err); ev.emit('status', 'error'); };
  const listen = (ref, key, apply) => fs.onSnapshot(ref, { includeMetadataChanges: true }, snap => {
    apply(snap);
    pending[key] = snap.metadata.hasPendingWrites;
    if (loaded < 3 && !snap.metadata.fromCache) loaded++;
    ev.emit('change', state);
    status();
  }, fail);

  listen(pisoRef, 'piso', snap => {
    const d = snap.data();
    if (!d) return;
    state.people = d.people || DEFAULT.people;
    state.settings = { ...DEFAULT.settings, ...d.settings };
  });
  listen(fs.collection(pisoRef, 'days'), 'days', snap => {
    state.entries = {};
    snap.forEach(doc => {
      const clean = cleanDay(doc.data());
      if (Object.keys(clean).length) state.entries[doc.id] = clean;
    });
  });
  listen(fs.query(fs.collection(pisoRef, 'bills'), fs.orderBy('id', 'desc')), 'bills', snap => {
    state.bills = snap.docs.map(d => d.data());
  });

  // Las escrituras NO se esperan (await): Firestore actualiza la pantalla al momento
  // y las envía al servidor en segundo plano, aunque no haya conexión.
  const run = p => p.catch(fail);

  return {
    mode: 'shared',
    pisoId,
    get state() { return state; },
    onChange: cb => ev.on('change', cb),
    onStatus: cb => ev.on('status', cb),
    change(date, kind, pid, delta) {
      const current = state.entries[date]?.[kind]?.[pid] || 0;
      if (delta < 0 && current <= 0) return;
      // increment() suma en el servidor: si dos personas pulsan a la vez, no se pierde ninguna.
      run(fs.setDoc(fs.doc(pisoRef, 'days', date), { [kind]: { [pid]: fs.increment(delta) } }, { merge: true }));
    },
    setPersonName(pid, name) {
      run(fs.updateDoc(pisoRef, { people: state.people.map(p => p.id === pid ? { ...p, name } : p) }));
    },
    setSetting(key, value) { run(fs.updateDoc(pisoRef, { ['settings.' + key]: value })); },
    addBill(bill) { run(fs.setDoc(fs.doc(pisoRef, 'bills', String(bill.id)), bill)); },
    deleteBill(id) { run(fs.deleteDoc(fs.doc(pisoRef, 'bills', String(id)))); },
    async importAll(data) {
      await this.resetAll();
      await fs.updateDoc(pisoRef, { people: data.people, settings: { ...DEFAULT.settings, ...data.settings } });
      await writeInBatches(fs, db, uploadOps(fs, pisoRef, data));
    },
    async resetAll() {
      const ops = [
        ...Object.keys(state.entries).map(date => b => b.delete(fs.doc(pisoRef, 'days', date))),
        ...state.bills.map(bill => b => b.delete(fs.doc(pisoRef, 'bills', String(bill.id)))),
        b => b.update(pisoRef, { people: DEFAULT.people, settings: DEFAULT.settings }),
      ];
      await writeInBatches(fs, db, ops);
    },
  };
}
