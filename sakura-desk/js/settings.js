/* ===== 数据管理（原「设置」）：仅保留导入 / 导出 / 演示 / 清空 ===== */
window.Views = window.Views || {};

function syncErrHint(err) {
  const m = (err && err.message) || String(err);
  if (/insecure/.test(m)) return '当前地址不是 https，无法加密同步。请用你部署的公网 https 链接打开';
  if (/401/.test(m)) return 'Token 无效或已过期。请确认：①用的是「Tokens (classic)」而不是细粒度 token；②没有过期';
  if (/403/.test(m)) return 'Token 没有 gist 权限或被限流。请重新生成 classic token 并勾选 gist 这一项';
  if (/404/.test(m)) return '空间不存在或无权访问：请检查同步空间 ID 是否复制完整、Token 是否正确。若 ID 已失效，清空「同步空间 ID」后重新点「连接/初始化」即可新建一个';
  if (/Failed to fetch|network|timeout|ERR_|net::/i.test(m)) return '连不上 GitHub（国内常见网络问题）。请检查网络后重试，或改用我帮你做的免 token 方案';
  if (/创建失败/.test(m)) return m.replace('创建失败', '创建同步空间失败');
  return m;
}

const Settings = (() => {
  function brandLogoHTML(src) {
    if (src) return `<img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block" alt="逸云阁">`;
    return `<svg viewBox="0 0 40 40" style="width:38px;height:38px"><g fill="#f9709d">
      <ellipse cx="20" cy="9" rx="5" ry="7.5"/><ellipse cx="30.4" cy="16.6" rx="5" ry="7.5" transform="rotate(72 30.4 16.6)"/>
      <ellipse cx="26.5" cy="28.8" rx="5" ry="7.5" transform="rotate(144 26.5 28.8)"/><ellipse cx="13.5" cy="28.8" rx="5" ry="7.5" transform="rotate(216 13.5 28.8)"/>
      <ellipse cx="9.6" cy="16.6" rx="5" ry="7.5" transform="rotate(288 9.6 16.6)"/><circle cx="20" cy="20" r="3.4" fill="#fff7fa"/></g></svg>`;
  }

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'settings') return;
    const d = DB.data;
    const sc = (DB.data.settings.sync) || {};
    const size = (() => { try { return (JSON.stringify(d).length / 1024).toFixed(1) + ' KB'; } catch (e) { return '-'; } })();
    const savedAt = d.__savedAt ? U.fmtTime(d.__savedAt) : '尚未保存';
    const lastBk = d.settings.lastBackupAt ? U.fmtTime(d.settings.lastBackupAt) : null;
    const preImp = DB.preImportInfo();

    // 当前打开的若是「含数据的离线版」文件，明确告知里面装了什么、是否已经载入
    const emb = window.__EMBEDDED_BACKUP__;
    const embC = emb && emb.__backup ? emb.__backup.counts : null;
    const embAt = emb && emb.__backup && emb.__backup.exportedAt
      ? new Date(emb.__backup.exportedAt).toLocaleString('zh-CN', { hour12: false }) : '';
    const embHTML = embC ? `
      <div class="edit-time" style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <svg class="ico"><use href="#i-download"/></svg>
        <span>本文件自带一份备份（学员 ${embC.students} · 课程 ${embC.lessons}${embAt ? ' · 导出于 ' + embAt : ''}）：
          ${d.__fromEmbedded ? '<b>已自动载入</b>' : '本机已有数据，<b>未自动载入</b>'}</span>
        ${d.__fromEmbedded ? '' : '<button class="btn btn-ghost btn-sm" data-act="useEmbedded">改用文件内的数据</button>'}
      </div>` : '';

    root.innerHTML = `
    <div class="grid g2">
      <div class="card">
        <div class="card-h"><h3>数据管理</h3><span class="sub">本地存储 ${size}</span></div>
        <div class="edit-time" style="margin-bottom:10px">
          <svg class="ico"><use href="#i-bell"/></svg>已自动保存在本机浏览器 · 上次保存：${savedAt}</div>
        <p class="muted" style="font-size:12.5px;margin-bottom:12px">
          每次操作都会自动保存到本机浏览器（关掉再开数据还在）。但浏览器本地存储按「设备+浏览器」隔离，<b>换设备、换浏览器、清缓存或隐私模式都会看不到这份数据</b>。</p>
        <div style="display:flex;flex-wrap:wrap;gap:9px">
          <button class="btn btn-primary" data-act="backupNow">立即备份</button>
          <button class="btn btn-ghost" data-act="export">导出备份 JSON</button>
          <button class="btn btn-ghost" data-act="import">导入备份</button>
          <button class="btn btn-ghost" data-act="demo">载入演示数据</button>
          <button class="btn btn-danger" data-act="clear">清空全部数据</button>
        </div>
        <div class="edit-time ${lastBk && Date.now() - d.settings.lastBackupAt > 7 * 86400000 ? 'warn' : ''}" style="margin-top:10px">
          <svg class="ico"><use href="#i-check"/></svg>
          ${lastBk ? `上次导出备份：${lastBk}` : '还没有导出过备份，建议现在导出一份存到手机或网盘'}</div>
        ${preImp ? `<div class="edit-time hide-on-mobile" style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span>已保留「${U.fmtTime(preImp.at)} 导入前」的数据快照${preImp.counts ? `（学员 ${preImp.counts.students} · 课程 ${preImp.counts.lessons}）` : ''}</span>
          <button class="btn btn-ghost btn-sm" data-act="undoImport">撤销上次导入</button>
        </div>` : ''}
        ${embHTML}
        <input type="file" id="fileIn" accept="application/json" style="display:none">

        <div class="divider"></div>
        <div class="card-h" style="margin-bottom:6px"><h3 style="font-size:14px">网页本身的备份</h3></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:12px">
          上面备份的是<b>数据</b>；这里备份的是<b>整个网页程序</b>。生成的是一个自带全部代码的单文件，
          存到手机或电脑后<b>双击就能直接打开使用</b>，即使本网址失效也不受影响。</p>
        <div style="display:flex;flex-wrap:wrap;gap:9px">
          <button class="btn btn-primary" data-act="offlineData">生成离线版（含当前数据）</button>
          <button class="btn btn-ghost" data-act="offlinePure">生成离线版（空白程序）</button>
        </div>
        <div class="divider"></div>
        <div class="grid g4" style="gap:10px">
          <div class="stat"><div class="lab">学员</div><div class="val">${d.students.length}</div></div>
          <div class="stat"><div class="lab">课程</div><div class="val">${d.lessons.length}</div></div>
          <div class="stat"><div class="lab">提醒事项</div><div class="val">${d.todos.length}</div></div>
          <div class="stat"><div class="lab">日程</div><div class="val">${(d.events || []).length}</div></div>
        </div>
      </div>

      <div class="card" style="display:flex;flex-direction:column">
        <div class="card-h"><h3>应用图标（逸云阁头像）</h3></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:12px">上传一张图片替换侧边栏的逸云阁图标，仅保存在本机与加密云同步中，不上传服务器。</p>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div id="brandPreview" style="width:64px;height:64px;border-radius:14px;overflow:hidden;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;background:var(--pink-50);flex:none">${brandLogoHTML(DB.data.settings.brandLogo)}</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <input type="file" id="brandFile" accept="image/*" style="display:none">
            <div style="display:flex;gap:9px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" data-act="brandUpload">上传图片</button>
              ${DB.data.settings.brandLogo ? '<button class="btn btn-ghost btn-sm" data-act="brandReset">恢复默认</button>' : ''}
            </div>
            <span class="muted" style="font-size:11px">建议正方形图片，自动缩放至 256×256</span>
          </div>
        </div>
        <div class="divider"></div>
        <div class="card-h" style="margin-bottom:6px"><h3 style="font-size:14px">外观（夜览模式）</h3></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:14px">开启后整体切换为深色背景，夜晚或弱光下更护眼。</p>
        <div style="display:flex;align-items:center;gap:12px;cursor:pointer" data-act="nightToggle">
          <div class="switch ${DB.data.settings.night ? 'on' : ''}"></div>
          <span style="font-size:13.5px">${DB.data.settings.night ? '夜览模式：已开启' : '夜览模式：未开启'}</span>
        </div>
      </div>

      <div class="card" style="grid-column:1/-1">
        <div class="card-h"><h3>云同步（免费 · 三端统一）</h3><span class="sub sync-status" id="syncStatus">未连接</span></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:12px">
          把数据存到一份加密的私密空间，手机 / 平板 / 电脑三端自动同步、统一数据。
          <b>隐私保护：上传前数据会先在本机用 AES 加密（密钥由你的 Token 生成），明文绝不出本机；即便空间链接泄露，他人也只看到乱码。</b>
          Token 仅保存在本机浏览器。<b style="color:#b5587a">国内访问 GitHub 经常连不上，建议选「码云 Gitee（国内更稳）」。</b></p>
        <div class="field" style="max-width:440px">
          <label>同步服务商</label>
          <select class="input" id="syncProvider">
            <option value="github" ${(sc.provider || 'github') !== 'gitee' ? 'selected' : ''}>GitHub（国际，国内偶尔慢）</option>
            <option value="gitee" ${(sc.provider || 'github') === 'gitee' ? 'selected' : ''}>码云 Gitee（国内，访问更稳 · 推荐）</option>
          </select>
        </div>
        <div class="field" style="max-width:440px">
          <label id="syncTokenLabel">访问令牌 Token</label>
          <input class="input" id="syncToken" type="password" placeholder="ghp_xxx（GitHub）或 gitee_xxx（Gitee）" value="${(sc.token || '').replace(/"/g, '&quot;')}">
        </div>
        <div class="field" style="max-width:440px">
          <label>同步空间 ID<span class="hint">留空则自动创建新空间。<b>多端共用同一份数据：</b>请在电脑端连接后，复制下方自动生成的<b>真实空间 ID（一长串字符）</b>填到这里。⚠️ 不要自己起名（如 20260802）——GitHub 不认自定义名，各端会各自新建、无法同步。</span></label>
          <input class="input" id="syncGistId" placeholder="留空自动创建；多端共用请填电脑端生成的真实空间 ID" value="${(sc.gistId || '').replace(/"/g, '&quot;')}">
          <p class="hint" id="syncIdTip" style="display:none;margin-top:8px">
            <b>本机当前的真实空间 ID（GitHub 自动分配，无法自定义）：</b><br>
            <span class="mono" id="syncIdShown" style="word-break:break-all;display:inline-block;margin:4px 0"></span>
            <button class="btn btn-primary btn-sm" data-act="copyId" style="margin-left:6px;vertical-align:middle">复制此 ID</button><br>
            <b style="color:#1a9d6b">空间指纹：<span class="mono" id="syncFpShown" style="color:#1a9d6b"></span></b>
            <span class="muted" style="font-size:11.5px">（由 ID 推导，两端连到同一份数据则指纹必相同）</span><br>
            <b>多端共用同一份数据：在其他设备填<b>同一个</b>真实 ID，再回来对比指纹——一致说明两端连到同一份数据。</b>
          </p>
        </div>
        <label class="switch-row" style="margin:12px 0">
          <input type="checkbox" id="syncAuto" ${sc.auto !== false ? 'checked' : ''}> 自动同步（改动后自动上传，并每 20 秒自动拉取其他端的更新）
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:9px">
          <button class="btn btn-primary" data-act="connect">连接 / 初始化</button>
          <button class="btn btn-ghost" data-act="push">立即上传</button>
          <button class="btn btn-ghost" data-act="pull">下载同步</button>
          <button class="btn btn-ghost" data-act="syncHelp">如何获取 Token？</button>
        </div>
        <div class="sync-help" id="syncHelp" style="display:none;margin-top:14px">
          <b>① 获取免费 Token（GitHub）</b>
          <ol style="margin:6px 0 10px 18px;font-size:12.5px;line-height:1.9">
            <li>打开 <span class="mono">github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)</span></li>
            <li>点 <b>Generate new token (classic)</b>，备注随便写，<b>只勾选 gist</b> 这一项，有效期选最长</li>
            <li>生成后复制以 <span class="mono">ghp_</span> 开头的字符串，粘到上方输入框，点「连接 / 初始化」</li>
          </ol>
          <b>① 获取免费 Token（码云 Gitee，国内更稳 · 推荐）</b>
          <ol style="margin:6px 0 10px 18px;font-size:12.5px;line-height:1.9">
            <li>打开 <span class="mono">gitee.com</span> 注册/登录（国内网站，中文界面），点右上角头像 → <b>设置 → 私人令牌</b></li>
            <li>点 <b>生成新令牌</b>，勾选 <b>gists（代码片段）</b> 权限，提交后复制以 <span class="mono">gitee_</span> 开头的字符串</li>
            <li>回到本页，先把上方「同步服务商」选成 <b>码云 Gitee</b>，再把令牌粘到 Token 框，点「连接 / 初始化」</li>
          </ol>
          <b>② 让手机流量也能打开应用（免费托管）</b>
          <p class="muted" style="font-size:12.5px;margin:4px 0 8px">
            同步解决的是「数据统一」；应用本身要被手机流量打开，还需托管到公网。把整个 <span class="mono">sakura-desk</span> 文件夹推到 GitHub 仓库并开启 <b>Pages</b> 即可，得到一个 <span class="mono">https://你的名.github.io/仓库名/</span> 的公网地址，三端都访问它。<b>云同步只在 https 地址下才会启用（本地加密上传），局域网 http 地址不会上传数据。</b>需要我给你一份一键命令清单吗？</p>
        </div>
      </div>

    </div>`;

    U.rebind(root, 'settings', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      // 先同步云同步两个输入框到配置（多设备共用需填同一 Token + 同一空间 ID）
      Sync.cfg().token = U.$('#syncToken', root).value.trim();
      Sync.cfg().gistId = U.$('#syncGistId', root).value.trim();
      const provSel = U.$('#syncProvider', root);
      if (provSel) Sync.cfg().provider = provSel.value;
        switch (b.dataset.act) {
        case 'backupNow': {
          const name = DB.exportJSON();
          U.toast(name ? `已备份「${name}」` : '备份失败', name ? 'ok' : 'warn');
          render();
          break;
        }
        case 'nightToggle': {
          const on = !DB.data.settings.night;
          DB.data.settings.night = on; DB.save();
          App.applyNight();
          U.toast(on ? '已开启夜览模式' : '已关闭夜览模式', 'ok');
          render();
          break;
        }
        case 'export': {
          const name = DB.exportJSON();
          U.toast(name ? `已导出「${name}」，请到浏览器的「下载」里查看` : '导出失败', name ? 'ok' : 'warn');
          render();
          break;
        }
        case 'import':
          U.$('#fileIn', root).click(); break;
        case 'offlineData': makeOffline(true); break;
        case 'offlinePure': makeOffline(false); break;
        case 'useEmbedded':
          U.confirm('改用本文件自带的备份数据？当前数据会被覆盖（可随时「撤销上次导入」还原）。', () => {
            try {
              DB.importJSON(JSON.stringify(window.__EMBEDDED_BACKUP__));
              App.boot(); U.toast('已载入文件自带的数据', 'ok');
            } catch (err) { U.toast('载入失败：' + err.message, 'warn'); }
          }, '覆盖载入');
          break;
        case 'undoImport':
          if (U.isMobile()) { U.toast('撤销导入请在电脑端操作', 'warn'); break; }
          U.confirm('撤销上次导入，把数据恢复到导入前的状态？', () => {
            try { DB.restorePreImport(); App.boot(); U.toast('已恢复到导入前的数据', 'ok'); }
            catch (err) { U.toast('撤销失败：' + err.message, 'warn'); }
          }, '恢复');
          break;
        case 'demo':
          U.confirm('载入演示数据会覆盖当前全部数据，确定吗？', () => { DB.reset(true); App.boot(); U.toast('已载入演示数据'); }, '覆盖载入');
          break;
        case 'clear':
          U.confirm('清空后无法恢复（模板与话术会保留初始版本），建议先导出备份。确定清空？', () => {
            DB.reset(false); App.boot(); U.toast('已清空');
          }, '确认清空');
          break;
        case 'connect':
          if (!Sync.cfg().token) { U.toast('请先填写 Token', 'warn'); break; }
          DB.save();
          const hadGistId = !!(Sync.cfg().gistId || '').trim();
          Sync.ensureGist().then(() => {
            const _id = Sync.cfg().gistId || '';
            U.$('#syncGistId', root).value = _id;
            const _tip = U.$('#syncIdTip', root);
            if (_tip) {
              const _shown = U.$('#syncIdShown', root); if (_shown) _shown.textContent = _id;
              const _fp = U.$('#syncFpShown', root); if (_fp) _fp.textContent = Sync.fingerprint(_id) || '（无法识别）';
              _tip.style.display = 'block';
            }
            if (hadGistId) {
              U.toast('已连接到现有空间！请确认下方「空间指纹」与另一端的指纹一致，即说明两端连到同一份数据', 'ok', 6000);
            } else {
              U.toast('已连接！已生成真实空间 ID，请复制它到其他设备共用（不要自己起名）', 'ok', 6000);
            }
            Sync.refreshStatus();
            Sync.startAutoPull();
          }).catch(err => U.toast('连接失败：' + syncErrHint(err), 'warn'));
          break;
        case 'push':
          if (!Sync.cfg().token) { U.toast('请先填写 Token', 'warn'); break; }
          DB.save();
          Sync.push(true).then(() => U.toast('已上传到云端')).catch(err => { if (err.message !== 'conflict') U.toast('上传失败：' + syncErrHint(err), 'warn'); });
          break;
        case 'pull':
          if (!Sync.cfg().token) { U.toast('请先填写 Token', 'warn'); break; }
          DB.save();
          Sync.pull().then(() => U.toast('已从云端下载')).catch(err => U.toast('下载失败：' + err.message, 'warn'));
          break;
        case 'copyId': {
          if (!Sync.cfg().gistId) { U.toast('当前没有可复制的空间 ID', 'warn'); break; }
          const id = Sync.cfg().gistId;
          const done = () => U.toast('已复制空间 ID', 'ok');
          const fallback = () => { const ta = document.createElement('textarea'); ta.value = id; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) { U.toast('复制失败，请手动复制：' + id, 'warn'); } document.body.removeChild(ta); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).then(done).catch(fallback); else fallback();
          break;
        }
        case 'syncHelp':
          const h = U.$('#syncHelp', root); if (h) h.style.display = (h.style.display === 'none' ? 'block' : 'none');
          break;
        case 'brandUpload':
          U.$('#brandFile', root).click();
          break;
        case 'brandReset':
          DB.data.settings.brandLogo = '';
          DB.save();
          if (window.Brand) Brand.apply();
          render();
          U.toast('已恢复默认图标');
          break;
      }
    });
    U.$('#syncAuto', root).onchange = e => {
      Sync.cfg().auto = e.target.checked; DB.save();
      if (Sync.cfg().auto) Sync.startAutoPull(); else Sync.stopAutoPull();
    };
    const provSel = U.$('#syncProvider', root);
    if (provSel) provSel.onchange = e => {
      Sync.cfg().provider = e.target.value;
      Sync.cfg().gistId = '';            // 切换服务商后旧空间不可用，强制重新连接
      DB.save();
      U.$('#syncGistId', root).value = '';
      const lbl = U.$('#syncTokenLabel', root);
      if (lbl) lbl.textContent = (e.target.value === 'gitee') ? '访问令牌 Token（Gitee 私人令牌，gitee_ 开头）' : '访问令牌 Token（GitHub，ghp_ 开头）';
      U.toast('已切换为 ' + (e.target.value === 'gitee' ? '码云 Gitee' : 'GitHub') + '，请重新填写令牌并点「连接 / 初始化」', 'ok');
      Sync.refreshStatus();
    };
    if (sc.gistId) {
      const tip = U.$('#syncIdTip', root);
      if (tip) {
        const shown = U.$('#syncIdShown', root); if (shown) shown.textContent = sc.gistId;
        const fp = U.$('#syncFpShown', root); if (fp) fp.textContent = Sync.fingerprint(sc.gistId) || '（无法识别）';
        tip.style.display = 'block';
      }
    }
    Sync.refreshStatus();

    U.$('#fileIn', root).onchange = e => {
      const f = e.target.files[0];
      e.target.value = '';                       // 清空以便重复选同一文件
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        // 先只解析、不写入：解析失败则原数据分毫不动
        let info;
        try { info = DB.parseBackup(r.result); }
        catch (err) { U.toast('这个文件读不了：' + err.message + '（当前数据未改动）', 'warn'); return; }
        const cur = { students: DB.data.students.length, lessons: DB.data.lessons.length, todos: DB.data.todos.length, events: (DB.data.events || []).length };
        const when = info.exportedAt ? new Date(info.exportedAt).toLocaleString('zh-CN') : '未知时间';
        U.modal({
          title: '确认导入备份',
          okText: '确认覆盖导入',
          body: `<p style="font-size:13.5px;line-height:1.8;margin-bottom:10px">
              导入会用备份文件<b style="color:var(--danger,#e5484d)">整体覆盖</b>当前全部数据（不是合并）。请核对下面两组数字：</p>
            <div class="grid g2" style="gap:10px">
              <div class="stat"><div class="lab">备份文件 · ${U.esc(when)}</div>
                <div class="val" style="font-size:14px">学员 ${info.counts.students} · 课程 ${info.counts.lessons} · 提醒 ${info.counts.todos} · 日程 ${info.counts.events || 0}</div></div>
              <div class="stat"><div class="lab">当前数据（将被覆盖）</div>
                <div class="val" style="font-size:14px">学员 ${cur.students} · 课程 ${cur.lessons} · 提醒 ${cur.todos} · 日程 ${cur.events || 0}</div></div>
            </div>
            <p class="muted" style="font-size:12.5px;line-height:1.8;margin-top:10px">
              系统会自动保留一份「导入前快照」。导入后若发现不对，回到本页点<b>「撤销上次导入」</b>即可原样还原。</p>`,
          onOk: () => {
            try { DB.importJSON(r.result); App.boot(); U.toast('导入成功，已保留导入前快照可撤销', 'ok'); }
            catch (err) { U.toast('导入失败：' + err.message + '（原数据未改动）', 'warn'); }
          }
        });
      };
      r.onerror = () => U.toast('文件读取失败，当前数据未改动', 'warn');
      r.readAsText(f);
    };

    /* ---------- 应用图标：上传后自动缩放至 256×256 再存储 ---------- */
    const brandFile = U.$('#brandFile', root);
    if (brandFile) brandFile.onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = 256, c = document.createElement('canvas'); c.width = s; c.height = s;
          const ctx2 = c.getContext('2d');
          const scale = Math.max(s / img.width, s / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx2.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
          try {
            DB.data.settings.brandLogo = c.toDataURL('image/png');
            DB.save();
            if (window.Brand) Brand.apply();
            U.toast('图标已更换', 'ok');
          } catch (err) { U.toast('图片处理失败，请换一张', 'warn'); }
        };
        img.onerror = () => U.toast('图片读取失败', 'warn');
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };

  }

  /* ===== 生成「离线单文件版」=====
     把当前网页用到的 CSS / JS 全部抓下来内联进一个 .html 文件。
     生成的文件不依赖任何服务器，双击即可运行；withData=true 时把当前数据一并封进去，
     打开后若本机还没有数据就直接用它开局（原网页失效也能立刻看到全部记录）。 */
  async function makeOffline(withData) {
    if (window.__OFFLINE_BUILD__) {
      U.toast('当前打开的已经是离线版了，用浏览器「另存为」即可再复制一份', 'warn');
      return;
    }
    let snapshot = null;
    if (withData) {
      snapshot = DB.buildSnapshot();
      if (!snapshot) { U.toast('请先解锁应用，再生成含数据的离线版', 'warn'); return; }
    }
    U.toast('正在打包离线版，请稍候…');
    try {
      // 在线版用的「离线模板」由 build-offline.js 预先内联好（window.__OFFLINE_TEMPLATE__），
      // 通过 lazy 注入 <script src="offline-template.js"> 加载，完全不依赖 fetch，
      // 因此在预览沙箱（opaque-origin iframe）等环境也能稳定打包。
      if (!window.__OFFLINE_TEMPLATE__) {
        const ok = await new Promise(res => {
          const s = document.createElement('script');
          s.src = 'offline-template.js';
          s.onload = () => res(true);
          s.onerror = () => res(false);
          document.head.appendChild(s);
        });
        if (!ok || !window.__OFFLINE_TEMPLATE__) {
          throw new Error('离线模板加载失败，请刷新页面后重试');
        }
      }
      let html = window.__OFFLINE_TEMPLATE__;

      const meta = { builtAt: new Date().toISOString(), withData: !!withData, from: location.host };
      // 转义 < >：防止课程/学员/备注等字段含 </script> 时提前闭合脚本块（数据损坏 + 存储型 XSS）
      const escJson = s => JSON.stringify(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      let inject = `<script>window.__OFFLINE_BUILD__=${escJson(meta)};</script>`;
      if (withData) inject += `<script>window.__EMBEDDED_BACKUP__=${escJson(snapshot.obj)};</script>`;
      // 模板缺失 </head> 时退而求其次注入 </body>，再不行追加到末尾，避免静默丢失离线数据
      if (html.includes('</head>')) html = html.replace('</head>', inject + '</head>');
      else if (html.includes('</body>')) html = html.replace('</body>', inject + '</body>');
      else html += inject;
      html = html.replace(/<title>([^<]*)<\/title>/, '<title>$1 · 离线版</title>');

      const p = n => String(n).padStart(2, '0');
      const d = new Date();
      const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
      const fname = withData ? `逸云阁工作台_含数据_${stamp}.html` : `逸云阁工作台_离线版_${stamp}.html`;

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);

      const kb = (blob.size / 1024).toFixed(0);
      U.toast(`已生成「${fname}」（${kb}KB），存到手机或网盘即可长期保存`, 'ok');
    } catch (err) {
      U.toast('打包失败：' + (err && err.message ? err.message : err) + '（可改用「导出备份 JSON」）', 'warn');
    }
  }

  Views.settings = { title: '数据管理', sub: '导入 / 导出 / 清空 · 编码规范说明', render() { render(); } };
  return { render };
})();