// Service worker：殼（HTML／CSS／JS／圖示）版本化預先快取；資料（本機 api/* 或 Apps Script 代理）network-first，
// 離線時用最後一次成功的回應（只存在使用者自己的裝置）。改了任何殼檔就要把 VERSION 加一（舊殼快取在 activate 時刪掉）。
const VERSION = '2.1.0';
const SHELL_CACHE = `mrt-shell-${VERSION}`;
const DATA_CACHE = 'mrt-data-v1';

const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/tour.js', 'js/zhconv.js', 'js/zh/t2s.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];
const SHELL_URLS = new Set(SHELL.map(p => new URL(p, self.registration.scope).href));
const API_BASE = new URL('api/', self.registration.scope).href;
const isProxy = (url) => url.hostname === 'script.google.com' && /\/macros\/s\/[\w-]+\/exec$/.test(url.pathname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL.map(p => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mrt-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isProxy(url) || url.href.startsWith(API_BASE)) { e.respondWith(networkFirst(e, req)); return; }
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await fetch(req); } catch { return (await caches.open(SHELL_CACHE).then(c => c.match('index.html'))) || Response.error(); }
    })());
    return;
  }
  const clean = url.origin + url.pathname;
  if (SHELL_URLS.has(clean)) e.respondWith(caches.open(SHELL_CACHE).then(c => c.match(clean)).then(r => r || fetch(req)));
});

async function networkFirst(e, req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) e.waitUntil(cache.put(req, res.clone()).catch(() => {}));
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
