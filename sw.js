// 진료실 도우미 오프라인 지원: 앱 화면을 미리 저장해 두고, 인터넷이 없어도 열리게 함
const VERSION = 'clinic-v7';
const RUNTIME = 'ocr-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'scan.js', 'drugs.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // 예전 '든든 도우미' 저장본 등 지난 캐시는 지움
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 글자 읽기 도구: 한 번 받으면 저장해 두고 계속 씀 (다음부터 인터넷 없이도 읽기)
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // 인터넷이 되면 새 버전, 안 되면 저장해 둔 것
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
