/* 逸云阁工作台 Service Worker — network-first，离线可用 */
const CACHE_NAME = 'yiyunge-v2.1.0';
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
  // 页面请求带 ?v=1.9.6 查询串，而预缓存的是裸路径。把查询串剥离后的 URL 作为缓存键，
  // 才能让预缓存（./js/app.js）命中带 ?v= 的请求，避免在装到主屏后离线首开时把
  // ./index.html 当 JS 返回导致脚本全线崩溃。
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 不拦截跨域（如 xlsx CDN 不会进这里）
  const cacheKey = url.search ? url.origin + url.pathname : req.url;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
      }
      return res;
    }).catch(() =>
      caches.match(cacheKey)
        .then(hit => hit || caches.match('./index.html'))
        .then(hit => hit || caches.match('./'))
    )
  );
});
