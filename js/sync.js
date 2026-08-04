/* ===== 云同步（免费方案：GitHub Gist 或 码云 Gitee Gist，全程本地加密） =====
   隐私原则：
   - 应用代码（本仓库）完全不含任何个人数据，只含空的 App 外壳。
   - 真实数据只存在你自己的浏览器 localStorage + 一份「私密 Gist」。
   - 上传前在本机用 AES-GCM 加密（密钥由你的 Token 推导），明文绝不出本机。
     即便 Gist 链接泄露，别人看到的也只是密文，无法读取。
   - Token 仅保存在本机浏览器，不上传、不进仓库。
   安全上下文：加密依赖浏览器 Web Crypto，仅在 https 或 localhost 下可用。
     因此云同步必须在你的公网 https 地址（或本机 localhost）下使用。
   服务商：默认 GitHub（国际），国内连不稳时可切到「码云 Gitee」（国内可访问）。
*/
window.Sync = (() => {
  const FNAME = 'yiyunge-data.json';

  function cfg() {
    if (!DB.data.settings.sync) DB.data.settings.sync = {};
    const s = DB.data.settings.sync;
    if (s.auto === undefined) s.auto = true;
    if (s.provider === undefined) s.provider = 'github';
    return s;
  }

  function providerType() { return (cfg().provider || 'github') === 'gitee' ? 'gitee' : 'github'; }
  function apiBase() { return providerType() === 'gitee' ? 'https://gitee.com/api/v5/gists' : 'https://api.github.com/gists'; }
  function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (providerType() === 'github') {
      h['Accept'] = 'application/vnd.github+json';
      const t = (cfg().token || '').trim();
      if (t) h['Authorization'] = 'token ' + t;
    }
    return h;
  }
  // GET 请求附加 token（Gitee 用 query 参数；GitHub 用 header，此处不加）
  function withToken(url) {
    if (providerType() === 'gitee') {
      const t = (cfg().token || '').trim();
      if (t) { const sep = url.indexOf('?') >= 0 ? '&' : '?'; return url + sep + 'access_token=' + encodeURIComponent(t); }
    }
    return url;
  }
  // POST/PATCH 请求体附加 token（Gitee 需要放进 body）
  function withBody(body) {
    if (providerType() === 'gitee') {
      const t = (cfg().token || '').trim();
      if (t) return Object.assign({}, body, { access_token: t });
    }
    return body;
  }

  /* ---------- 加密（Web Crypto / AES-GCM） ---------- */
  function getCrypto() {
    const g = (typeof globalThis !== 'undefined') ? globalThis.crypto : null;
    if (g && g.subtle) return g;
    const w = (typeof window !== 'undefined') ? window.crypto : null;
    if (w && w.subtle) return w;
    return null;
  }
  function secureCtx() {
    return (typeof window !== 'undefined' && window.isSecureContext)
        || (typeof globalThis !== 'undefined' && globalThis.isSecureContext);
  }
  function b64u(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  async function deriveKey(token) {
    const c = getCrypto();
    const enc = new TextEncoder();
    const hash = await c.subtle.digest('SHA-256', enc.encode(token));
    return c.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj, token) {
    const key = await deriveKey(token);
    return sealWithKey(obj, key);
  }
  async function sealWithKey(obj, key) {
    const c = getCrypto();
    const iv = c.getRandomValues(new Uint8Array(12));
    const ct = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, alg: 'AES-GCM', iv: b64u(iv.buffer), ct: b64u(ct) });
  }
  async function open(sealed, token) {
    const key = await deriveKey(token);
    return openWithKey(sealed, key);
  }
  async function openWithKey(sealed, key) {
    const env = JSON.parse(sealed);
    if (!env || env.v !== 1 || env.alg !== 'AES-GCM') throw new Error('envelope');
    const c = getCrypto();
    const iv = new Uint8Array(unb64u(env.iv));
    const pt = await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, unb64u(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  // 读远端内容：优先解密；失败则当作旧版明文兼容
  async function readRemote(rc, token) {
    if (!rc) return null;
    try { return await open(rc, token); }
    catch (e) { try { return JSON.parse(rc); } catch (_) { return null; } }
  }

  let timer = null, busy = false;

  function schedulePush() {
    const s = cfg();
    if (busy || !s.token || !s.gistId || s.auto === false) return;
    if (!secureCtx()) return;            // 非安全上下文不尝试上传
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { push().catch(() => {}); }, 1500);
  }

  function status(msg, kind) {
    const el = document.getElementById('syncStatus');
    if (el) { el.textContent = msg; el.className = 'sync-status' + (kind ? ' ' + kind : ''); }
  }

  async function ensureGist() {
    const s = cfg();
    // 手动填的 ID 必须符合服务商格式（GitHub 20位hex / Gitee 32位hex），否则视为无效并自动新建，
    // 避免用户填自定义名（如 20260802）导致各端各自新建、无法同步同一份数据
    if (s.gistId) {
      const idRe = providerType() === 'gitee' ? /^[0-9a-f]{32}$/i : /^[0-9a-f]{20}$/i;
      if (!idRe.test(s.gistId)) { s.gistId = null; DB.save(); }
    }
    if (s.gistId) {
      // 先验证该空间是否仍能被当前 token 访问，避免陈旧/无权 ID 导致 404
      try {
        const chk = await fetch(withToken(apiBase() + '/' + s.gistId), { headers: authHeaders() });
        if (chk.ok) return s.gistId;
      } catch (e) { /* 网络抖动则下面重建 */ }
      s.gistId = null;   // 空间失效/无权 → 丢弃，下面重建
      DB.save();
    }
    if (!secureCtx()) throw new Error('insecure');
    status('正在创建加密同步空间…');
    const body = await seal(DB.data, s.token);
    const res = await fetch(apiBase(), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(withBody({ description: '逸云阁数据同步(加密)', public: true, files: { [FNAME]: { content: body } } }))
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('创建失败(' + res.status + ')：' + t.slice(0, 140));
    }
    const j = await res.json();
    s.gistId = j.id;
    s.baseSavedAt = DB.data.__savedAt || Date.now();
    DB.save();
    status('加密同步空间已创建');
    return j.id;
  }

  async function push(force) {
    const s = cfg();
    if (!s.token) { status('请先填写 Token', 'warn'); throw new Error('no token'); }
    if (!secureCtx()) { status('加密同步需在 https 或本机打开，请用公网地址访问', 'warn'); throw new Error('insecure'); }
    busy = true;
    try {
      await ensureGist();
      // 冲突检测：拉取远端，比较 base
      try {
        const cur = await fetch(withToken(apiBase() + '/' + s.gistId), { headers: authHeaders() });
        if (cur.ok) {
          const cj = await cur.json();
          const rc = cj.files && cj.files[FNAME] && cj.files[FNAME].content;
          const remote = await readRemote(rc, s.token);
          const remoteBase = remote && (remote.__savedAt || 0);
          if (remote && !force && s.baseSavedAt && remoteBase !== s.baseSavedAt) {
            status('云端已有其他设备更新，请先「下载同步」避免覆盖', 'warn');
            throw new Error('conflict');
          }
        }
      } catch (e) { if (e.message === 'conflict') throw e; /* 网络抖动则忽略，继续推送 */ }

      status('正在加密上传…');
      const body = await seal(DB.data, s.token);
      const res = await fetch(apiBase() + '/' + s.gistId, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(withBody({ files: { [FNAME]: { content: body } } }))
      });
      if (!res.ok) {
        // 空间失效（404）时自动重建并重试一次，避免卡死在陈旧 ID
        if (res.status === 404) {
          s.gistId = null; DB.save();
          await ensureGist();
          const res2 = await fetch(apiBase() + '/' + s.gistId, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(withBody({ files: { [FNAME]: { content: body } } }))
          });
          if (res2.ok) { /* 重试成功，继续下面的收尾 */ }
          else { const t = await res2.text().catch(() => ''); throw new Error('上传失败(' + res2.status + ')：' + t.slice(0, 120)); }
        } else {
          const t = await res.text().catch(() => '');
          throw new Error('上传失败(' + res.status + ')：' + t.slice(0, 120));
        }
      }
      s.baseSavedAt = DB.data.__savedAt || Date.now();
      s.lastSync = Date.now();
      DB.save();
      status('已加密上传 · ' + U.fmtTime(s.lastSync));
    } finally { busy = false; }
  }

  async function doPull(quiet) {
    const s = cfg();
    if (!s.token || !s.gistId) { if (!quiet) status('请先连接 / 初始化', 'warn'); throw new Error('no gist'); }
    if (!secureCtx()) { if (!quiet) status('加密同步需在 https 或本机打开，请用公网地址访问', 'warn'); throw new Error('insecure'); }
    busy = true;
    try {
      if (!quiet) status('正在下载…');
      const res = await fetch(withToken(apiBase() + '/' + s.gistId), { headers: authHeaders() });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error('下载失败(' + res.status + ')：' + t.slice(0, 120));
      }
      const j = await res.json();
      const content = j.files && j.files[FNAME] && j.files[FNAME].content;
      if (!content) throw new Error('云端暂无数据');
      let data;
      try { data = await open(content, s.token); }
      catch (e) {
        try { data = JSON.parse(content); }       // 旧版明文兼容
        catch (_) { throw new Error('解密失败：若更换过 Token，请用原 Token 下载，或本地重新连接'); }
      }
      DB.importJSON(JSON.stringify(data));                 // 内部会 save()
      s.baseSavedAt = DB.data.__savedAt || Date.now();
      s.lastSync = Date.now();
      DB.save();
      if (App && App.boot) App.boot();
      status((quiet ? '已自动同步' : '已下载同步') + ' · ' + U.fmtTime(s.lastSync));
    } finally { busy = false; }
  }
  function pull() { return doPull(false); }

  /* ---------- 后台自动下载（准实时多端同步） ----------
     机制：每隔 PULL_INTERVAL 检查云端是否有比本机新的版本（比较 baseSavedAt）。
     - 无更新：直接跳过，不打扰界面、不重渲染；
     - 有更新且本机无未上传改动：静默拉取并刷新当前视图（"平板输、电脑随即变"）；
     - 有更新且本机也有未上传改动：先尝试上传，若撞车（conflict）则暂停自动同步并提示手动处理，绝不偷偷覆盖。
     用户正在输入框打字时跳过本周期，避免重渲染清空输入。
  */
  const PULL_INTERVAL = 20000;
  let pullTimer = null;

  function startAutoPull() {
    const s = cfg();
    if (!s.token || !s.gistId || s.auto === false) return;
    if (!secureCtx()) return;
    if (pullTimer) return;                          // 已在跑，不重复
    pullTimer = setInterval(autoPullTick, PULL_INTERVAL);
    setTimeout(autoPullTick, 3000);                 // 启动后稍等再拉一次，快速拿到别人已上传的改动
  }
  function stopAutoPull() {
    if (pullTimer) { clearInterval(pullTimer); pullTimer = null; }
  }

  async function autoPullTick() {
    const s = cfg();
    if (busy) return;                               // 有上传/下载进行中，跳过本周期
    if (!s.token || !s.gistId) { stopAutoPull(); return; }
    if (!secureCtx()) return;
    // 用户正在输入时不打断（避免重渲染清空输入框）
    const ae = (typeof document !== 'undefined') && document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    try {
      const res = await fetch(withToken(apiBase() + '/' + s.gistId), { headers: authHeaders() });
      if (!res.ok) { if (res.status === 404) stopAutoPull(); return; }
      const j = await res.json();
      const rc = j.files && j.files[FNAME] && j.files[FNAME].content;
      if (!rc) return;
      const remote = await readRemote(rc, s.token);
      const remoteBase = remote && (remote.__savedAt || 0);
      if (!remoteBase) return;
      if (remoteBase === s.baseSavedAt) return;     // 没有新版本，直接跳过，不打扰
      // 有更新：本机若有尚未上传的改动，先上传；若撞车则提示手动处理，本轮不覆盖
      const localDirty = (DB.data.__savedAt || 0) > (s.baseSavedAt || 0);
      if (localDirty) {
        try { await push(); return; }               // 上传成功会同步 baseSavedAt
        catch (e) {
          if (e.message === 'conflict') status('云端和本机都有改动，已暂停自动同步，请手动「下载同步」处理', 'warn');
          return;
        }
      }
      await doPull(true);                           // 本机干净 → 静默拉取
    } catch (e) { /* 网络抖动忽略，下个周期再试 */ }
  }

  function refreshStatus() {
    const s = cfg();
    if (!secureCtx()) { status('当前地址无法加密同步，请用公网 https 地址打开'); return; }
    if (s.gistId && s.lastSync) status('上次同步 · ' + U.fmtTime(s.lastSync));
    else if (s.gistId) status('已连接，尚未同步');
    else status('未连接');
  }

  return { cfg, schedulePush, push, pull, ensureGist, status, refreshStatus,
           startAutoPull, stopAutoPull,
           _crypto: { seal, open, sealWithKey, openWithKey, secureCtx } };
})();
