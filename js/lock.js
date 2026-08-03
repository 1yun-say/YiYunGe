/* ===== 应用锁：密码保护 + 本地数据 AES-GCM 加密（Web Crypto） =====
 * 设计目标：
 *  - 打开应用先输密码；密码错则只看到登录页，看不到任何数据。
 *  - 浏览器本地存储(ENC_KEY)里只放密文；没有密码无法还原数据。
 *  - 密码只存在于用户脑中，不落盘（仅存派生校验值 verifier）。
 *  - 仅在安全上下文(https / localhost)可用；局域网 http 不启用。
 * 注：纯前端密码无法抵御"能直接读你浏览器存储且懂代码"的攻击者，
 *    但对"陌生人拿到链接 / 手机丢失 / 共用设备"等场景已足够强。
 */
const Lock = (() => {
  const LOCK_KEY = 'sakura-desk-lock';
  const ENC_KEY  = 'sakura-desk-v1-enc';
  const DB_KEY   = 'sakura-desk-v1';
  const MAGIC    = 'yiyunge-lock-v1';
  const PBKDF2_ITER = 150000;

  let memKey = null;   // 解锁后持有的 CryptoKey；锁定时为 null

  /* ---------- 基础工具 ---------- */
  function hasCrypto() {
    try {
      return !!(typeof crypto !== 'undefined' && crypto.subtle &&
        (window.isSecureContext ||
         location.protocol === 'https:' ||
         location.hostname === 'localhost' ||
         location.hostname === '127.0.0.1'));
    } catch (e) { return false; }
  }

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function unb64(s) {
    const bin = atob(s);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a.buffer;
  }
  function enc() { return new TextEncoder(); }
  function dec() { return new TextDecoder(); }

  async function deriveKey(pw, saltBuf) {
    const mk = await crypto.subtle.importKey('raw', enc().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuf, iterations: PBKDF2_ITER, hash: 'SHA-256' },
      mk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  async function seal(obj, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc().encode(JSON.stringify(obj)));
    return { v: 1, alg: 'AES-GCM', iv: b64(iv), ct: b64(ct) };
  }
  async function open(env, key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct));
    return JSON.parse(dec().decode(pt));
  }

  /* ---------- 配置读写 ---------- */
  function readCfg() {
    try { const r = localStorage.getItem(LOCK_KEY); if (r) return JSON.parse(r); } catch (e) {}
    return { enabled: false };
  }
  function writeCfg(c) { localStorage.setItem(LOCK_KEY, JSON.stringify(c)); }
  function isEnabled() { return readCfg().enabled === true; }
  function hasKey() { return !!memKey; }
  function dataCryptoKey() { return memKey; }
  function hasPassword() { const c = readCfg(); return c.enabled === true && !!c.salt && !!c.verifier; }

  /* ---------- 核心操作 ---------- */
  // 首次开启 / 重新开启：用当前明文数据(currentData)加密落盘
  async function setPassword(pw, currentData) {
    if (!hasCrypto()) throw new Error('insecure');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pw, salt);
    memKey = key;
    const env = await seal(currentData, key);
    localStorage.setItem(ENC_KEY, JSON.stringify(env));
    localStorage.removeItem(DB_KEY);
    const verifier = await seal(MAGIC, key);
    writeCfg({ enabled: true, salt: b64(salt), verifier });
    const meta = { enabled: true, salt: b64(salt), verifier };
    // 同步「全局锁」状态到云端：手机/平板等未本地设锁的设备也会要求密码
    try {
      DB.data.__lockMeta = meta;
      DB.save();   // 触发云同步上传（若已连接）
    } catch (e) {}
    // 发布公开锁元数据（好友无需 Token 即可读到，从而弹出密码页）
    try { if (typeof Sync !== 'undefined' && Sync.pushLockFile) Sync.pushLockFile(meta); } catch (e) {}
    return true;
  }

  // 解锁：校验密码成功则返回解密后的数据对象
  async function unlock(pw) {
    const c = readCfg();
    if (c.enabled !== true || !c.salt || !c.verifier) throw new Error('未设置密码');
    if (!hasCrypto()) throw new Error('insecure');
    const key = await deriveKey(pw, unb64(c.salt));
    let ok = false;
    try { ok = (await open(c.verifier, key)) === MAGIC; } catch (e) { ok = false; }
    if (!ok) throw new Error('密码错误');
    memKey = key;
    const raw = localStorage.getItem(ENC_KEY);
    if (!raw) throw new Error('本地加密数据缺失');
    return await open(JSON.parse(raw), key);
  }

  // store.save() 调用：把内存数据加密写入 ENC_KEY（不阻塞调用方）
  function encryptInto(data) {
    if (!memKey) return false;
    seal(data, memKey).then(env => localStorage.setItem(ENC_KEY, JSON.stringify(env))).catch(() => {});
    return true;
  }

  function lockNow() { memKey = null; }

  // 修改密码（需已解锁，校验旧密码后用新 key 重加密）
  async function changePassword(oldPw, newPw) {
    if (!memKey) throw new Error('请先解锁');
    const c = readCfg();
    const oldKey = await deriveKey(oldPw, unb64(c.salt));
    let ok = false;
    try { ok = (await open(c.verifier, oldKey)) === MAGIC; } catch (e) { ok = false; }
    if (!ok) throw new Error('原密码错误');
    const newSalt = crypto.getRandomValues(new Uint8Array(16));
    const newKey = await deriveKey(newPw, newSalt);
    const cur = await open(JSON.parse(localStorage.getItem(ENC_KEY)), oldKey);
    memKey = newKey;
    localStorage.setItem(ENC_KEY, JSON.stringify(await seal(cur, newKey)));
    const verifier = await seal(MAGIC, newKey);
    writeCfg({ enabled: true, salt: b64(newSalt), verifier });
    const meta = { enabled: true, salt: b64(newSalt), verifier };
    try {
      DB.data.__lockMeta = meta;
      DB.save();
    } catch (e) {}
    try { if (typeof Sync !== 'undefined' && Sync.pushLockFile) Sync.pushLockFile(meta); } catch (e) {}
    return true;
  }

  // 关闭锁：校验密码并解密，数据写回明文，删除加密与配置
  async function disable(pw) {
    const data = await unlock(pw);
    memKey = null;
    try { delete DB.data.__lockMeta; } catch (e) {}
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    localStorage.removeItem(ENC_KEY);
    writeCfg({ enabled: false });
    try {
      DB.save();
      if (typeof Sync !== 'undefined' && Sync.pushLockFile) Sync.pushLockFile({ enabled: false });
    } catch (e) {}
    return true;
  }

  function wipe() {
    localStorage.removeItem(ENC_KEY);
    localStorage.removeItem(LOCK_KEY);
    localStorage.removeItem(DB_KEY);
    memKey = null;
  }

  /* ---------- 登录界面 ---------- */
  function showScreen(onSuccess) {
    const root = document.getElementById('lockScreen');
    if (!root) return;
    root.style.display = 'flex';
    render(root, onSuccess, { remote: false });
  }
  function showScreenRemote(meta, onSuccess) {
    const root = document.getElementById('lockScreen');
    if (!root) return;
    root.style.display = 'flex';
    render(root, onSuccess, { remote: true, meta });
  }
  function hideScreen() { const r = document.getElementById('lockScreen'); if (r) r.style.display = 'none'; }

  function render(root, onSuccess, opts) {
    opts = opts || {};
    const sub = opts.remote ? '该账号已开启密码保护，请输入密码解锁' : '已开启密码保护，请输入密码解锁';
    root.innerHTML = `
      <div class="lock-card">
        <div class="lock-logo" id="lockLogo">${(window.Brand ? Brand.logoHTML() : '<svg viewBox="0 0 40 40"><g fill="currentColor"><ellipse cx="20" cy="9" rx="5" ry="7.5"/><ellipse cx="30.4" cy="16.6" rx="5" ry="7.5" transform="rotate(72 30.4 16.6)"/><ellipse cx="26.5" cy="28.8" rx="5" ry="7.5" transform="rotate(144 26.5 28.8)"/><ellipse cx="13.5" cy="28.8" rx="5" ry="7.5" transform="rotate(216 13.5 28.8)"/><ellipse cx="9.6" cy="16.6" rx="5" ry="7.5" transform="rotate(288 9.6 16.6)"/><circle cx="20" cy="20" r="3.4" fill="#fff7fa"/></g></svg>')}</div>
        <h2 class="lock-title">逸云阁</h2>
        <p class="muted" style="text-align:center;margin-bottom:14px">${sub}</p>
        <div class="field" style="margin-bottom:12px">
          <input class="input" id="lk_pw" type="password" placeholder="输入密码" autocomplete="off">
        </div>
        <button class="btn btn-primary" id="lk_go" style="width:100%">解锁</button>
        <p class="lock-err" id="lk_err"></p>
        <button class="link-btn" id="lk_forget">忘记密码？清空本机数据</button>
      </div>`;
    const pw = root.querySelector('#lk_pw');
    pw.focus();
    const submit = async () => {
      const err = root.querySelector('#lk_err');
      err.textContent = '';
      try {
        if (opts.remote) {
          await unlockRemote(pw.value, opts.meta);
        } else {
          const data = await unlock(pw.value);
          if (window.DB) { DB.unlockData(data); ensureMetaIfNeeded(); }
        }
        hideScreen();
        if (onSuccess) onSuccess();
      } catch (e) {
        err.textContent = (e.message === '密码错误') ? '密码错误，请重试' : ('解锁失败：' + e.message);
      }
    };
    root.querySelector('#lk_go').onclick = submit;
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    root.querySelector('#lk_forget').onclick = () => {
      if (confirm('清空会删除本机所有数据（无法恢复），确定？建议先在其他设备用「导出备份」留存。')) { wipe(); location.reload(); }
    };
  }

  // 远程解锁：校验云端下发的 salt+verifier；成功后在本机也激活锁
  async function unlockRemote(pw, meta) {
    if (!meta || !meta.salt || !meta.verifier) throw new Error('未设置密码');
    if (!hasCrypto()) throw new Error('insecure');
    const key = await deriveKey(pw, unb64(meta.salt));
    let ok = false;
    try { ok = (await open(meta.verifier, key)) === MAGIC; } catch (e) { ok = false; }
    if (!ok) throw new Error('密码错误');
    memKey = key;
    localStorage.setItem(LOCK_KEY, JSON.stringify({ enabled: true, salt: meta.salt, verifier: meta.verifier }));
    localStorage.removeItem(DB_KEY);
    // 记住当前共享空间，供后续「下载同步」解密使用
    try { if (typeof Sync !== 'undefined' && Sync.setActiveSpace && meta.__space) Sync.setActiveSpace(meta.__space); } catch (e) {}
    return true;
  }

  // 已本地开启锁但云端尚无 meta 时，解锁后补一次同步（让其他设备也能看到锁）
  function ensureMetaIfNeeded() {
    try {
      if (Lock.isEnabled() && !DB.data.__lockMeta && memKey) {
        const c = readCfg();
        DB.data.__lockMeta = { enabled: true, salt: c.salt, verifier: c.verifier };
        DB.save();
      }
    } catch (e) {}
  }

  function meta() { return (DB.data && DB.data.__lockMeta) || null; }

  return {
    isEnabled, hasKey, hasPassword, hasCrypto, dataCryptoKey,
    setPassword, unlock, encryptInto, lockNow, changePassword, disable, wipe,
    showScreen, hideScreen, showScreenRemote, unlockRemote, ensureMetaIfNeeded, meta,
    ENC_KEY, DB_KEY, LOCK_KEY
  };
})();
