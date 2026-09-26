// 든든 도우미 오프라인 지원: 앱 화면은 미리 저장, 글자 인식 도구는 처음 쓸 때 저장
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'words.js', 'connect.html', 'vendor/qrcode.mjs', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // 알림 보내기(POST)는 그대로 통과
  const url = new URL(req.url);

  // 글자 인식 도구(CDN): 한 번 받으면 저장해 두고 계속 씀 → 다음부터는 인터넷 없이도 읽기 가능
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

  // 우리 사이트 파일: 인터넷이 되면 새 버전, 안 되면 저장해 둔 것
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  }
});
