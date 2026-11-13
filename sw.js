// Service worker: guarda los archivos de la app para que funcione sin conexión.
const CACHE = 'agua-piso-v1';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'calc.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
// Primero intenta la red (para tener siempre la última versión) y si no hay conexión usa la copia guardada.
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request))));
