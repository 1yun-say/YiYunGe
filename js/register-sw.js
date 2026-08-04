/* 注册 Service Worker：network-first，离线可用，解决 PWA 缓存旧版问题 */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js?v=1.8.9').catch(err => console.warn('SW 注册失败', err));
}
