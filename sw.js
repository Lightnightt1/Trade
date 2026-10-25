const CACHE = 'tradeglass-shell-v3';
const SHELL = ['./', './index.html', './styles.css', './theme-monochrome.css', './app.js', './config.js', './manifest.webmanifest', './icon-192.png'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(fetch(req).then(res => {if (res.ok) {const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));} return res;}).catch(() => caches.match(req)));
});
