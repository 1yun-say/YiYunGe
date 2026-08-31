/* 逸云阁工作台 Service Worker — app-shell 缓存优先（cache-first），离线可用、重复打开秒开 */
const CACHE_NAME = 'yiyunge-v2.6.6';
const VERSION = '2.6.6';
/* 预缓存应用骨架。注意：html2canvas.min.js / xlsx.full.min.js 不再预缓存——
 * 这两个大库改为「按需懒加载」（方法一），仅首次用到时由 fetch 处理缓存，避免冷启动白下载约 1MB。 */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './css/style.css?v=' + VERSION,
  './js/utils.js?v=' + VERSION,
  './js/store.js?v=' + VERSION,
  './js/sync.js?v=' + VERSION,
  './js/todo.js?v=' + VERSION,
  './js/students.js?v=' + VERSION,
  './js/teachers.js?v=' + VERSION,
  './js/schedule.js?v=' + VERSION,
  './js/finance.js?v=' + VERSION,
  './js/commission-import.js?v=' + VERSION,
  './js/phrases.js?v=' + VERSION,
  './js/calendar.js?v=' + VERSION,
  './js/dashboard.js?v=' + VERSION,
  './js/settings.js?v=' + VERSION,
  './js/extra.js?v=' + VERSION,
  './js/pwa.js?v=' + VERSION,
  './js/app.js?v=' + VERSION
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

/* cache-first（应用骨架）：命中缓存立即返回（重复打开秒开），同时后台静默刷新缓存；
 * 未命中则走网络并写入缓存；网络与缓存皆无（罕见离线 + 未预缓存资源）时回退到 index.html。
 * 缓存键使用完整 URL（含 ?v= 版本号），使每个版本互不干扰——部署新版本后旧缓存不会被错配，
 * 最坏情况只是用户多跑一次旧版本直到 index.html 后台刷新完成。
 * 跨域请求（如 GitHub Gist 云同步）不拦截，原样走网络。 */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const cacheKey = req.url;
  e.respondWith(
    caches.match(cacheKey).then(hit => {
      if (hit) {
        fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, res.clone()));
          }
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html').then(h => h || caches.match('./')));
    })
  );
});
