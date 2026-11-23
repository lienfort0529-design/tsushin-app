// アプリの画面をスマホに保存して、電波が弱くても開けるようにする（住宅設備アプリと同じ作り）。
// 画面はネットを優先（更新がすぐ反映される）、つながらないときだけ保存した画面を使う。データ（Apps Script）は保存しない
const CACHE = 'tsushin-v7';
const FILES = ['./', 'index.html', 'app.js', 'app.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'logo-mark.png', 'logo-text.png',
  'visit.html', 'visit.css', 'visit.js', 'visit-sync.js', 'calc.html', 'calc.css', 'calc.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.url.includes('script.google') || !req.url.startsWith(self.location.origin)) return;
  // ブラウザの保存（GitHub Pages は10分）を使わず、毎回サーバーに新しい画面があるか確かめる
  e.respondWith(fetch(req.url, { cache: 'no-cache' }).then(r => r.redirected ? fetch(req) : r).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
