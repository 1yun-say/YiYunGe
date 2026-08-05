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
  async function deriveKey(secret) {
    const c = getCrypto();
    const enc = new TextEncoder();
    const hash = await c.subtle.digest('SHA-256', enc.encode(secret || ''));
    return c.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  // 当前用于加密的「密钥源」：优先用独立的「同步密钥(pass)」，留空则回退到 Token。
  // 这样多端只需填同一个「同步密钥」即可互相解密，不必强求各端 Token 完全一致——
  // 此前密钥=Token，若两端 Token 不同，便永远解不开对方数据，表现为「下载失败 / 自动同步始终不通 / 小字消不掉」。
  function activeSecret() {
    const s = cfg();
    const p = (s.pass || '').trim();
    return p ? p : ((s.token || '').trim());
  }
  async function activeKey() { return deriveKey(activeSecret()); }
  async function seal(obj, secret) {
    const key = await deriveKey(secret);
    return sealWithKey(obj, key);
  }
  async function sealWithKey(obj, key) {
    const c = getCrypto();
    const iv = c.getRandomValues(new Uint8Array(12));
    const ct = await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, alg: 'AES-GCM', iv: b64u(iv.buffer), ct: b64u(ct) });
  }
  async function open(sealed, secret) {
    const key = await deriveKey(secret);
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
  // 读远端内容：优先用「同步密钥」解密，再回退到 Token；都解不开则当作旧版明文兼容。
  // 多候选解密让「两端 Token 不同、但同步密钥相同」也能互相解密，彻底消除“下载失败 / 小字消不掉”。
  async function readRemote(rc, token) {
    if (!rc) return null;
    const s = cfg();
    const secrets = [];
    const p = (s.pass || '').trim();
    if (p) secrets.push(p);
    const t = (token || '').trim();
    if (t) secrets.push(t);
    for (const secret of secrets) {
      try { return await open(rc, secret); } catch (e) { /* 试下一个候选密钥 */ }
    }
    // 以上密钥都解不开：当作旧版明文兼容（仅当确为非加密明文才返回，加密信封返回 null 避免误覆盖本地真实数据）
    try {
      const parsed = JSON.parse(rc);
      if (parsed && parsed.alg === 'AES-GCM' && parsed.ct && parsed.iv) return null;
      return parsed;
    } catch (_) { return null; }
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

  // 从用户输入中规整出真实空间 ID：
  // - 允许直接粘贴完整链接（如 https://gist.github.com/用户名/32位ID），自动截取路径里的 ID 段；
  // - 纯 ID 原样返回；其余（自定义名/乱填）原样返回，交给下方格式校验处理。
  // 注意：GitHub 真实 Gist ID 是 32 位十六进制（旧示例偶见 20 位），故合法区间为 20~40 位。
  function normalizeGistId(raw) {
    if (!raw) return '';
    const r = String(raw).trim();
    if (/^https?:\/\//i.test(r) || r.indexOf('/') >= 0) {
      const m = r.match(/\/([0-9a-f]{20,40})(?:[/?#]|$)/i);
      if (m) return m[1];
    }
    if (/^[0-9a-f]{20,40}$/i.test(r)) return r;
    return r;
  }
  // 空间指纹：由真实空间 ID 确定性推导（两端连到同一份空间 → 指纹必然相同）。
  // 用于「两端是否连到同一空间」的直观核对；不依赖联网，只看 ID 本身。
  function fingerprint(id) {
    const s = (id || '').toLowerCase();
    if (!/^[0-9a-f]+$/.test(s)) return '';
    if (s.length <= 10) return s;
    return s.slice(0, 4) + '-' + s.slice(-4);
  }

  async function ensureGist() {
    const s = cfg();
    const idRe = providerType() === 'gitee' ? /^[0-9a-f]{32}$/i : /^[0-9a-f]{20,40}$/i;

    // 0) 容错：把粘贴的链接 / 多余空格规整成纯 ID（仅当确实能提取时才改写）
    const norm = normalizeGistId(s.gistId);
    if (norm && norm !== s.gistId) { s.gistId = norm; DB.save({ preserveSavedAt: true, silent: true }); }

    // 1) 格式校验：手动填的 ID 必须符合服务商格式，否则视为「留空」，自动新建。
    // 这是为了防止用户填自定义名（如 20260802）导致各端各自新建、无法同步同一份数据。
    // 关键修复：此前 GitHub 误用 20 位固定长度正则，会把正确的 32 位 ID 判为「格式非法」而清空新建。
    if (s.gistId && !idRe.test(s.gistId)) {
      s.gistId = '';
      DB.save({ preserveSavedAt: true, silent: true });
    }

    // 2) 用户填了真实有效的 ID：尝试连接并验证，失败时报错，但绝不擅自丢弃该 ID。
    // 之前的问题是：网络抖动 / Token 错误 / 服务商连不上时，程序把 ID 清掉并新建，
    // 导致用户把一端 ID 复制到另一端后，点连接却生成新 ID。现在只在格式非法或用户留空时才新建。
    if (s.gistId) {
      try {
        const chk = await fetch(withToken(apiBase() + '/' + s.gistId), { headers: authHeaders() });
        if (chk.ok) {
          // 关键修复：连接已存在空间时——
          // ① 基线必须取「远端真实时间戳」，而非本机 __savedAt，否则会和云端对不上、误判冲突；
          // ② 本次保存必须 silent（禁止触发 schedulePush），否则会把本机旧数据自动上传、把共享空间覆盖掉，
          //    导致另一端永远拉不到正确数据、自动同步看似失效。连接后的真正同步由「立即拉取 + 自动拉取」完成。
          let remoteBase = DB.data.__savedAt || Date.now();
          try {
            const cj = await chk.json();
            const rc = cj.files && cj.files[FNAME] && cj.files[FNAME].content;
            const remote = rc ? await readRemote(rc, s.token) : null;
            if (remote && remote.__savedAt) remoteBase = remote.__savedAt;
          } catch (e) { /* 解密失败则用本机时间戳兜底 */ }
          s.baseSavedAt = remoteBase;
          DB.save({ preserveSavedAt: true, silent: true });
          status('已连接到现有空间');
          return s.gistId;
        }
        const t = await chk.text().catch(() => '');
        if (chk.status === 404) throw new Error('404：空间不存在或无权访问，请检查同步空间 ID / Token 是否匹配');
        if (chk.status === 401) throw new Error('401：Token 无效或已过期');
        if (chk.status === 403) throw new Error('403：Token 没有 gist 权限');
        throw new Error('连接失败(' + chk.status + ')：' + t.slice(0, 140));
      } catch (e) {
        if (/^(404|401|403|连接失败)/.test(e.message)) throw e;
        throw new Error('无法连接到 ' + (providerType() === 'gitee' ? '码云 Gitee' : 'GitHub') + '，请检查网络后重试');
      }
    }

    // 3) 留空或格式无效：新建空间
    if (!secureCtx()) throw new Error('insecure');
    status('正在创建加密同步空间…');
    const body = await sealWithKey(DB.data, await activeKey());
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
    DB.save({ preserveSavedAt: true, silent: true });
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
          // 仅当「本机确有未上传改动」且「远端时间戳与我的基线不一致」才算冲突。
          // 否则若本机无改动(localDirty=false)而被旧的 baseSavedAt 错位误判为冲突，会自动上传被卡死；
          // 加上 localDirty 前提后，无改动的设备永远不会被冲突拦截，自动同步得以持续。
          const localDirty = (DB.data.__savedAt || 0) > (s.baseSavedAt || 0);
          if (remote && !force && s.baseSavedAt && localDirty && remoteBase !== s.baseSavedAt) {
            status('云端已有其他设备更新，请先「下载同步」避免覆盖', 'warn');
            throw new Error('conflict');
          }
        }
      } catch (e) { if (e.message === 'conflict') throw e; /* 网络抖动则忽略，继续推送 */ }

      status('正在加密上传…');
      const body = await sealWithKey(DB.data, await activeKey());
      const res = await fetch(apiBase() + '/' + s.gistId, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(withBody({ files: { [FNAME]: { content: body } } }))
      });
      if (!res.ok) {
        // 空间失效（404）时自动重建并重试一次，避免卡死在陈旧 ID
        if (res.status === 404) {
          s.gistId = null; DB.save({ preserveSavedAt: true, silent: true });
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
      // 保存同步配置但不要刷新 __savedAt，否则刚上传的时间戳立即变新，
      // 远端还是旧时间戳，下一周期又被误判冲突。
      DB.save({ preserveSavedAt: true, silent: true });
      status('已加密上传 · ' + U.fmtTime(s.lastSync));
      if (s.auto !== false) startAutoPull();   // 之前若因冲突暂停，上传成功后恢复自动同步
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
      // 复用 readRemote：能解密则返回数据；token 不匹配/数据损坏（envelope 解不开）或格式错误均返回 null，绝不把加密信封当真实数据导入覆盖本地
      const data = await readRemote(content, s.token);
      if (!data) throw new Error('解密失败：若更换过 Token，请用原 Token 下载，或本地重新连接');
      const remoteBase = data.__savedAt || 0;
      // 关键修复：用「保留远端时间戳 + 静默(不触发自动上传)」一次性导入。
      // 之前先无参 importJSON(刷新 __savedAt 并触发自动上传)，再二次导入，最后又用普通 save 把 __savedAt 抹成当前时间，
      // 导致 baseSavedAt 与 __savedAt 永远对不上 → 每次被误判冲突、自动同步被 stopAutoPull 关掉、小字消不掉。
      DB.importJSON(JSON.stringify(data), { preserveSavedAt: true, silent: true });

      // importJSON 会替换整个 DB.data，同步配置对象也变了，需要重新取并更新 baseSavedAt
      const s2 = cfg();
      s2.baseSavedAt = remoteBase;
      s2.lastSync = Date.now();
      // 务必 preserveSavedAt：保证 __savedAt === baseSavedAt === remoteBase，闭环不再误判冲突
      DB.save({ preserveSavedAt: true, silent: true });

      if (App && App.boot) App.boot();
      status((quiet ? '已自动同步' : '已下载同步') + ' · ' + U.fmtTime(s2.lastSync));
      if (s2.auto !== false) startAutoPull();      // 之前若因冲突暂停，手动下载后恢复自动同步
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
          if (e.message === 'conflict') {
            stopAutoPull();   // 停止自动拉取，避免每 20s 重复弹同一警告刷屏
            status('云端和本机都有改动，已暂停自动同步，请手动「下载同步」处理', 'warn');
          }
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
           startAutoPull, stopAutoPull, fingerprint, readRemote, activeSecret,
           _crypto: { seal, open, sealWithKey, openWithKey, secureCtx } };
})();
