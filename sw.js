// Service worker: guarda los archivos de la app (y la librería de Firebase) para que se abra sin conexión.
// Las conexiones con la base de datos NO pasan por aquí: Firestore ya tiene su propia caché offline.
const CACHE = 'agua-piso-v2';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'calc.js', 'store.js', 'firebase-config.js',
  'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const ours = url.origin === self.location.origin || url.host === 'www.gstatic.com';
  if (e.request.method !== 'GET' || !ours) return; // lo demás va directo a internet
  // Primero la red (para tener la última versión) y, si no hay conexión, la copia guardada.
  e.respondWith(fetch(e.request)
    .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
