/* 逸云阁工作台 Service Worker — network-first，离线可用 */
const CACHE_NAME = 'yiyunge-v1.7.11';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './css/style.css',
  './js/utils.js',
  './js/store.js',
  './js/sync.js',
  './js/todo.js',
  './js/students.js',
  './js/teachers.js',
  './js/schedule.js',
  './js/finance.js',
  './js/html2canvas.min.js',
  './js/xlsx.full.min.js',
  './js/commission-import.js',
  './js/phrases.js',
  './js/calendar.js',
  './js/dashboard.js',
  './js/settings.js',
  './js/extra.js',
  './js/pwa.js',
  './js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    ).then(() => self.clients.claim())
  );
});

// network-first：优先联网，成功则刷新缓存；失败时从缓存读取（支持离线打开）
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
