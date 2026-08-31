/* 注册 Service Worker：network-first，离线可用，解决 PWA 缓存旧版问题 */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js?v=2.6.7').catch(err => console.warn('SW 注册失败', err));
}
