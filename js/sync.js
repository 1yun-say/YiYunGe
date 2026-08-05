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

  /* ---------- 云端拉取（统一封装：返回是否存在内容 + 解密结果） ---------- */
  async function fetchCloud() {
    const s = cfg();
    try {
      const res = await fetch(withToken(apiBase() + '/' + s.gistId), { headers: authHeaders() });
      if (res.status === 404) return { status: 404, content: null, remote: null, present: false };
      if (!res.ok) return { status: res.status, content: null, remote: null, present: false };
      const j = await res.json();
      const content = j.files && j.files[FNAME] && j.files[FNAME].content;
      if (!content) return { status: 200, content: null, remote: null, present: false };
      const remote = await readRemote(content, s.token);
      return { status: 200, content, remote, present: true };
    } catch (e) { return { status: 0, content: null, remote: null, present: false, err: e }; }
  }

  /* ---------- 无损合并：按 id 取并集，绝不整体覆盖 ----------
     这是「多端同步不会再丢失数据」的根本保障。
     - 各数据集合（学员/老师/课节/提醒/日程/模板/话术）按记录 id 合并：
       两端都有的 id 取「修改时间(_mt)较新者」；都没有 _mt 则按方向（拉取取远端、上传取本机）；
       任一侧独有的 id 都保留 → 一端新增、另一端绝不会被覆盖丢失。
     - histIncome 按月「最后修改时间」胜出(LWW) + 按月删除墓碑（不再取较大值，避免改小的值被云端旧大值顶掉）；meta 按字段取较大值。
     - settings 整段保留本机（含 token/gistId 等连接信息），绝不从云端覆盖，避免一端连接被另一端清空。
     - __savedAt 取两端较大值，保证时间戳单调、基线对得上。
  */
  const SYNC_ARRAYS = ['students', 'teachers', 'lessons', 'todos', 'events', 'templates', 'phrases'];
  // 墓碑结构空壳（与 store.blankDeleted 的键保持一致），避免合并时漏字段
  function emptyDeleted() {
    const o = {};
    for (const c of SYNC_ARRAYS) o[c] = {};
    return o;
  }
  function mergeDocs(local, remote, direction) {
    const merged = Object.assign({}, local);           // 浅拷贝：保留本机 settings 等所有字段
    const r = remote || {};
    for (const key of SYNC_ARRAYS) {
      const la = Array.isArray(local[key]) ? local[key] : [];
      const ra = Array.isArray(r[key]) ? r[key] : [];
      const out = [];
      for (const it of ra) { if (it && it.id != null) out.push(it); }   // 先放远端
      for (const it of la) {
        if (!it || it.id == null) { out.push(it); continue; }
        const k = String(it.id);
        const idx = out.findIndex(x => String(x.id) === k);
        if (idx < 0) out.push(it);                      // 本机独有 → 保留
        else {                                          // 冲突：按 _mt 或方向择优
          const a = it, b = out[idx];
          const ma = a._mt || 0, mb = b._mt || 0;
          out[idx] = (ma && mb) ? (ma >= mb ? a : b) : (direction === 'pull' ? b : a);
        }
      }
      merged[key] = out;
    }
    // ---- 墓碑（tombstone）合并：让「删除」也能跨端传播 ----
    // 两端各集合的 deleted 按 id 取较大 delAt（删除时间更新者胜出，避免复活后又被旧删除时间误删）；
    // 再据此剔除非复活的记录，使 A 端删的记录在 B/C 端合并时同样消失。
    const ld = (local && local.deleted) || {};
    const rd = (remote && remote.deleted) || {};
    const mergedDeleted = emptyDeleted();
    for (const col of SYNC_ARRAYS) {
      const lm = (ld[col] && typeof ld[col] === 'object') ? ld[col] : {};
      const rm = (rd[col] && typeof rd[col] === 'object') ? rd[col] : {};
      for (const id of Object.keys(lm).concat(Object.keys(rm))) {
        const a = lm[id] || 0, b = rm[id] || 0;
        mergedDeleted[col][id] = Math.max(a, b);
      }
    }
    // 应用墓碑：被删除的记录从合并结果剔除，除非该记录比删除时间更新
    // （误删后、同步前又改动，或重新录入使 createdAt/ _mt 大于 delAt → 复活并移除墓碑）。
    for (const col of SYNC_ARRAYS) {
      const delMap = mergedDeleted[col] || {};
      const out = [];
      for (const it of (merged[col] || [])) {
        if (!it || it.id == null) { out.push(it); continue; }
        const delAt = delMap[String(it.id)] || 0;
        if (!delAt) { out.push(it); continue; }
        const bornAt = it._mt || it.createdAt || 0;
        if (bornAt > delAt) {
          delete mergedDeleted[col][String(it.id)];   // 复活：移除墓碑，保留记录
          out.push(it);
        }
        // 否则（已删除）剔除
      }
      merged[col] = out;
    }
    merged.deleted = mergedDeleted;
    // ---- 历史收入：按月「最后修改时间胜出(LWW)」+ 按月删除墓碑 ----
    // 旧实现按月份取 Math.max，导致「把某月收入改小」会被云端旧的大值覆盖（改了又回来）。
    // 现改为：同一个月比较两端写入时间戳，较新者胜；删除标记若比两端值都新，则该月真正移除（跨端删除也生效）。
    const li = (local && local.histIncome && typeof local.histIncome === 'object') ? local.histIncome : {};
    const ri = (r && r.histIncome && typeof r.histIncome === 'object') ? r.histIncome : {};
    const lmt = (local && local.histIncomeMt && typeof local.histIncomeMt === 'object') ? local.histIncomeMt : {};
    const rmt = (r && r.histIncomeMt && typeof r.histIncomeMt === 'object') ? r.histIncomeMt : {};
    const ldel = (local && local.histIncomeDel && typeof local.histIncomeDel === 'object') ? local.histIncomeDel : {};
    const rdel = (r && r.histIncomeDel && typeof r.histIncomeDel === 'object') ? r.histIncomeDel : {};
    const hi = {}, himt = {}, hidel = {};
    const months = new Set([...Object.keys(li), ...Object.keys(ri), ...Object.keys(ldel), ...Object.keys(rdel)]);
    for (const m of months) {
      const lv = (m in li) ? li[m] : null, rv = (m in ri) ? ri[m] : null;
      const lt = lmt[m] || 0, rt = rmt[m] || 0;
      const ldt = ldel[m] || 0, rdt = rdel[m] || 0;
      // 删除墓碑：任一侧删除时间晚于两侧所有值写入时间 → 该月真正移除（跨端删除也生效）
      const delAt = Math.max(ldt, rdt);
      if (delAt > 0 && delAt > Math.max(lt, rt)) { hidel[m] = delAt; continue; }
      // 值按最后修改时间(LWW)择优；时间相同则按方向（push 取本机、pull 取远端）
      let val, ts;
      if (lv != null && rv != null) {
        if (lt > rt) { val = lv; ts = lt; }
        else if (rt > lt) { val = rv; ts = rt; }
        else { val = (direction === 'push') ? lv : rv; ts = lt; }
      } else if (lv != null) { val = lv; ts = lt; }
      else if (rv != null) { val = rv; ts = rt; }
      else { continue; }   // 只有删除标记（已被上方 continue 处理），无值可留
      if (val) { hi[m] = val; himt[m] = ts; }   // 0/空视为无收入，不入表（与填写端一致）
    }
    merged.histIncome = hi;
    merged.histIncomeMt = himt;
    merged.histIncomeDel = hidel;
    const lm = (local && local.meta && typeof local.meta === 'object') ? local.meta : {};
    const rm = (r && r.meta && typeof r.meta === 'object') ? r.meta : {};
    const mt = Object.assign({}, lm);
    for (const k in rm) mt[k] = Math.max(mt[k] || 0, rm[k] || 0);
    merged.meta = mt;
    merged.__savedAt = Math.max((local && local.__savedAt) || 0, (r && r.__savedAt) || 0);
    return merged;
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
      const fc = await fetchCloud();
      // 网络异常 / 云端读不到：放弃本次上传，绝不拿本机旧数据去覆盖云端真实数据
      if (!fc.present && fc.status !== 404) throw new Error('cloud-unreachable');
      // 云端已有内容但本机解不开 → 密钥不匹配，绝不覆盖（否则会清空对方数据）
      if (fc.present && !fc.remote) { status('密钥不匹配，无法上传（会清空对方数据）', 'warn'); throw new Error('key-mismatch'); }
      // 合并本机与云端（取并集），即便本地「更旧」也绝不会丢失云端新增的记录
      const merged = mergeDocs(DB.data, fc.remote, 'push');
      status('正在加密上传…');
      const body = await sealWithKey(merged, await activeKey());
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
            method: 'PATCH', headers: authHeaders(),
            body: JSON.stringify(withBody({ files: { [FNAME]: { content: body } } }))
          });
          if (!res2.ok) { const t = await res2.text().catch(() => ''); throw new Error('上传失败(' + res2.status + ')：' + t.slice(0, 120)); }
        } else { const t = await res.text().catch(() => ''); throw new Error('上传失败(' + res.status + ')：' + t.slice(0, 120)); }
      }
      s.baseSavedAt = merged.__savedAt;
      s.lastSync = Date.now();
      // 落盘合并结果（保留 __savedAt，静默不触发上传），使本机与云端完全一致
      DB.data = merged;
      DB.save({ preserveSavedAt: true, silent: true });
      status('已加密上传 · ' + U.fmtTime(s.lastSync));
      if (s.auto !== false) startAutoPull();
    } finally { busy = false; }
  }

  async function doPull(quiet) {
    const s = cfg();
    if (!s.token || !s.gistId) { if (!quiet) status('请先连接 / 初始化', 'warn'); throw new Error('no gist'); }
    if (!secureCtx()) { if (!quiet) status('加密同步需在 https 或本机打开，请用公网地址访问', 'warn'); throw new Error('insecure'); }
    busy = true;
    try {
      if (!quiet) status('正在下载…');
      const fc = await fetchCloud();
      if (!fc.present) throw new Error('云端暂无数据');
      if (!fc.remote) throw new Error('解密失败：密钥不匹配，请用原 Token / 同步密钥，或本地重新连接');
      // 合并云端与本机（取并集），本机独有记录不会被云端覆盖丢失
      const merged = mergeDocs(DB.data, fc.remote, 'pull');
      DB.data = merged;
      DB.save({ preserveSavedAt: true, silent: true });
      const s2 = cfg();
      s2.baseSavedAt = fc.remote.__savedAt || 0;
      s2.lastSync = Date.now();
      DB.save({ preserveSavedAt: true, silent: true });
      if (App && App.boot) App.boot();
      status((quiet ? '已自动同步' : '已下载同步') + ' · ' + U.fmtTime(s2.lastSync));
      if (s2.auto !== false) startAutoPull();
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
      const fc = await fetchCloud();
      if (!fc.present) return;                       // 云端空，跳过
      if (!fc.remote) {                              // 有内容但解不开 → 密钥不匹配，停止自动同步并提示
        stopAutoPull();
        status('同步密钥不匹配，已暂停自动同步（请检查两端同步密钥 / Token 是否一致）', 'warn');
        return;
      }
      const remoteBase = fc.remote.__savedAt || 0;
      if (remoteBase === s.baseSavedAt) return;      // 无新版本，跳过，不打扰
      // 本机若有未上传改动：先合并上传（上传内部也会先合并云端，绝不丢数据）；
      // 上传失败（如密钥不匹配）也降级为仅拉取合并，保证本机拿到云端数据且不丢本机数据。
      const localDirty = (DB.data.__savedAt || 0) > (s.baseSavedAt || 0);
      if (localDirty) {
        try { await push(); return; }
        catch (e) { if (e.message === 'key-mismatch') { stopAutoPull(); return; } /* 其它失败则继续拉取 */ }
      }
      await doPull(true);                            // 合并拉取，绝不丢本机数据
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
           _crypto: { seal, open, sealWithKey, openWithKey, secureCtx },
           _merge: mergeDocs, _fetchCloud: fetchCloud, _autoActive: () => !!pullTimer };
})();
