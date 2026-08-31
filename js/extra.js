/* ===== 更多 / AI助手 / 帮助 / 搜索 / 关联 / 更新日志 ===== */
window.Views = window.Views || {};

/* ---------- 全局搜索 ---------- */
const Search = (() => {
  function results(kw) {
    if (!kw) return `<div class="muted" style="padding:24px;text-align:center">输入关键词，搜索学员 / 提醒事项 / 课表 / 话术</div>`;
    const k = kw.toLowerCase();
    const stu = DB.data.students.filter(s => (s.code + s.parentName + s.grade + s.subject).toLowerCase().includes(k));
    const todo = DB.data.todos.filter(t => t.title.toLowerCase().includes(k));
    const les = DB.data.lessons.filter(l => { const s = DB.student(l.studentId); return (s && (s.parentName + s.grade + s.subject).toLowerCase().includes(k)) || (l.note || '').toLowerCase().includes(k); });
    const ph = DB.data.phrases.filter(p => (p.title + p.content).toLowerCase().includes(k));
    let h = '';
    if (stu.length) h += `<div class="search-grp">学员档案 · ${stu.length}</div>` + stu.slice(0, 8).map(s =>
      `<div class="search-row" data-go="students"><div class="si" style="background:${U.subColor(s.subject)}">${U.esc(s.parentName.slice(0, 1))}</div>
       <div><div class="st">${U.esc(s.parentName)}</div><div class="ss">${U.esc(s.grade + s.subject)} · ${U.esc(s.code)}</div></div></div>`).join('');
    if (todo.length) h += `<div class="search-grp">提醒事项 · ${todo.length}</div>` + todo.slice(0, 8).map(t =>
      `<div class="search-row" data-go="todo"><div class="si" style="background:#f2b544">待</div>
       <div><div class="st">${U.esc(t.title)}</div><div class="ss">${U.cnDate(t.date)} · ${t.status === 'done' ? '已完成' : t.status === 'blocked' ? '今日无法完成' : '未完成'}</div></div></div>`).join('');
    if (les.length) h += `<div class="search-grp">课表 · ${les.length}</div>` + les.slice(0, 8).map(l => {
      const s = DB.student(l.studentId) || {};
      return `<div class="search-row" data-go="schedule"><div class="si" style="background:${U.subColor(s.subject)}">课</div>
       <div><div class="st">${U.esc((s.grade || '') + (s.subject || '') + '·' + (s.parentName || ''))}</div><div class="ss">${l.date} ${l.start} · ${U.money(l.tuition)}</div></div></div>`;
    }).join('');
    if (ph.length) h += `<div class="search-grp">话术 · ${ph.length}</div>` + ph.slice(0, 8).map(p =>
      `<div class="search-row" data-go="scripts"><div class="si" style="background:#8fb8f0">话</div>
       <div><div class="st">${U.esc(p.title)}</div><div class="ss">${U.esc(p.content.slice(0, 22))}…</div></div></div>`).join('');
    return h || `<div class="muted" style="padding:24px;text-align:center">没有匹配「${U.esc(kw)}」的结果</div>`;
  }
  function open() {
    const m = U.modal({ title: '全局搜索', hideFoot: true, wide: true, body:
      `<div class="search-panel">
        <div class="search-bar"><svg class="ico"><use href="#i-search"/></svg>
          <input id="sIn" placeholder="搜索学员、提醒事项、课表、话术…" autocomplete="off"></div>
        <div class="search-res" id="sRes"></div>
      </div>` });
    const inp = U.$('#sIn', m.body), res = U.$('#sRes', m.body);
    const run = () => {
      res.innerHTML = results(inp.value.trim());
      res.querySelectorAll('[data-go]').forEach(r => r.onclick = () => { r.closest('.mask').remove(); App.go(r.dataset.go); });
    };
    inp.addEventListener('input', run);
    inp.focus(); run();
  }
  return { open };
})();
window.Search = Search;

/* ---------- 更多 / 我的 ---------- */
const More = (() => {
  let _syncing = false;
  function setSyncing(root, kind) {
    _syncing = true;
    const st = U.$('#mSyncState', root);
    if (st) st.textContent = kind === 'push' ? '↥ 正在上传到云端…' : '↧ 正在从云端下载…';
    root.querySelectorAll('[data-act="m-push"],[data-act="m-pull"]').forEach(b => { b.disabled = true; });
  }
  // 教务模块：手机端从底部导航移除「学员」后，统一在这里入口（移动端才显示）
  const moduleTiles = [
    { go: 'students', ic: 'i-user', name: '学员档案', desc: '学员与编码' },
    { go: 'schedule', ic: 'i-cal', name: '可视化课表', desc: '排课总览' },
    { go: 'finance', ic: 'i-coin', name: '财务统计', desc: '三本账' },
    { go: 'scripts', ic: 'i-chat', name: '常用话术', desc: '标准回复' }
  ];
  // 工具入口：桌面 / 手机都显示
  const toolTiles = [
    { act: 'search', ic: 'i-search', name: '搜索', desc: '全局查找' },
    { go: 'ai', ic: 'i-ai', name: 'AI 助手', desc: '逸云小助手' },
    { go: 'help', ic: 'i-help', name: '帮助', desc: '使用指南' },
    { go: 'changelog', ic: 'i-log', name: '更新日志', desc: '版本记录' }
  ];

  function syncCardHTML() {
    const s = (DB.data.settings.sync) || {};
    const secure = (typeof window !== 'undefined' && window.isSecureContext);
    if (!secure) {
      return `<div class="card only-mobile"><div class="edit-time" style="margin:0">
        <svg class="ico"><use href="#i-help"/></svg>当前不是 https 地址，无法使用云同步。请用你部署的公网 https 地址打开。</div></div>`;
    }
    const connected = s.token && s.gistId;
    if (!connected) {
      return `<div class="card only-mobile" style="background:linear-gradient(120deg,var(--card),var(--pink-50));border-color:var(--pink-200)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><b style="font-size:14px">☁ 云同步</b></div>
          <button class="btn btn-primary btn-sm" data-go="settings">去连接</button>
        </div></div>`;
    }
    const last = s.lastSync ? U.fmtTime(s.lastSync) : '尚未同步';
    return `<div class="card only-mobile" style="background:linear-gradient(120deg,var(--card),#eefaf1);border-color:#bfe6c9">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><b style="font-size:14px">☁ 云同步</b>
          <div class="muted" style="font-size:12px">已连接 · 上次 ${last}</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-act="m-push">立即上传</button>
          <button class="btn btn-ghost btn-sm" data-act="m-pull">下载同步</button>
          <button class="btn btn-ghost btn-sm" data-go="settings">设置</button>
        </div>
      </div>
      <div id="mSyncState" class="muted" style="font-size:12px;margin-top:8px;min-height:16px"></div>
    </div>`;
  }

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'more') return;
    root.innerHTML = `
    <div class="more-view">
      <div class="card brand-card" style="margin-bottom:12px;background:linear-gradient(120deg,var(--card),var(--pink-50));border-color:var(--pink-200)">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="brand-mark" style="width:36px;height:36px;color:var(--pink-400)">
            <svg viewBox="0 0 40 40"><g fill="currentColor">
              <ellipse cx="20" cy="9" rx="5" ry="7.5"/><ellipse cx="30.4" cy="16.6" rx="5" ry="7.5" transform="rotate(72 30.4 16.6)"/>
              <ellipse cx="26.5" cy="28.8" rx="5" ry="7.5" transform="rotate(144 26.5 28.8)"/><ellipse cx="13.5" cy="28.8" rx="5" ry="7.5" transform="rotate(216 13.5 28.8)"/>
              <ellipse cx="9.6" cy="16.6" rx="5" ry="7.5" transform="rotate(288 9.6 16.6)"/><circle cx="20" cy="20" r="3.4" fill="#fff7fa"/></g></svg>
          </div>
          <div>
            <h2 style="font-size:17px">我的 · 逸云阁</h2>
            <p class="muted" style="font-size:12px">所有模块与工具，在这里都能找到</p>
          </div>
        </div>
      </div>
      <div class="mt-grid">
        ${moduleTiles.map(t => `<div class="mtile only-mobile" data-go="${t.go}">
          <div class="ic"><svg class="ico"><use href="#${t.ic}"/></svg></div>
          <b>${t.name}</b><small>${t.desc}</small></div>`).join('')}
        ${toolTiles.map(t => `<div class="mtile" ${t.go ? `data-go="${t.go}"` : `data-act="${t.act}"`}>
          <div class="ic"><svg class="ico"><use href="#${t.ic}"/></svg></div>
          <b>${t.name}</b><small>${t.desc}</small></div>`).join('')}
      </div>
      <div class="more-sync-row">
        <div class="card" style="margin:0">
          <div class="card-h"><h3>导入数据</h3></div>
          <button class="btn btn-primary btn-sm" data-act="m-import">选择备份文件导入</button>
          <input type="file" id="mFileIn" accept="application/json" style="display:none">
        </div>
        ${syncCardHTML()}
      </div>
    </div>`;
    U.rebind(root, 'more', e => {
      const tile = e.target.closest('[data-go],[data-act]'); if (!tile) return;
      const act = tile.dataset.act;
      if (act === 'search') { Search.open(); return; }
      if (act === 'm-push') {
        if (!Sync.cfg().token) { U.toast('请先在「数据管理」填写 Token 并连接', 'warn'); App.go('settings'); return; }
        if (_syncing) return;
        setSyncing(root, 'push');
        Sync.push(true).then(() => { _syncing = false; U.toast('已上传到云端', 'ok'); render(); })
          .catch(err => {
            _syncing = false;
            if (err.message === 'conflict') U.toast('云端有更新的数据，请先「下载同步」再上传', 'warn');
            else U.toast('上传失败：' + (window.syncErrHint ? syncErrHint(err) : err.message), 'warn');
            render();
          });
        return;
      }
      if (act === 'm-pull') {
        if (!Sync.cfg().token) { U.toast('请先连接云同步', 'warn'); App.go('settings'); return; }
        if (_syncing) return;
        setSyncing(root, 'pull');
        Sync.pull().then(() => { _syncing = false; U.toast('已从云端下载', 'ok'); render(); })
          .catch(err => { _syncing = false; U.toast('下载失败：' + (err.message || err), 'warn'); render(); });
        return;
      }
      if (act === 'm-import') { const fi = U.$('#mFileIn', root); if (fi) fi.click(); return; }
      if (tile.dataset.go) App.go(tile.dataset.go);
    });

    const mFile = U.$('#mFileIn', root);
    if (mFile) mFile.onchange = e => {
      const f = e.target.files[0];
      e.target.value = '';                       // 清空以便重复选同一文件
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        let info;
        try { info = DB.parseBackup(r.result); }
        catch (err) { U.toast('这个文件读不了：' + err.message + '（当前数据未改动）', 'warn'); return; }
        const cur = { students: DB.data.students.length, lessons: DB.data.lessons.length, todos: DB.data.todos.length };
        const when = info.exportedAt ? new Date(info.exportedAt).toLocaleString('zh-CN') : '未知时间';
        U.modal({
          title: '确认导入备份', okText: '确认覆盖导入',
          body: `<p style="font-size:13.5px;line-height:1.8;margin-bottom:10px">导入会用备份文件<b style="color:var(--danger,#e5484d)">整体覆盖</b>当前全部数据（不是合并）。请核对：</p>
            <div class="grid g2" style="gap:10px">
              <div class="stat"><div class="lab">备份文件 · ${U.esc(when)}</div><div class="val" style="font-size:14px">学员 ${info.counts.students} · 课程 ${info.counts.lessons} · 待办 ${info.counts.todos}</div></div>
              <div class="stat"><div class="lab">当前数据（将被覆盖）</div><div class="val" style="font-size:14px">学员 ${cur.students} · 课程 ${cur.lessons} · 待办 ${cur.todos}</div></div>
            </div>
            <p class="muted" style="font-size:12.5px;line-height:1.8;margin-top:10px">系统会自动保留「导入前快照」。导入后若不对，回到电脑端「数据管理」点「撤销上次导入」即可还原。</p>`,
          onOk: () => {
            try { DB.importJSON(r.result); App.boot(); U.toast('导入成功，已保留导入前快照可撤销', 'ok'); }
            catch (err) { U.toast('导入失败：' + err.message + '（原数据未改动）', 'warn'); }
          }
        });
      };
      r.onerror = () => U.toast('文件读取失败，当前数据未改动', 'warn');
      r.readAsText(f);
    };
  }
  Views.more = { title: '我的', sub: '搜索 · AI 助手 · 帮助 · 更新日志', render() { render(); } };
  return { render };
})();

/* ---------- AI 助手（本地规则问答） ---------- */
const AI = (() => {
  let log = [];
  function reply(text) {
    const q = text.trim();
    if (!q) return '说点什么吧～比如「今天有几节课」';
    if (/(你好|您好|hi|hello|在吗|你是谁)/i.test(q)) return '你好呀，我是逸云小助手～可以问我：今天有几节课、本月抽成多少、怎么新建学员等。';
    if (/(今天|今日|今天有|今天几|今天还有)/.test(q)) {
      const t = U.today();
      const ls = DB.data.lessons.filter(l => l.date === t && l.status !== 'cancelled');
      const td = Todo.ofDate(t).filter(x => x.status !== 'done').length;
      return `今天排了 ${ls.length} 节课，还有 ${td} 条提醒事项未完成。` + (ls.length ? ` 第一节 ${ls[0].start} 开始。` : ' 今天没有排课，可以专心拓客～');
    }
    if (/(抽成|赚|收入|利润|多少钱)/.test(q)) {
      const a = U.monthFirst(U.today()), b = U.monthLast(U.today());
      const m = DB.statIn(a, b, { includeScheduled: true });
      const done = DB.statIn(a, b);
      return `本月（预计）抽成收入 ${U.money(m.profit)}，已落袋 ${U.money(done.profit)}，共 ${m.count} 节课、流水 ${U.money(m.gross)}。`;
    }
    if (/(待办|提醒|任务|还有什么|要做)/.test(q)) {
      const n = Todo.pendingCount();
      return `当前共有 ${n} 条未完成的提醒事项（含历史遗留）。打开「提醒事项」可以查看和处理，也可以一键导入每日模板。`;
    }
    if (/(学员|学生|档案|家长)/.test(q)) {
      return `现在有 ${DB.data.students.length} 位学员档案。新建学员可直接逐项填写学生姓名、年级学科、课时费、抽成等，保存后系统自动生成学员编码，无需手动拆解。`;
    }
    if (/(格式|编码|怎么填|怎么新建|怎么录)/.test(q)) {
      return '学员可逐项填写姓名、年级学科、课时费、抽成等，保存后系统自动生成学员编码（格式：日期-年级学科-家长-抽成/课时费|时长）。目前不支持粘贴式编码拆解录入，请逐项填写。';
    }
    if (/(课表|排课|冲突|时间)/.test(q)) {
      return '课表支持周/月/年视图，可拖拽改时间；同一时段允许排两节课，重叠会自动并排并红框提示，方便你确认。';
    }
    if (/(备份|导出|数据|丢失|换设备)/.test(q)) {
      return '所有数据都存在本机浏览器，不会上传。建议在「设置 - 数据管理」里定期导出 JSON 备份，换设备或清缓存前务必先备份。';
    }
    if (/(试课|回访|转换)/.test(q)) {
      return '把学员标记为「试课中」并填试课日期后，次日系统会自动在提醒事项生成一条「回访XX妈妈试课体验」，且不会重复生成。';
    }
    if (/(财务|三本账|老师|成本)/.test(q)) {
      return '作为中间人，每节课记录我的抽成与报销支出（批注里的花费），实际到手 = 我的抽成 − 报销支出。财务页可按月/年统计并排序板块。';
    }
    return '这个问题我还在学习～你可以试试问我：今天有几节课、本月抽成多少、怎么新建学员、数据怎么备份。也可以直接在对应模块操作。';
  }
  const quick = ['今天有几节课', '本月抽成多少', '怎么新建学员', '数据怎么备份'];

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'ai') return;
    if (!log.length) log = [{ me: false, text: '你好，我是逸云小助手 🌸 有任何关于逸云阁的使用问题都可以问我。' }];
    root.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <div class="ai-box">
        <div class="ai-log" id="aiLog">
          ${log.map(m => `<div class="ai-msg ${m.me ? 'me' : 'bot'}">
            <div class="av">${m.me ? '我' : '云'}</div>
            <div class="ai-bubble">${U.esc(m.text).replace(/\n/g, '<br>')}</div></div>`).join('')}
        </div>
        <div class="ai-quick">
          ${quick.map(q => `<button class="btn btn-ghost btn-sm" data-q="${U.esc(q)}">${U.esc(q)}</button>`).join('')}
        </div>
        <div class="ai-input">
          <input class="input" id="aiIn" placeholder="输入你的问题…" autocomplete="off">
          <button class="btn btn-primary" id="aiSend">发送</button>
        </div>
      </div>
    </div>`;
    const logEl = U.$('#aiLog', root), inp = U.$('#aiIn', root);
    const send = () => {
      const v = inp.value.trim(); if (!v) return;
      log.push({ me: true, text: v });
      const ans = reply(v);
      log.push({ me: false, text: ans });
      inp.value = '';
      render();
      const el = U.$('#aiLog'); if (el) el.scrollTop = el.scrollHeight;
    };
    U.$('#aiSend', root).onclick = send;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    root.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { inp.value = b.dataset.q; send(); });
    const el = U.$('#aiLog'); if (el) el.scrollTop = el.scrollHeight;
  }
  Views.ai = { title: 'AI 助手', sub: '逸云小助手 · 本地规则问答', render() { render(); } };
  return { render };
})();

/* ---------- 帮助 ---------- */
const Help = (() => {
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'help') return;
    const faq = [
      ['快速上手', '左侧（手机端底部）切换模块。主页聚合今日课程、提醒事项与模板；提醒事项支持模板一键导入；学员逐项填写后系统自动生成编码；老师名册是独立模块，可在学员档案下方找到。'],
      ['学员编码与录入', '新建学员逐项填写姓名、年级学科、课时费、抽成、时长等即可；保存后系统按「日期-年级学科-家长-抽成/课时费|时长」自动生成学员编码（例如 240815-高二数学-李妈妈-50/300|90），无需手动拆解。'],
      ['中间人三本账', '每节课记录我的抽成与报销支出，实际到手 = 我的抽成 − 报销支出（报销支出从批注数字提取）。抽成存绝对金额、每节课冗余存价格快照，保证历史账目不被改写。'],
      ['可视化课表', '周视图时间轴可拖拽改时间，重叠自动并排+红框提示；月视图看密度；年视图看淡旺季。同一时段允许排两节课。'],
      ['试课回访', '学员标记「试课中」+ 填试课日期，次日自动在提醒事项生成「回访XX妈妈试课体验」，幂等只生成一次。'],
      ['财务统计', '支持本月/上月/近30天/本年/自定义区间；年级饼图、老师课时排行、学员贡献、明细表；板块可排序与显隐。页面显示数据最近更新时间。'],
      ['数据备份', '数据仅存本机浏览器，不上传。设置-数据管理可导出/导入 JSON、载入演示数据、清空。换设备前务必导出备份。']
    ];
    root.innerHTML = `
    <div class="card">
      <div class="card-h"><h3>使用指南</h3></div>
      ${faq.map(([q, a]) => `<div class="link-card" style="box-shadow:none;margin-bottom:10px">
        <h4>${U.esc(q)}</h4><p class="muted" style="font-size:12.5px;line-height:1.8;white-space:pre-wrap">${U.esc(a)}</p></div>`).join('')}
      <div class="divider"></div>
      <p class="muted" style="font-size:12px">提示：手机端底部导航固定 4 个入口（主页 / 日历 / 提醒事项 / 我的），学员档案、老师名册、可视化课表、财务统计、常用话术都在「我的」里进入；数据在手机端通过「云同步」统一，无需导入导出文件。</p>
    </div>`;
  }
  Views.help = { title: '帮助', sub: '逸云阁使用指南', render() { render(); } };
  return { render };
})();

/* ---------- 关联中心（提醒事项 ↔ 学员） ---------- */
const Link = (() => {
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'link') return;
    const linked = DB.data.todos.filter(t => t.studentId);
    const unlinked = DB.data.todos.filter(t => !t.studentId && t.status !== 'done');
    const opt = DB.data.students.map(s => `<option value="${s.id}">${U.esc(s.parentName)}（${U.esc(s.grade + s.subject)}）</option>`).join('');
    const optT = unlinked.map(t => `<option value="${t.id}">${U.esc(t.title)}</option>`).join('');

    root.innerHTML = `
    <div class="link-card">
      <h4>中间人关系</h4>
      <p class="muted" style="font-size:12.5px;line-height:1.8">你是连接「家长」与「老师」的中间人。每节课记录 <b>我的抽成</b> 与 <b>报销支出</b>（批注里写的花费，如买资料50、交通30），<b>实际到手 = 我的抽成 − 报销支出</b>。家长流水、老师课酬等明细退居次要，重点只看抽成与报销。</p>
    </div>

    <div class="link-card">
      <h4>已关联提醒事项（${linked.length}）</h4>
      ${linked.length ? linked.map(t => {
        const s = DB.student(t.studentId);
        return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="link-rel"><svg class="ico"><use href="#i-link"/></svg>${s ? U.esc(s.parentName) : '已删除'} · ${U.esc(s ? s.grade + s.subject : '')}</span>
          <span style="font-size:13px;flex:1;min-width:120px">${U.esc(t.title)}</span>
          <button class="btn btn-sm btn-ghost" data-act="unlink" data-id="${t.id}">解除</button></div>`;
      }).join('') : `<p class="muted" style="font-size:12.5px">还没有把提醒事项关联到学员。把下面的提醒事项和学员关联起来，方便跟进。</p>`}
    </div>

    <div class="link-card">
      <h4>快速关联</h4>
      ${optT ? `<div class="row">
        <div class="field"><label>提醒事项</label><select class="input" id="lk_t">${optT}</select></div>
        <div class="field"><label>学员</label><select class="input" id="lk_s">${opt}</select></div>
      </div>
      <button class="btn btn-primary" data-act="doLink">关联</button>` : `<p class="muted" style="font-size:12.5px">没有可关联的未完成提醒事项。</p>`}
    </div>`;

    U.rebind(root, 'link', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'unlink') {
        const t = DB.data.todos.find(x => x.id === b.dataset.id);
        if (t) { t.studentId = ''; DB.save(); render(); U.toast('已解除关联'); }
      } else if (b.dataset.act === 'doLink') {
        const t = U.$('#lk_t', root).value, s = U.$('#lk_s', root).value;
        const todo = DB.data.todos.find(x => x.id === t);
        if (todo) { todo.studentId = s; DB.save(); render(); U.toast('已关联'); }
      }
    });
  }
  Views.link = { title: '关联', sub: '提醒事项与学员的关联管理', render() { render(); } };
  return { render };
})();

/* ---------- 更新日志 ---------- */
const Changelog = (() => {
  /* 更新日志数据：每个版本 = {ver, date, items:[html...], divider?, held?}
     新增版本只需在 CHANGELOG 数组顶部 push 一个对象，无需再手写大段模板。 */
  const CHANGELOG = [
    { ver: `v2.6.11`, date: `2026-09-01`, held: false, divider: false,
      items: [`<b>放大待办事项行（对标「添加事项」输入框）</b>：用户希望每条事项（如「收拾行李」）整体再大一点、勾选框也不要太小。本版把勾选框从 17px 放大到 <b>20px</b>（对勾同步放大到 11×6px），标题字号 14px→<b>15px</b>（桌面与手机 7 天视图同步），行内边距放大到 <code>8px</code> 上下——整行高从约 28px 提到约 36–38px，与底部「添加事项」输入框（约 37–39px）几乎齐平（略小一点点）。三处版本常量同步 bump 至 v2.6.11。`] },
    { ver: `v2.6.10`, date: `2026-09-01`, held: false, divider: false,
      items: [`<b>微调：待办标题字号略放大 + 删除「暂无事项」空状态</b>：① 标题字体在手机 7 天视图与桌面视图从 13px 提到 14px（基础 13.5px→14px），比 v2.6.9 压得过紧略放宽一点，更易读；② 每个日期下「暂无事项」的空状态提示整段删除，只保留底部「添加事项」输入框，空那天不再有占位空白。三处版本常量同步 bump 至 v2.6.10。`] },
    { ver: `v2.6.9`, date: `2026-09-01`, held: false, divider: false,
      items: [`<b>真修：手机 7 天视图「收拾行李」那行的大片空白</b>：前几版（v2.6.5–2.6.8）所有行高压缩 CSS 都只写在了 <code>.todo-view</code> 作用域下，而手机 7 天视图的容器其实是 <code>.todo-mobile</code>（与 <code>.todo-view</code> 是两个类）——所以该视图一直退回基础样式：移动端「触控目标≥44px」规范把每行右侧看不见的 ↑↓ / 编辑 / 删除 按钮 <code>.btn-icon</code> 撑到 <code>min-height:44px</code>，而 <code>.t-actions</code> 又是 <code>opacity:0</code>（隐形但仍占高），于是单行标题被顶到约 60px、字下面空一大截，且我的压缩对它完全隐形。本版把行高相关的全部移动端覆盖规则的作用域从 <code>.todo-view</code> 扩展到 <code>.todo-view, .todo-mobile</code>：<code>.todo-item</code> 内边距 4px、操作按钮统一 20×20px 且 <code>opacity:1</code> 可见、<code>align-items:center</code> 垂直居中——手机 7 天视图每行从约 60px 压到约 28px，空白消失。三处版本常量同步 bump 至 v2.6.9。`] },
    { ver: `v2.6.8`, date: `2026-09-01`, held: false, divider: false,
      items: [`<b>继续压缩手机端待办行高（方案 A）</b>：v2.6.7 把勾选框强制高度去了，但每行右侧的 ↑↓ / 编辑 / 删除 操作按钮仍是 26×26px、比「收拾行李」这类单行标题（约 18px）高，于是字下面仍空出一截。本版把手机端（≤820px）<code>.todo-item</code> 内边距从 6px 收到 4px、上下箭头与编辑/删除按钮统一压到 <b>20×20px</b>（图标 13px、箭头字号 11px），并把 <code>.todo-item</code> 改为 <code>align-items:center</code> 让字与按钮垂直居中——每行高度从约 38px 压到约 28px，字下面基本不再有空白，按钮仍好点。每日分组列表内边距 7px→6px、项间距 5px→4px。三处版本常量同步 bump 至 v2.6.8。`] },
    { ver: `v2.6.7`, date: `2026-09-01`, held: false, divider: false,
      items: [`<b>消除每行「留空」真凶：手机端勾选框的 44px 强制高度</b>：用户反馈 v2.6.5/2.6.6 删掉「紧急重要」后每行仍有一大段空白。经查真凶并非优先级文字，而是移动端（≤820px）一条「触控目标≥44px」规范把每个勾选框 <code>.chk</code> 强制撑到 <code>min-height:44px</code>，导致单行标题也被顶到约 56px、标题下方大片留白。本版在移动端媒体查询给 <code>.todo-item .chk</code> 覆盖 <code>min-height:0</code>（可视勾选框回到 17px，行高随标题收缩到约 30–40px），并用透明 <code>::after{inset:-10px}</code> 把点击热区撑回约 37px（视觉小、照样好点，且不撑高行）。紧急重要文字维持已移除。三处版本常量同步 bump 至 v2.6.7。`] },
    { ver: `v2.6.6`, date: `2026-09-01`, held: false, divider: false,
      items: [`<b>真正压缩待办行高（上一版缩得太保守）</b>：v2.6.5 只把内边距从 11px 降到 8px，且移动端 <code>.todo-view .todo-item</code> 还残留一条 <code>min-height:40px</code> 把压缩吃掉了，所以肉眼几乎看不出变化。本版：① 删除移动端 <code>min-height:40px</code>，行高不再被强制撑住；② 标题行高收紧（line-height 1.5→1.32，移动端 1.3）；③ 勾选圆圈 19px→17px；④ 每日分组列表内边距 9px→7px、项间距 6px→5px、勾选框与标题间距同步收。实测每行高度从约 42px 降到约 31px（约 −26%），每天能多排约 1/4 的条目，空当消失。三处版本常量同步 bump 至 v2.6.6。`] },
    { ver: `v2.6.5`, date: `2026-09-01`, held: false, divider: false,
      items: [`<b>提醒事项列表更清爽：隐藏每日任务的「紧急重要」优先级文字标签</b>：此前每条待办下方都会显示一枚彩色优先级徽章（紧急重要 / 重要不紧急 / 紧急不重要 / 不紧急不重要），在每天密密麻麻的任务里显得啰嗦。本版从每日任务行（手机 7 天视图与桌面按日期视图）和「遗留卡片」里<b>移除这枚优先级文字徽章</b>——优先级数据本身不动，编辑弹窗里仍可正常设置，只是列表不再喊出文字。左侧那条按优先级着色的细色条保留（它不显示文字、只是个无声的颜色提示，且不占行高）。`,
        `<b>行高压缩</b>：待办行的上下内边距从 11px 收到 8px、列表项间距 8px→6px、meta 行上间距 4px→3px；若某条任务没有任何其他标签（状态 / 标签 / 学生 / 重复规则等），meta 行会自动隐藏，行更紧凑。视觉上每天能多塞下几条。三处版本常量同步 bump 至 v2.6.5。`] },
    { ver: `v2.6.4`, date: `2026-08-31`, held: false, divider: false,
      items: [`<b>新功能：提醒事项每条可加备注，显示在标题同一行后面、小字</b>：例如「秋招投递 投递2家」——标题「秋招投递」正常字号，备注「投递2家」以浅灰小字（约 11.5px）紧跟其后同一行。备注存在待办对象的 <code>note</code> 字段，随待办一起云同步到其他设备。`,
        `<b>行内一步添加备注</b>：手机端每天分组底部的输入框、桌面端「快速添加」输入框，现在支持 <code>标题｜备注</code> 语法——输入「秋招投递｜投递2家」回车，自动拆成标题 + 备注一步建好（竖线可用半角 <code>|</code> 或全角 <code>｜</code>，取首个分隔符）。「编辑」弹窗里原有的备注框继续可用；「新建提醒事项」弹窗按你的选择不加备注框，备注统一走行内语法或编辑补填。`,
        `<b>回归锁定</b>：行内语法正确拆分为标题/备注两段、标题为空时不建、仅标题无线条时按普通标题处理；遗留卡片也同步显示内联备注。三处版本常量同步 bump 至 v2.6.4。`] },
    { ver: `v2.6.3`, date: `2026-08-31`, held: false, divider: false,
      items: [`<b>修复：重复模板自动生成的每日提醒「删了又回来」</b>：v2.6.1 曾声称修过此问题，但其判定条件 <code>t.tplId &amp;&amp; t.repeat &amp;&amp; t.repeat!=='never'</code> 要求被删实例自身携带 <code>repeat</code> 字段，而 <code>ensureTemplateInstances</code> 生成的实例<b>并不携带 repeat</b>（只有 <code>tplId</code> 和 <code>date</code>），于是该分支永远不成立、删除仍走「整条物理删除」、没把这一天登记进 <code>skippedTemplateDays</code>——下一帧渲染又按模板重新生成一条<b>新 id</b>的实例，于是「前面删的又回来了」。本版改为<b>回查所属模板的 repeat</b> 来识别重复模板实例：命中则把 <code>{tplId,date}</code> 记入 <code>skippedTemplateDays</code>（仅跳过那一天，其他天照常生成），并在 <code>ensureTemplateInstances</code> 生成前先清理已跳过的实例。同时把 <code>skippedTemplateDays</code> 纳入云同步合并（按 tplId+date 取并集），使「删某天模板实例」在手机/电脑多端都彻底消失。`,
        `<b>回归锁定</b>：用最小复现脚本验证——旧逻辑下跳过记录为空、实例被重生（BUG 复现）；新逻辑下跳过记录正确写入、实例彻底消失且其他天保留；跨端场景（他端独立生成的同模板实例）经 sync 合并 skip 后也被清理。三处版本常量同步 bump 至 v2.6.3。`] },
    { ver: `v2.6.2`, date: `2026-08-26`, held: false, divider: false,
      items: [`<b>手机桌面打开更快（首屏瘦身 + 缓存优先）</b>：此前线上版在 <code>index.html</code> 里<b>无条件预加载全部 19 个脚本</b>，其中 <code>xlsx.full.min.js</code>（≈861KB）与 <code>html2canvas.min.js</code>（≈194KB）两个大库占冷启动 JS 流量约三分之二，却只在「导入抽成表 / 从 Excel 导入课时 / 导出图片」这几个低频功能用到——你每次打开首页都要白下载这约 1MB。本版改为<b>按需懒加载</b>：平时不下载，点对应按钮时才动态注入并缓存（按 URL 去重、只下一次），首页冷启动流量从约 1.6MB 降到约 0.6MB（约 −63%）。`,
        `<b>Service Worker 改为 app-shell 缓存优先（cache-first）</b>：此前是 network-first（每次优先联网），现对 html/css/js 改为<b>命中缓存立即返回、后台静默刷新</b>——装到主屏后重复打开，静态资源直接读本地缓存<b>秒开</b>，不再等联网握手。缓存键带 <code>?v=</code> 版本号，部署新版本不会因缓存错配白屏（最坏情况只是多跑一次旧版，直到页面后台刷新）。GitHub Gist 云同步等跨域请求仍走原网络，不受影响。`,
        `<b>离线单文件不受影响</b>：离线版用 <code>build-offline.js</code> 内联全部代码，两个大库仍完整内联进单文件，导入 / 导出图片在离线（file://）下照常可用；只是线上版不再为它们预加载。`] },
    { ver: `v2.6.1`, date: `2026-08-31`, held: false, divider: false,
      items: [`<b>修复：模板设「紧急重要」每天自动生成后变成「重要不紧急」</b>：重复实例展开时优先级写成 <code>tpl.priority || 1</code>，而「紧急重要」的 priority 值是 <code>0</code>，<code>0||1</code> 被错误回退成 <code>1</code>。现改为 <code>tpl.priority == null ? 1 : tpl.priority</code>，priority=0 正确保留。`,
        `<b>修复：模板编辑弹窗「重复」选「自定义」点了没反应</b>：<code>editTpl</code> 里 <code>U.modal({...})</code> 漏写 <code>const mm =</code>，导致 <code>U.wireRepeatControl(mm.body, ...)</code> 中 <code>mm</code> 未定义、整段绑定崩溃，自定义面板永远无法展开。补上 <code>const mm =</code> 后，可正常选「每周哪几天 + 重复几周 / 到某天 / 共几次」。`,
        `<b>重复规则支持「共N周」</b>：模板重复选「自定义 → 每N周 + 周一/三/五 + 结束：共N周」时，<code>count</code> 现在按<b>周数</b>裁剪（此前按「发生次数」算会少生成）；周序号改用 <code>Math.floor</code> 修正跨周边界，描述文案同步显示「共 N 周」。`,
        `<b>修复：每天自动生成的待办删不掉</b>：此前点删除后 <code>ensureTemplateInstances</code> 下次渲染又把这条重新生成回来。现改为「在某天删除 = 仅跳过那一天」——把 <code>{tplId,date}</code> 记入 <code>skippedTemplateDays</code>，其他天照常自动生成；普通（非重复）待办仍直接删除。`,
        `<b>回归锁定</b>：<code>todo-mobile-test.js</code> 扩到 21/0，新增「共N周」「跳过删除」「优先级0不被回退」校验，三处版本常量同步 bump 至 v2.6.1。`] },
    { ver: `v2.6.0`, date: `2026-08-31`, held: false, divider: false,
      items: [`<b>手机端提醒事项重做：以「今天」为起点的连续 7 天视图</b>：每天一个分组头（<code>M月D日 周X</code>，今天带「今天」标），下面列该天未完成/已完成事项；当天结束自动顺延——进入新的一天，窗口整体后移一天。顶部新增 <b>「📅 跳到某天」</b> 日期选择（可跳到很久以后去预排），非今天时显示 <b>「回到今天」</b> 一键复位。`,
        `<b>备忘录式快速新增</b>：每个日期分组底部都有一个行内输入框，输入后回车即生成一条带小圆圈的待办，无需弹窗；点事项左侧圆圈即可勾选完成（置灰+删除线）。`,
        `<b>每日模板库支持重复规则</b>：新增/编辑模板时可设 <b>每天 / 某段日期区间 / 每周哪几天</b>，设了规则的模板会在匹配的日子<b>自动出现</b>待办（不用再点导入）；没设规则的模板仍用「一键导入全部」手动添加。模板库整体移到页面最底端。`,
        `<b>桌面端保持不变</b>：仅 ≤820px 移动端启用新版 7 天视图，桌面端仍是原单日卡片 + 右侧模板库布局。回归锁定：新增 <code>todo-mobile-test.js</code> 校验移动端分支与桌面端原逻辑互不干扰。`] },
    { ver: `v2.5.4`, date: `2026-08-26`, held: false, divider: false,
      items: [`<b>修复：手机端财务页柱状图数字被截成「3…」残影</b>：v2.5.3 用 <code>overflow:hidden;text-overflow:ellipsis</code> 截断溢出的金额，结果窄屏下每根柱的数字都被切掉、看不清具体数值。现改为「压短而非截断」——手机端（≤820px）：① 金额 ≥1 万显示成 <code>1.2万</code>（去 ¥、去千位逗号）；② &lt;1 万显示纯整数；③ 月份标签只留数字（<code>12月</code>→<code>12</code>）；④ 字号 9px、列间距 3px，文字本身塞得下，不再用省略号。数字看得全，也不会压到邻柱；桌面端保持原样（完整 <code>¥12,000</code> + 月份带「月」字）。`,
        `<b>回归锁定</b>：重写 <code>finance-cols-test.js</code>（11/0，新增「移动端无省略号残影」「月份只留数字」「桌面端不被误压缩」等校验），三处版本常量同步 bump 至 v2.5.4。`] },
    { ver: `v2.5.3`, date: `2026-08-26`, held: false, divider: false,
      items: [`<b>修复：手机端财务页柱状图不同月份数字重合</b>：财务统计页「逐月趋势」是 12 根竖柱，手机窄屏下柱顶金额（如 <code>¥12,345</code>）用 <code>white-space:nowrap</code> 不换行，超出柱宽后压到相邻月份的数字上、糊成一团。现手机端（≤820px）自适应：① 金额 ≥1 万自动压缩为 <code>¥1.2万</code> 这类短串；② 数值与月份字号收紧到 9px、列间距收到 3px、柱宽上限收到 22px；③ 仍可能溢出的文字用省略号截断（<code>overflow:hidden;text-overflow:ellipsis</code>）而非压到邻柱；④ 容器占满 100% 宽度。桌面端保持原样（10px / 完整金额 / 不截断）。`,
        `<b>回归锁定</b>：新增 <code>finance-cols-test.js</code>（10/0，验证 12 根柱结构完整、≥1 万压缩为 ¥X.X万、不足 1 万不强行压缩、移动端数值/月份带 overflow:hidden 截断、空数据与全 0 走「暂无数据」占位），三处版本常量同步 bump 至 v2.5.3。`] },
    { ver: `v2.5.2`, date: `2026-08-26`, held: false, divider: false,
      items: [`<b>修正：「忽略」改为「今日无法完成」而非「已完成」</b>：之前把「忽略」直接标记为已完成，与你想表达的意思不符。现「忽略」= 状态改为 <b>blocked（今日无法完成）</b>，该任务不再出现在「遗留未完成」卡片里，也不会被计入今日待办提醒数；原日期仍保留这条记录，方便日后追溯。`,
        `<b>修正：「拉到今天」改为保留原任务、克隆一条新的到今天</b>：之前直接把原任务的日期改成今天，原日期记录被覆盖。现改为：原任务保留在原日期并标记为「今日无法完成」，同时克隆一条内容相同的新任务到今天（状态为未完成），历史记录和今日待办互不干扰。`,
        `<b>新功能：每日模板库支持上下排序</b>：模板列表右侧新增 <b>↑ 上移 / ↓ 下移</b> 按钮，你可以按自己的使用频率调整模板顺序；顺序保存到 <code>order</code> 字段，会跨端同步；「一键导入全部」也按这个顺序导入。新增模板默认排在末尾。`] },
    { ver: `v2.5.1`, date: `2026-08-24`, held: false, divider: false,
      items: [`<b>优化：遗留未完成卡片增加「忽略」选择权</b>：之前顶部遗留卡片只有「全部拉到今天」一个动作，你要么全拉、要么干瞪眼。现每条遗留单独提供 <b>「拉到今天 / 忽略 / 删除」</b> 三选一，卡片顶部也新增 <b>「忽略全部」</b> 按钮（带确认）。「忽略」= 标记为已完成并收尾，不再骚扰待办与遗留列表，且会跨端同步。`,
        `<b>优化：删除提醒事项标题栏那行「X 提醒 / Y 完成」标签</b>：上一版改日期头部防换行时，这个标签在窄屏被挤缩成一团。既然它信息价值不大，直接删掉，标题栏更干净、也彻底消除被挤缩的观感。`] },
    { ver: `v2.5.0`, date: `2026-08-24`, held: false, divider: false,
      items: [`<b>优化：非当天日期不再显示「遗留未完成」卡片</b>：之前查看明天或未来日期时，顶部仍会冒出「遗留未完成 N 条」和「全部拉到今天」按钮，把当天的提醒往下顶、造成误操作。现该卡片只在「查看今天」时出现；切换到其他日期时页面更清爽，也不再误把遗留任务拉到今天。`,
        `<b>优化：提醒事项日期头部不再换行/被顶出去</b>：手机端标题栏（如「8月25日 提醒事项」+日期选择器+前后天按钮）在窄屏下偶尔被日期输入框撑开或换行。现给标题区加 <code>min-width:0</code>、日期输入框固定 <code>flex:0 0 110px</code>、整体强制 <code>flex-wrap:nowrap</code>，确保一行显示完整。`,
        `<b>调整：移除四象限筛选，改为手动上下排序</b>：四象限（紧急重要/重要不紧急/紧急不重要/不紧急不重要）对实际使用帮助不大，现移除顶部的四象限过滤条和右侧的说明卡片；每条未完成提醒右侧新增 <b>↑ 上移 / ↓ 下移</b> 按钮，你可以按自己的紧急感直接拖拽顺序。排序结果保存到每条提醒的 <code>order</code> 字段，跨端同步；主页「今日待办」模块也按同一顺序展示。`,
        `<b>回归锁定</b>：新增 <code>todo-sort-test.js</code>（7/0，验证 order 排序、上下移动后顺序变化、非当天不渲染遗留卡片、每条提醒含上下按钮）；9 套既有同步套件（129 条）与 v2.4.0 三套新增回归（14 条）全部零回归，三处版本常量同步 bump 至 v2.5.0。`] },
    { ver: `v2.4.0`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>修复：手机标记「已完成」的课程，上传云端、电脑下载后部分仍显示「未完成」</b>：根因是课节的「修改时间戳 _mt」从未在本地改动时刷新——v2.3.1 只给老数据补了种子 _mt，但「标记完成 / 编辑 / 新建 / 拖拽换位」这些本机改动路径都不写 _mt，于是手机标记完成后 _mt 仍是创建时的种子值，与电脑本地副本的 _mt 相等；合并时 LWW 平局按方向硬判（pull 取本地），电脑就保留了自己的「未完成」，手机端的「已完成」被丢弃，导致手机/电脑财务统计对不上。现所有课节改动点都写 <code>l._mt = Date.now()</code>，<code>DB.save()</code> 也兜底给漏打 _mt 的记录补时间戳（不覆盖已有），冲突一律走「谁后改谁赢」，完成状态跨端不再丢。`,
        `<b>修复：手机端可视化课表月视图 8 月（六行周）底部日期显示不完整</b>：月视图格子在手机端之前塞了「上课时间 + 学员名」，竖向空间吃紧、月末格子被挤。现手机端月视图<b>省略上课时间</b>、只显学员名，并进一步压缩格子内字号与内边距，让整月（含 8/31 等月末日期）都能一眼看全，无需反复滚动。`,
        `<b>新功能：财务「账单明细」增强</b>：① 账单顶部新增<b>「总收入总和」横幅</b>（先显示总收入，再逐条列开）；② 新增<b>「仅看有报销」筛选开关</b>，一键只看有报销支出的订单；③ 有报销的订单卡片<b>直接显示报销备注</b>（如「资料5元」），不再需要点开才看。`,
        `<b>回归锁定</b>：新增 <code>sync-done-test.js</code>（6/0，含「复现旧 bug：未 bump _mt 时 pull 取本地未完成」证明修复前确实会丢完成状态）、<code>finance-bill-test.js</code>（4/0，渲染断言账单含总收入横幅/报销筛选/直接显示备注）、<code>schedule-smoke-test.js</code>（4/0，手机端月视图渲染且省略上课时间）；连同 9 套既有同步套件（129 条）零回归，三处版本常量同步 bump 至 v2.4.0。`] },
    { ver: `v2.3.1`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>修复：老学员数据「从未打过修改时间戳」导致同步被旧副本整体覆盖</b>：v2.3.0 只修了「写入侧」（新建/编辑才打 _mt），但那些<b>从没被改动过的老记录</b> _mt 仍是空，冲突时 mergeDocs 只能退化成「按上传/下载方向硬判」——于是你这次撞上：电脑上传后，平板旧数据又经某步回灌云端、电脑再拉回来，结果电脑变成了平板的旧数据。<b>现新增 store.migrateMT()</b>：在「本机启动 / 导入备份 / 跨标签页同步 / 云端合并」全链路，给所有同步集合（学员/老师/课节/提醒/日程/模板/话术）的每条记录补种子 _mt（优先保留已有值，否则用 createdAt > 本机基线 __savedAt > 当前时间）。补完后所有记录都有时间戳，冲突一律走「谁后改谁赢(LWW)」，旧数据再也无法靠方向偷袭正确数据。`,
        `<b>防翻车操作纪律（重要）</b>：三端都升到 v2.3.1 后，<b>只让一台当「权威端」上传一次，其他端只下载</b>，且任意端在「还没升到 2.3.1」前<b>不要</b>去新建/编辑/拖排序（旧版不写 _mt 且不补时间戳，仍可能污染云端）。自动同步开关建议在你正手动操作时临时关掉，避免后台把旧数据推上去。`] },
    { ver: `v2.3.0`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>修复：学员档案跨端同步「结课状态 / 上课频率 / Excel 导入细节」丢失</b>：根因是学员记录从未写入「修改时间戳 _mt」，同步冲突时只能按「上传/下载方向」硬判，导致最后推送的设备其旧副本把云端正确值整条顶掉（与之前历史收入回潮同源）。现所有本机改动学员的路径（新建/编辑保存、转正式、上下移排序、按频率重排、Excel 导入自动建）都写入 <code>_mt=Date.now()</code>；合并逻辑早已支持按 _mt「谁后改谁赢」，双向同步不再被方向误判。现在电脑端设的「已结课」、各学员的频率、Excel 导入填的细节，到手机/平板都不再被覆盖。`,
        `<b>修复：手动排好的学员顺序「新建档案后乱掉」</b>：旧逻辑在发现有人缺 order 字段时会全量按「频率+签约日」重排，把手动拖好的顺序冲掉。现改为「只补全缺 order 的、绝不主动全量重排」；新建档案追加到末尾（不再触发重排），上下移/拖拽/按频率重排都显式打 _mt 跨端生效。`,
        `<b>新功能：学员支持多学科、每科独立老师与上课频率</b>：之前只有学员级一个老师/一个频率，无法满足「一个学员上多科、每科老师不同、每科频率不同」。现在每个学科行可单独选授课老师与上课频率（下拉可选、与老师名册联动），卡片按科目展示各自的老师标签与频率标签；老数据升级自动补 <code>teacherId</code>/<code>freq</code> 字段，学员级旧值仍作回退展示。`] },
    { ver: `v2.2.4`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>优化：可视化课表月视图「非本月」配色对齐独立日历页</b>：上版（v2.2.3）把课表非本月改成了中性灰 #f4f3f5，本次按你的要求改为与日历非本月一致——底色 #faf6f7、日期数字 var(--ink-3)，两处页面观感统一；今天仍为粉色高亮，非本月与今天的区分保持不变（夜览模式也同步参照日历，非本月用 var(--card)、数字 var(--ink-3)）。`] },
    { ver: `v2.2.3`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>回退 + 修复：上版本（v2.2.2）误把样式改到了独立的「日历」页</b>，本次纠正：① 独立日历页「非本月」颜色已恢复到 v2.2.1 原样（#faf6f7 浅底）；② 真正要改的是<b>可视化课表月视图</b>——它的非本月格子 <code>.mg-cell.out</code> 原本是粉色 <code>var(--pink-50)</code> 加半透明，和今天的粉色 <code>.mg-cell.today</code> 太接近。现把课表非本月改为中性浅灰 #f4f3f5、日期数字调淡，今天的粉色高亮得以突出；夜览模式同步加了中性暗灰弱化。日历页与课表页现已各归各位。`] },
    { ver: `v2.2.2`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>（已回退）本版本本意修复「可视化课表月视图非本月与今天颜色太像」，但误将改动写到了独立「日历」页的全局样式，导致日历页被误改。该改动已在 v2.2.3 回退，正确修复也已在 v2.2.3 落到可视化课表。</b>`] },
    { ver: `v2.2.1`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>修复：财务「历史收入」改了又回来（同步回潮，最关键的 bug）</b>：历史收入是按月总额 <code>histIncome</code>，旧合并对同月取 <code>Math.max</code>——你把某月改小后上传，云端旧的大值会在下次合并时把它覆盖回去，于是「一转头又回来了」。现改为<b>按月 LWW（最后写入时间胜出）</b>：新增 <code>histIncomeMt</code>（按月写入时间戳）与 <code>histIncomeDel</code>（按月删除墓碑），合并时同月取时间戳较新的一方、删掉的月份用墓碑真正移除，<b>不再比大小</b>。老数据升级后第一轮同步本机当前值被视为权威（给已填月份打「足够新」时间戳）。<code>wipeSynced()</code> 清空时也一并清理这三项。`,
        `<b>修复：可视化课表周视图 8:00 时间轴显示不全</b>：时间槽的 <code>top:-7px</code> 负偏移被周视图滚动容器顶部裁切，现改为 flex 垂直居中、移除负偏移，8:00 完整显示。`,
        `<b>修复：日历「今天」方框太小、看着紧巴巴</b>：月视图 today 由细 <code>outline</code> 内收描边改为粉色填充 + 2px 实边 + 轻投影、内边距加大、日期字号调大；年视图 today 也加同款实边与投影，整体更大气。`,
        `<b>修复：更新日志记录莫名换行、排版丑</b>：列表样式 <code>.log-list</code> 被一处「财务模块死样式」重复定义并污染了更新日志（它从未在 JS 中使用），现删除该冲突规则；版本号与日期合并成一行表头 <code>.log-head</code>，条目加 <code>word-break:break-word</code> 与舒适行距，长行不再乱折。`,
        `<b>回归锁定</b>：<code>sync-delete-test.js</code> 扩到 47 条断言全绿，新增场景 11（改小的 3000 胜出旧云端 5000，不回潮）、场景 12（删除墓碑使该月真正移除）、场景 13（pull/push 均取较新一方）、场景 14（复刻现场：H1 改小 3000 上传后 H2 拉取得到 3000）；<code>sync-loss-test.js</code> 改为断言 LWW 并补「较小但较新胜出」锁定（26/0）。连同 3device/key/fix/timestamp 共 6 套 105 条断言 0 失败，三处版本常量同步 bump 至 v2.2.1。`] },
    { ver: `v2.2.0`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>每日模板库新增「批量删除」</b>：模板多了想一次清掉几条？点模板库标题右侧的 <b>✓ 批量删除</b> 进入选择模式，逐条点选（或点「全选」），再点「删除选中」即可一次删多条；删除一样走墓碑（tombstone）机制，<b>删除会跨端同步</b>——A 端批量删的模板，B/C 端下次同步后也消失，其余模板保留。误删可在同步前退出选择模式取消，或在同步前重新录入覆盖。桌面端（提醒事项页右侧）与手机端（提醒事项页底部卡片）均已支持。`] },
    { ver: `v2.1.1`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>修复「清空全部数据 + 上传后，一点连接数据又全回来」的致命 bug（v2.1.0 删除同步的漏网之鱼）</b>：v2.1.0 给单条删除加了墓碑（tombstone）跨端同步，但「设置 → 清空全部数据」用的是 <code>DB.reset(false)</code> 硬重置——它把数组和墓碑映射<code>deleted</code>一起清空、没给任何记录打墓碑。于是你三端清空、点「立即上传」时，<code>push</code> 内部按「本机 ∪ 云端」合并，把云端里那份满数据又补回上传了，云端根本没被清空；再点「连接」（pull）就把满数据拉回来——数据「复活」。`,
        `<b>修复方式</b>：新增 <code>DB.wipeSynced()</code> 替代清空的硬重置——清空学员/老师/课节/提醒/日程前，<b>先为每条被清记录打墓碑</b>，再清空数组并保留 <code>deleted</code> 映射，最后 <code>save()</code>。这样「立即上传」时合并会按墓碑把云端对应记录也过滤掉，云端被真正清空；其他端下次同步（上传或下载）后同样变空。<b>模板与话术仍保留工厂初始版本</b>（与清空承诺一致，不在此清除、不打墓碑）。`,
        `<b>回归锁定</b>：<code>sync-delete-test.js</code> 扩到 33 条断言全绿，新增场景 6（清空+上传→云端清空、他端拉取也空）、场景 7（复刻你的现场：三端都清空+上传再连接，数据不再回来；并用全新设备拉云端确认云端真被清空）、场景 8（对照组：旧式 <code>reset(false)</code>+上传后数据确实回潮，证明修复必要）。连同既有 5 套同步套件（共 56 条）零回归。三处版本常量同步 bump 至 v2.1.1。`] },
    { ver: `v2.1.0`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>云同步「删除也能跨端同步」终于补齐（tombstone 墓碑方案，你 v2.0.5 就催的补丁）</b>：此前 v2.0.5 把同步改成「按 id 并集合并」后，新增/修改已全量同步，但<b>删除只在本机移除、不会传到另一端</b>——你在一端删掉一条记录，别的端还会一直显示着。本版引入<b>墓碑（tombstone）删除同步</b>：删除时不再真正擦掉远程副本，而是在独立的 <code>deleted</code> 映射（按集合分桶 <code>{id: 删除时间戳}</code>）登记删除；合并时先取两端 <code>deleted</code> 的并集（同 id 取较新的删除时间），再据此把被标记的记录从合并结果里剔除——于是 <b>A 端删的记录，B/C 端下次同步后也消失</b>，且合并模型仍保持「绝不丢数据」的不变量。`,
        `<b>误删可在「未同步前复活」</b>：本地 <code>DB.save()</code> 落盘前会扫描——若某集合里某条记录仍存在于数组（说明删除后又被重新录入/改回），就<b>清掉它的墓碑</b>，使这次删除根本不会随上传传播出去。也就是说，你误删一条、还没来得及同步，只要在同步前重新录入或改回，另一端就不会被删掉，无需手动去云端捞数据。`,
        `<b>级联删除跨端生效</b>：删学员时会连带把其课节写两张墓碑（学员 + 课节），删老师在关联课时里把 <code>teacherId</code> 置空（不删记录、故不加墓碑）；这些墓碑同样并入同步，另一端也会同步删掉学员与对应课节。<b>删除时间边界不误伤</b>：若某记录的存在时间（<code>_mt</code>/<code>createdAt</code>）严格晚于其墓碑删除时间，视为「删除后又被新数据覆盖」，自动复活并移除墓碑，避免较新记录被旧墓碑错误过滤。`,
        `<b>回归锁定</b>：新增 <code>sync-delete-test.js</code>（20 条断言全绿），覆盖「mergeDocs 墓碑语义（6 条）+ A 端删→B 端消失 + 误删重新录入复活（B 端也保留）+ 传播到第三端 C + 学员级联删课节跨端生效 + 较新记录删除边界不误伤」；连同既有 5 套同步套件（loss/3device/key/fix/timestamp 共 56 条）零回归，确认删除同步未破坏既有合并正确性。三处版本常量同步 bump 至 v2.1.0。`] },
    { ver: `v2.0.5`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>云同步底层重写：多端同步「绝不丢失数据」（你反复丢数据的根因彻底解决）</b>。v2.0.4 只修了「连接即覆盖」，但同步内核仍是<b>整文档后写覆盖 + 任何保存都误标脏 + 冲突即 stopAutoPull</b> 的致命组合——于是你一切换页面/改设置，本机就被标记「有改动」并自动把旧数据上传覆盖云端，把另一端刚填的内容抹掉；而接收端一旦检测到云端更新就被停掉自动同步。本版把同步从「整文档覆盖」改为<b>按记录 id 合并（并集）</b>：① 任一端独有的记录都保留，新增内容永不被另一端覆盖丢失；② 上传前先与云端合并（取并集）再上传，本机「旧」也绝不丢云端的新增；③ 永远不因为「冲突」停止自动同步，冲突也走合并；④ 切换路由等纯 UI 保存改为 <code>silent</code>，不再误触发上传。新增 <code>sync-loss-test.js</code>（24/0）专门复现「平板填→电脑脏→平板被删」并锁定「数据不再丢失」不变量。注：删除操作暂不会跨端同步（新增/修改已全同步），下一版补删除传播。`] },
    { ver: `v2.0.4`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>真·修复：云同步「连接即覆盖 / 自动同步失效」根因（你三端同 Token 同 ID 却不同步的真正元凶）</b>：此前在「设置 → 连接 / 初始化」时，<code>ensureGist</code> 内部多次 <code>DB.save()</code> 未加 <code>silent</code>，会触发 <code>schedulePush</code>——于是连接后约 1.5s，本机旧数据被自动上传、<b>把共享空间整个覆盖掉</b>，而真正的下载要等 3s 以后才发生；结果：另一端永远拉不到正确数据、自动同步看似失效、冲突提示反复出现。本版：① 连接全流程保存一律 <code>silent</code>，<b>连接绝不再上传本机数据</b>；② 连接后<b>立即拉取一次云端</b>（以云端为基准），并让基线取「远端真实时间戳」；③ 新建空间 / 404 重建时的保存也改 <code>silent</code>。现三端连接同一 ID 后：本机旧数据不会覆盖共享空间，连接即同步云端数据，之后改完自动上传、他端约 3s 自动拉取。新增 <code>sync-3device-test.js</code>（11/0，含「连接不覆盖共享空间」防回归断言）锁定该行为。`] },
    { ver: `v2.0.3`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>热修复：云同步「跨设备解不开对方数据 / 下载失败」根因——密钥不再绑死 Token</b>：此前加密密钥 = SHA-256(Token)，两端 Token 不同时，任一方都解不开另一方上传的密文，表现为「平板/电脑点下载也没反应、自动同步始终不通、冲突提示小字消不掉」。本版引入独立的<b>同步密钥（口令）</b>作为加密密钥的唯一来源（留空则回退 Token，向后兼容）；多端只要填<u>同一个同步密钥</u>即可互相解密，Token 是否一致不再影响同步。读取端按「同步密钥 → Token」顺序尝试解密，旧 Token 加密的数据仍能读。设置页新增「同步密钥」输入框与说明。新增 <code>sync-key-test.js</code>（6/0）锁定该行为。`] },
    { ver: `v2.0.2`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>热修复：云同步自动实时同步彻底修复（小字反复出现 / 必须手动点下载的根因）</b>：v2.0.1 的修复仍残留一处时间戳污染——<code>doPull</code> 收尾的 <code>DB.save({silent:true})</code> 未传 <code>preserveSavedAt</code>，把刚保留的远端时间戳抹成当前时间，导致 <code>__savedAt</code> 与 <code>baseSavedAt</code> 永久错位；<code>ensureGist</code> 每次 <code>DB.save()</code> 也无参、刷新 <code>__savedAt</code>，使自动上传被「本机有改动」误判为冲突而拒绝。本版：① <code>doPull</code> 一次性 <code>importJSON(preserveSavedAt+silent)</code> 后，收尾保存也 <code>preserveSavedAt</code>，保证 <code>__savedAt === baseSavedAt === 远端</code> 闭环；② <code>ensureGist</code> 全部 <code>DB.save</code> 改 <code>preserveSavedAt</code>，消除误判冲突；③ <code>push</code> 冲突检测加「本机确有未上传改动(localDirty)」前提，无改动设备永不被冲突拦截。现电脑端改完自动上传、平板端 20 秒内自动拉取，且「请手动下载同步」提示在真正下载后消失、不再反复出现。新增 <code>sync-fix-test.js</code>（11 断言全绿）回归锁死该闭环。`] },
    { ver: `v2.0.1`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>热修复：课时导入恢复 Excel 直传 + 云同步真正自动实时同步</b>：针对上线后你反馈的两个阻塞性问题紧急修复。`,
        `<b>修复：课时导入被改成 CSV 后乱码 / 识别差</b>——原先「从 Excel / CSV 导入课时」只接受 <code>.csv</code> 且用 UTF-8 读取，Excel 默认另存的 CSV 在中文 Windows 上是 GBK/GB18030，导致中文乱码；同时不支持直接传 <code>.xlsx</code>。现改为：① 文件选择同时支持 <b>.xlsx / .xls / .csv / .txt</b>；② Excel 用 XLSX 库解析并转成制表符分隔文本；③ CSV/TXT 做 UTF-8 → GB18030 → GBK 自动编码探测；④ 保留粘贴框。`,
        `<b>修复：云同步不会自动实时同步，且「请手动下载同步」提示点了下载还在</b>——根因是 <code>doPull</code> 下载后调用 <code>DB.importJSON</code> 会刷新 <code>__savedAt</code> 为当前时间，导致本地 <code>baseSavedAt</code> 与云端时间戳不一致，下一次同步又被误判为冲突；冲突后 <code>stopAutoPull</code> 也永久停掉自动轮询。现：① <code>DB.save</code> 新增 <code>preserveSavedAt</code> / <code>silent</code> 选项；② 下载后保留远端时间戳、保存同步配置时不触发上传；③ 手动上传 / 下载成功后自动恢复 <code>startAutoPull</code>，实现「电脑端改完自动上传、平板端自动拉取」。`] },
    { ver: `v2.0.0`, date: `2026-08-05`, held: false, divider: false,
      items: [`<b>「最彻底 · 最深度」第五轮：P2/P3 清理 + 两项定向深挖（随 v2.0.0 发布）</b>：按你的要求对上一轮结构检查遗留的 P2/P3 项逐条修复（均行为不变、harness 回归全绿），并针对此前<b>未涉及</b>的维度新开两项定向深挖。`,
        `<b>代码质量（P2/P3 清理）</b>：① 移除已下线的「档案编码格式可自定义」整套死代码（parseCode/buildCode/tokenizeCode 等）并修正 4 处仍在宣传该功能的文案；② 修复电脑端周视图晚课（22:30+90min）溢出时间轴、压住图例的布局问题（clamp 块高 + 跨夜标记，数据不变）；③ 拆分财务页 15-case 事件总控 god-handler 为按功能子函数；④ 将 329 行硬编码更新日志改为本「数据数组 + 通用渲染器」（即此改法）；⑤ 抽取魔法数字为命名常量（每日毫秒 / Excel 纪元 / 默认透明度 / 默认课时长等）并统一三处 VERSION 注释；⑥ 重命名 schedule/finance 模糊的 modal 句柄 mm/ret → modal，并为裸 console.error 补全上下文。`,
        `<b>定向深挖 A · 动态 XSS 渗透（新维度）</b>：jsdom 真实渲染下，向家长名 / 学员名 / 待办 / 备注 / 批注 / 话术等所有 U.esc 入口注入 &lt;img onerror&gt;、&lt;script&gt;、&lt;svg onload&gt;、&gt;&lt; 等恶意 payload，验证渲染后全部转义、脚本不执行、无 DOM 注入。结论：<b>0 漏洞</b>，U.esc 与离线版 makeOffline 转义到位。`,
        `<b>定向深挖 B · 大数据量性能压测（新维度）</b>：jsdom 下灌入 1000 学员 / 10000 课时 / 5000 待办 / 10 年每日重复任务，测渲染 / 筛选 / statIn 统计 / 序列化 / localStorage 体积。结论：<b>各项亚秒级</b>，无 O(n²) 爆炸；最重路径（财务 statIn）≈ 0.8 ms，离线序列化 ≈ 17 ms，存储 ≈ 3100 KB。`] },
    { ver: `v1.9.11`, date: `2026-08-05`, held: false, divider: false,
      items: [`<li><b>「最彻底 · 最深度」第四轮全模块审计 + 实测核验后发布（10 项真实缺陷修复）</b>：按你的要求，本轮不再声称「完成」，而是<b>逐模块对抗性审计</b>——自读 sync / commission-import，并派两个独立子代理深挖 store/students/teachers 与 finance/settings/pwa/app。每发现一个问题都<b>真实运行代码核验</b>（jsdom 无头 harness 加载全部模块、注入 webcrypto、驱动真实数据），确凿定位 13 个缺陷，修复其中 10 个，3 个显式保留为已知边界（见下）。本轮新增 4 套专项 harness（cryptotest / refint / recurfull / fuzz），与原有 11 套基线合计 <b>15 套、243 条断言全绿</b>、冒烟 0 运行时错误。</li>`,
        `<li><b>修复：云同步加密信封被误当明文导入（高危数据丢失）</b>——远端返回 AES-GCM 信封 <code>{v,alg,iv,ct}</code> 时，旧逻辑当作普通数据 JSON.parse，导致解密失败 / 整库被空对象覆盖。<code>readRemote</code> 现识别信封结构直接拒绝（返回 null），<code>doPull</code> 复用同一实现并明确抛「解密失败」。</li>`,
        `<li><b>修复：Excel 日期序列号丢失</b>——导入课酬表时，若日期列以 Excel 序列号（如 45000）存储，旧 <code>parseDate</code> 正则匹配不到会返回 NaN，排课/课时日期错乱。<code>parseDate</code> 现识别 20000–80000 数字并按 1900 伪闰年（序号&gt;60 减 1 天）换算。</li>`,
        `<li><b>修复：本地存储数组字段类型损坏导致白屏 / 崩溃</b>——若 localStorage 中 <code>students/lessons/todos</code> 等被覆盖成 null 或对象（数据损坏 / 旧版残留），<code>load</code> 与 <code>adoptData</code> 直接当数组遍历而崩。现 JSON.parse 后对所有数组字段做类型损坏兜底（损坏则回退空数组），首屏不再白屏。</li>`,
        `<li><b>修复：报销金额误计四位年份</b>——<code>extractNumbers</code> 与 <code>reimburseOf</code> 提取报销数字时把备注里的四位年份（如 2026）当金额累加，报销统计虚高。现排除 1900–2099 四位年份。</li>`,
        `<li><b>修复：对账单 PDF 汇总与明细不平</b>——导出 PDF 时汇总框用 <code>st.count</code> / 旧字段，与明细三本账（家长流水 = 到手 + 课酬 + 报销）口径不一致、合计 ≠ 各行之和。现改用明细 reduce 的 <code>lessonBreakdown</code> 口径，汇总框与明细彻底一致。</li>`,
        `<li><b>修复：离线版 HTML 内联数据 XSS（安全）</b>——<code>makeOffline</code> 把用户数据内联进离线 HTML 时未转义 <code>&lt;/script&gt;</code>，异常 / 恶意数据可提前闭合脚本注入代码。现对内联 JSON 转义 <code>&lt;</code> / <code>&gt;</code>。</li>`,
        `<li><b>修复：自定义图标注入（安全）</b>——<code>Brand.logoHTML</code> 此前对任意 URL 直接拼 <code>&lt;img src&gt;</code>，非 data:image 链接（如 javascript:）可注入。<code>仅信任</code> data:image/ 前缀，其余忽略。</li>`,
        `<li><b>修复：离线构建缺 &lt;/head&gt; 崩溃</b>——<code>makeOffline</code> 找不到 <code>&lt;/head&gt;</code> 时构建脚本抛错。现退路到 <code>&lt;/body&gt;</code>，再退路到末尾追加。</li>`,
        `<li><b>修复：PWA 安装按钮同步抛错未捕获</b>——<code>beforeinstallprompt</code> 的 <code>prompt()</code> 同步抛错未 try/catch，导致安装按钮逻辑崩。<code>promptInstall</code> 现包裹 try/catch，异常时安全降级。</li>`,
        `<li><b>已知边界（本轮显式不修，避免破坏同步 / 导入核心模型）</b>：① <b>跨标签页并发覆盖</b>（B5）——同步以「整库快照」为单位、单写者模型，多标签并发本就是已知限制，改为行级合并会破坏同步正确性，不修；② <b>导入数据三本账口径</b>（B8）——导入按「家长流水」单列建模、不强制拆分到手/课酬，是有意的导入轻量模型，不破坏性改；③ <b>逐行舍入差 0.01</b>（B9）——经典的逐行四舍五入累积误差，属口径问题，改会破坏用户已对账数据，不修。三处版本常量同步 bump 至 v1.9.11。</li>`] },
    { ver: `v1.9.10`, date: `2026-08-05`, held: false, divider: false,
      items: [`<li><b>修复：非重复待办在日历 / 首页勾选不生效（深度审计补漏）</b>——v1.9.9 的待办勾选守卫修复只覆盖了「待办列表」一处入口，遗漏了日历日视图 / 周视图（calendar.js:268）与首页两处小组件（dashboard.js:373、511）三处等价入口：非重复待办在那里勾选时仍走「按日期单独勾选」分支，只写 completedDates、不动 status，导致对勾不显示、未读数不减。第三轮按「入口等价性」逐一对齐，给三处统一加 <code>rule.type !== 'never'</code> 守卫。新增 <code>toggleall</code> 全入口覆盖测试（待办列表 / 日历日 / 周 / 月结构 / 首页），与 10 套基线合计 11 套 harness 零回归。三处版本常量同步 bump 至 v1.9.10。</li>`] },
    { ver: `v1.9.9`, date: `2026-08-05`, held: false, divider: false,
      items: [`<li><b>「最彻底 · 最深度」全身体检 2 轮 + 实测核验后发布正式版</b>：在 v1.9.x 三轮体检基础上，按你的要求再做<b>两轮独立深度审计</b>（第一轮按数据/财务/导入导出/模块/修复分维度查；第二轮从零重建状态、跨视图端到端串联数据流复检），每发现一个问题都<b>真实运行代码核验</b>后才声明修复，绝不口头糊弄。新增 4 套无头测试（deepaudit / corrupt / edgecases / datacrunch），与原有 6 套基线合计 <b>10 套 harness、115 条断言全绿</b>、冒烟 0 运行时错误。</li>`,
        `<li><b>修复：待办勾选级联真 bug</b>——非重复待办在「自己的到期日」点击完成时，toggle 守卫误把 never 任务当重复任务走「按日期单独勾选」分支（只写 completedDates、不动 status），导致<b>对勾不显示、未读数不减、列表仍显示未完成</b>。现守卫仅对真正重复的任务（type!=='never'）走按日期分支，非重复任务正确置 status=done。</li>`,
        `<li><b>修复：首页「今日课程」崩溃</b>——任一课时缺失 start 字段时 <code>U.t2m(undefined)</code> 抛错、整页仪表盘挂掉。新增 <code>U.safeT2m</code>（缺失/非法时间回退 8:00），首页改用它，与课表已有防御一致。</li>`,
        `<li><b>修复：财务合计抽成率双百分号</b>——合计行单元格渲染成 <code>18%%</code>。去掉多余 <code>%</code>。</li>`,
        `<li><b>修复：财务合计与明细口径不一致</b>——<code>statIn</code> 此前不实现「含导入数据」过滤，导致默认（不勾选）视图下明细行按文案应排除导入课、但合计行仍包含导入课（<b>合计 ≠ 各行之和</b>）。<code>statIn</code> 新增 <code>opt.includeImported</code>（默认 true 向后兼容，仪表盘/日历不受影响），财务页全部统计透传该开关，明细行 / 合计 / CSV / 月份走势口径彻底一致。</li>`,
        `<li><b>修复：抽成率口径（v1.9.x 遗留）</b>——合计行抽成率此前分子用「实际到手 = 抽成 − 报销」，比「我的抽成」列低、互相矛盾。现统一为 <code>我的抽成 ÷ 家长流水</code>，与明细表一致。三处版本常量同步 bump 至 v1.9.9。</li>`] },
    { ver: `v1.9.8`, date: `2026-08-05`, held: false, divider: false,
      items: [`<li><b>补修全身体检遗漏项 #17</b>：导入学员时若记录仅含「抽成」、未提供「课时费」，此前会误把课时费填成抽成金额，导致 takeHome（到手 = 课时费 − 抽成）被算成 0、财务统计失真。现改为：有课时费才填课时费，否则课时费留 0 仅记录抽成。三处版本常量同步 bump，回归 43 条全绿。</li>`] },
    { ver: `v1.9.7`, date: `2026-08-05`, held: false, divider: false,
      items: [`<li><b>全身体检（第二批）：逐文件 + 跨模块 + 双盲审计，共修复 17 项</b>：① <b>重复任务跨视图一致</b>——周视图勾选重复实例改用被点单元格真实日期（此前误记成周焦点，导致跨视图错位）；重复完成态在日历/待办/首页统一读 completedDates 并显示绿色勾选。② <b>遗留列表不再误收重复任务</b>——重复任务只在其发生日出现，不再永久塞进「遗留」。③ <b>「拉到今天」不再偏移重复锚点</b>——仅移动非重复过期任务。④ <b>本地数据损坏不再静默覆盖</b>——损坏时保留原串并尝试从内嵌备份恢复，否则明确提示而非用示例数据覆盖真实数据。⑤ <b>ServiceWorker 离线首开崩溃修复</b>——预缓存键剥离 ?v 查询串，装到主屏离线打开不再把 index.html 当 JS 返回。⑥ <b>删老师级联解绑课时</b>，避免财务按老师分组出现幽灵项；⑦ 年重复以 2/29 为起点时非闰年规整为 2/28；⑧ 自动同步冲突后停止轮询，避免每 20s 重复弹警告；⑨ 删除单节课加确认；⑩ 首页/小助手写死白色背景改用主题变量（夜览不再白块）；⑪ 补全 favicon；⑫ 保存学员时对 Todo/App 做存在性守护等若干稳健性修复。</li>`,
        `<li>回归测试扩充至 43 条全绿；全流程 79 条、冒烟 0 运行时错误，三套全绿。</li>`] },
    { ver: `v1.9.6`, date: `2026-08-04`, held: false, divider: false,
      items: [`<li><b>全身体检修复（4 项真实问题）</b>：① 修复<b>跨标签页同步未跑数据迁移</b>——同一浏览器多标签时，旧结构数据同步到本页会缺失 repeat / 完成记录等字段，导致重复与完成逻辑错乱；现已复用迁移逻辑，两端数据严格一致。② 修复<b>年视图热力图不展开重复</b>——此前年度统计把重复日程/提醒按原始日期计数，漏掉重复实例，现改为按重复规则逐天展开。③ 修复<b>首页「遗留未完成」误判</b>——重复任务（如每周一回访）因基准日早于今天被全部算作遗留，导致首页拥塞；现仅把「今天不再发生、且未完成」的旧任务判为遗留。④ <b>重复任务勾选视觉一致</b>——当天勾掉的重复待办，勾选框正确显示为已勾选态。</li>`,
        `<li>回归测试新增 8 条（旧字符串 weekly 兼容、跨标签页迁移字段补齐、overdue 误判修复前后对照），重复引擎专项测试达 34 条全绿；全流程 79 条、冒烟 0 运行时错误，三套全绿。</li>`] },
    { ver: `v1.9.5`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>提醒事项 / 日程「重复」全面自定义</b>：不再只有固定的「每天/每周/每月」等预设。新增<b>自定义重复</b>——可选择每 N 天 / 周 / 个月 / 年，按星期多选（例如<b>每周一、周四、周五</b>），并设置<b>结束方式</b>：永不 / 直到某天 / 重复 N 次。旧版固定值（如 daily / weekly）自动兼容，无需重新录入。</li>`,
        `<li><b>重复真正展开</b>：日历的日 / 周 / 月视图、提醒事项列表、工作台首页、小助手都会按重复规则<b>逐日展开</b>显示，不再只记一条看不见。</li>`,
        `<li><b>单次完成</b>：重复任务可在某一天单独勾选完成（记录到该发生日），<b>不会一次勾掉全部</b>；把日历 / 列表切到其它天仍会正常显示未完成的实例。</li>`,
        `<li><b>提醒事项对齐 iOS 提醒页</b>：编辑 / 新建页补全<b>「重复」</b>与<b>「标记（旗标）」</b>两项——标记项会<b>置顶高亮</b>，并在列表上显示 🚩 与 🔁 重复说明。</li>`] },
    { ver: `v1.9.4`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>云同步体验增强（解决「两端是否连到同一空间」困扰）</b>：连接成功后，下方以<b>醒目绿色卡片</b>展示本机的<b>真实空间 ID</b> 与一键「复制此 ID」；并新增<b>空间指纹</b>（取 ID 首尾各 4 位，如 <code>5a9c-191b</code>）。两端连到<b>同一份</b>数据时指纹必然相同，用户只要对比指纹即可确认两端是否同步到同一份，不再靠肉眼比对一长串 ID。</li>`,
        `<li><b>复制按钮升级为醒目主按钮</b>，并延长成功提示停留时间（2s → 6s），确保「已连接 / 请核对指纹」的关键提示不被快速淹没。</li>`,
        `<li><b>Toast 支持自定义时长</b>：<code>U.toast(msg, type, dur)</code> 新增可选的 <code>dur</code> 毫秒参数。</li>`,
        `<li><b>ID 格式复核</b>：用户提供的自动生成 ID <code>5a9c0cabf5a31b0802b6ce20a385191b</code>（32 位十六进制）经验证为合法 GitHub Gist ID，可在新版正则下正确识别、不会新建。</li>`] },
    { ver: `v1.9.3`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>全站「零错误」体检通过</b>：新建一套真正加载全部 19 个脚本（含两个第三方库）、启动 App、逐一渲染全部 17 个视图（仪表盘 / 提醒事项 / 学员 / 老师 / 课表 / 财务 / 日历 / 话术 / 设置 / 我的 / AI / 帮助 / 关联 / 更新日志等）、并触发各视图主要交互（打开新建弹窗、切换日历日 / 周 / 月 / 年、打开搜索、夜间模式切换等）的无头浏览器冒烟测试，全程捕获 <code>console.error</code> / 未捕获异常 / <code>unhandledrejection</code>。结果：<b>运行时错误总数 = 0</b>，并与原有 79 项全流程断言、7 项云同步 ID 断言一同全部通过。</li>`,
        `<li><b>一致性微修</b>：<code>Search</code>（全局搜索）补挂到 <code>window</code>（与 <code>CommissionImport</code> / <code>Brand</code> / <code>Sync</code> 等工具模块一致），避免任何通过 <code>window.Search</code> 调用的路径在未来出错。</li>`] },
    { ver: `v1.9.2`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>云同步「正确 ID 也被新建」彻底修复（核心 bug，正是你反馈的现象）</b>：之前 GitHub 的 ID 校验正则错误地写成「固定 20 位十六进制」，而 GitHub 真实 Gist ID 是 <b>32 位</b>。于是你从一端复制出来的正确 32 位 ID，在另一端被判定为「格式非法」→ 自动清空 → 重新生成新空间，于是三端连不到同一份数据（尽管网络 / Token / ID 本身都没问题）。现已改正为「20~40 位均可」，并新增「粘贴完整链接也能自动识别 ID」的容错（如 <code>https://gist.github.com/用户名/32位ID</code>）。随附回归测试用真实 32 位 ID 覆盖 断网 / 404 / 成功 / 空 / 格式非法 / 完整链接 共 7 项，全部通过：<b>格式合法的 ID 在任何情况下都不会被丢弃新建</b>。</li>`,
        `<li><b>健壮性</b>：日期解析 <code>U.parse</code> 增加空值 / 非法值守卫，避免任何空日期调用导致整页崩溃（防未来隐患）。</li>`,
        `<li><b>体验一致性</b>：日历页右下「+」按钮现在走日历自己的「新建（日程 / 提醒事项）」弹窗，与其它页面行为统一；之前日历页 FAB 走的是通用快捷菜单。</li>`] },
    { ver: `v1.9.1`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>修复「遗留提醒」误把已完成项算进去（核心 bug）</b>：v1.7.9 把提醒事项从「完成 / 未完成」两态升级为「未完成 / 已完成 / 今日无法完成」三态后，主页「遗留未完成」计数、AI 助手「未完成提醒数」、关联中心「可关联列表」、以及「全部拉到今天」动作这 4 处仍沿用旧的两态 <code>.done</code> 布尔字段判断。迁移后的新数据已不含 <code>.done</code> 字段（恒为 undefined），导致「是否完成」永远判定为假——<b>已完成的提醒也会被当成遗留项、被一键拉到今天</b>，且主页遗留计数虚高。现 4 处统一改为按三态 <code>status !== 'done'</code> 判断，并已加自动化回归测试（含已完成 / 未完成 / 今日无法完成三种迁移数据）覆盖。</li>`,
        `<li><b>文案一致性</b>：主页模块默认标题「今日待办」改为「今日提醒事项」，与全站重命名统一（用户不可见的内部配置项）。</li>`,
        `<li><b>清理</b>：财务合计行的抽成率调用去掉一处未定义变量兜底；主页模块注释同步更新。</li>`] },
    { ver: `v1.9.0`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>新增「日程」模块（参考 iOS 日历 / 提醒事项分工）</b>：① 日历现同时承载两类条目——「日程」彩色时间块、<b>无需打勾</b>（如上课、会议、考试）；「提醒事项」保留原有需打勾的勾选框（如回访、待办）。两者在日 / 周 / 月 / 年视图分区展示（「日程 · N」「提醒事项 · N」），互不混淆。② 日程支持：标题、地点、全天开关、起止日期与时间、重复、提醒、颜色分类（考研课程 / 工作 / 个人 / 家庭 / 健康 / 社交 / 其它）、备注；跨天多日日程自动按天聚合显示。③ 日历右上「新建」按钮改为 iOS 风格选择弹窗，先选「日程」或「提醒事项」再进入对应编辑页。</li>`,
        `<li><b>全站「待办」正式更名为「提醒事项」</b>：导航、首页、日历、设置、学员试课回访提示、搜索、AI 助手、帮助与链接中心等所有出现「待办」之处统一改为「提醒事项」，与新增的「日程」形成清晰分工。</li>`,
        `<li><b>云同步「粘贴真实空间 ID 被重新生成」彻底修复（核心 bug）</b>：旧逻辑在点击连接时，只要遇到任何网络异常（断网 / Token 错 / GitHub 不可达）就会把用户粘贴的 ID 清空并新建空间，导致三端永远连不到同一处。现拆分为「格式校验」与「连接尝试」两步：凡是格式合法（GitHub 20 位 hex / Gitee 32 位 hex）的 ID，无论网络 / 鉴权失败一律报错并<b>保留原 ID</b>，只有「留空」或「格式非法」才会自动新建；并随附自动化回归测试覆盖 断网 / 404 / 401 / 403 / 成功 / 空 / 格式非法 共 7 种场景，全部通过。</li>`,
        `<li><b>全流程回归测试清零</b>：重做 jsdom 测试框架，真实加载全部脚本、经 App.go 驱动路由守卫，覆盖启动 / 全部视图渲染 / 提醒事项增删改状态流转 / 学员新建与空学科校验 / 排课与冲突检测 / 财务与抽成表解析 / 日历日程与提醒 / 云同步连接上传下载冲突保护 / 数据导入导出 / reset 共 75 项断言，全绿。</li>`] },
    { ver: `v1.8.11`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>云同步「后台自动下载」（准实时多端同步）</b>：① 之前同步只有「改动后自动上传」，另一端需手动点「下载同步」才能看到；现在连接后程序会每 20 秒自动检查云端，一旦发现其他端有更新且本机无未上传改动，就静默拉取并刷新当前页面——实现「平板输入、电脑约 20 秒内自动变好」。② 已连设备重新打开页面也会自动开始后台同步。③ 安全兜底：当本机和云端都有各自改动（撞车）时，自动同步会暂停并提示手动「下载同步」处理，绝不偷偷覆盖任一方数据；你正在输入框打字时也会跳过本周期，避免重渲染清空输入。④「自动同步」开关现同时控制上传与自动下载，取消勾选即停止后台轮询。</li>`] },
    { ver: `v1.8.10`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>云同步引导修复</b>：① 修正设置页误导文案——此前提示「多设备填同一个自定义 ID（如 20260802）即可同步」，但 GitHub 的同步空间 ID 由服务器自动分配、不支持自定义名，导致三端各自新建空间无法同步；现改为「留空自动创建，多端共用请复制一端生成的真实空间 ID」。② 连接成功后醒目显示完整真实空间 ID 并提供「复制此 ID」按钮，已连接设备进入设置页也会显示。③ 在 <code>Sync.ensureGist</code> 增加格式校验：手动填写的 ID 若不符合 GitHub(20位hex)/Gitee(32位hex) 格式，直接当无效自动新建，从根上避免再踩坑。</li>`] },
    { ver: `v1.8.9`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>全流程体检修复</b>：补做跨模块符号审计时发现并修复一个真 bug——<code>Todo.importTemplates</code> / <code>Todo.editTpl</code> 两个方法此前未挂到 <code>Todo</code> 导出对象，导致 dashboard「模板库」的「导入 / 编辑 / 使用模板」按钮点击即崩溃（渲染不报错，仅点击触发）。已补入导出，跨模块审计清零。</li>`] },
    { ver: `v1.8.8`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>可视化课表小课块标签优化 + 日历「今天」按钮对齐</b>：① 重叠课块空间不足时自动省略时间/金额/抽成，仅显示课程名字，避免文字被截断；② 电脑/平板端日历头部「今天」按钮统一为 30px 高度并垂直居中，与左右 ‹ › 按钮对齐（手机端样式不变）。</li>`] },
    { ver: `v1.8.7`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>可视化课表重叠课的配色自定义</b>：① 编辑单节课弹窗里新增「课程颜色 + 透明度」滑块，每节课独立可调（不再依赖全局模板）；② 重叠区域新增第 3 种颜色与透明度（「重叠区颜色 / 重叠区透明度」），与上面那节、下面那节各自独立，3 种颜色全部由你自己选；③ 满宽整列渲染保留，重叠课块不被缩窄；④ 课块补回「上课时间 + 到手抽成」信息，普通课与重叠课透明度分别独立控制。⑤ 日历「今天」按钮移到最右侧（日期与 › 不再被分开）；⑥ 日历周视图标题省略年份（如 08.03 — 08.09），一行完整显示。⑦ 自动云同步默认服务商确认为 GitHub（Gist 加密备份）。</li>`] },
    { ver: `v1.8.6`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>根治可视化课表「空白」+ 全站稳定性体检</b>：① 修掉 v1.8.5 引入的两个真 bug——safeT2m 函数写成自己调用自己导致栈溢出崩溃、WEEK_MUTED 周视图淡色映射忘记从 U 导出导致每节普通课渲染即崩溃；② 修掉 v1.8.5 更新日志里的反引号导致 extra.js 语法错误、更新日志页打不开；③ 用 Node 把全部 13 个视图逐一真实渲染跑了一遍，确认无异常；④ 全校验跨模块符号引用，确认无「引用未导出」类隐患。</li>`] },
    { ver: `v1.8.5`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>真正修复可视化课表「空白」</b>：电脑/平板端周视图只显示头部、整个 grid 不渲染，根因是部分课程数据异常（如上课时间 start 字段缺失/格式错误），导致 U.t2m 抛异常、renderWeek 整体失败。已加多层防御：① includeLesson 过滤掉 start 无效的课程；② 新增 safeT2m/safeEndMin 遇到异常时间不再抛错；③ 排序/冲突分组时把 id 强转字符串，避免 undefined.localeCompare 崩溃；④ renderWeek/renderWeekMobile 外层包 try-catch，再出错会在页面显示具体错误信息而不是空白。</li>`] },
    { ver: `v1.8.4`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>修复可视化课表周视图课块「隐身」</b>：课块背景由 #RRGGBBAA 8 位十六进制透明度改为 rgba() 写法，兼容 iPad / 旧版 Safari 及各类浏览器；同时把周视图课块不透明度从 25% 提升到 32%、重叠区 55%、月视图/手机端课卡 12%，让课程在桌面 / 平板端清晰可见，不再和白色背景融为一体。</li>`] },
    { ver: `v1.8.3`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>用户反馈 3 项修复</b>：① 手机端课表 / 日历头部——标签独占一行，日期标题与「今天 / 回到今天」按钮严格同一行完整显示，不再截断、不再折行；② 手机端「今日待办」复选框由 22px 缩至 17px 并加左内边距，不再过大、不再贴卡片边缘被裁切；③ 主页 / 财务的柱状走势图补上「暂无数据」兜底（此前无数据时退化为看不见的小桩，桌面 / 平板端看着像空白）。</li>`] },
    { ver: `v1.8.2`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>手机端布局整改（用户反馈 8 项）</b>：① 主页彻底删除模板库，模板库改放到导航第 3 个「待办」页「今日待办」下方；② 手机端老师名册改为一行 2 个卡片、卡片内部去空白更紧凑；③ 三端日历 / 课表「今天」按钮强制单行完整显示、不截断不换行；④ 手机端「我的」页「导入数据 / 云同步」由上下两块改为左右并排；⑤ 财务顶部「含未上课程」复选框与按钮保持同一行且不超出屏幕；⑥ 财务账单列表去除横向滑动、去除居中布局；⑦ 手机端明细统计卡片中间空白收紧；⑧ 三端周视图重叠课程恢复横条占满整列，重叠区域改用半透明渐变叠加过渡，课程名显示在各自非重叠区域。</li>`] },
    { ver: `v1.8.1`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>v1.8.0 遗留项补全整改</b>：① 三端日历 / 课表「今天」按钮与日期标题严格同一行；② 手机端月视图课程右下角金额不再与课程重叠（改为正常文档流 + 移动端单格最多 2 条课程）；③ 财务列表无批注的项不再显示「批注：导入抽成」，且去除头像列；④ 三端周视图重叠课程改为并列错开、互不压字；⑤ 手机端周视图按 iOS 风格重做为按天议程清单。</li>`] },
    { ver: `v1.8.0`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li><b>手机端主页精简美化</b>：2×2 快捷入口缩小、卡片间距收紧，确保 iPhone 14 Pro Max 一屏可见无需滚动；「今日待办」上移到「今日课程」之上，「每日模板库」紧跟待办。</li>`,
        `<li><b>三端主页统一</b>：删除「近半年抽成走势 / 本月年级贡献 / 高频话术 / 本月财务」四块，主页更聚焦；同时删去模板库下方的小字说明。</li>`,
        `<li><b>学员状态筛选美化</b>：顶部状态标签简化、不拥挤，「试课中」与计数数字强制同一行不折行。</li>`,
        `<li><b>周视图 iOS 风格重排</b>：星期与日期上下分层、今日日期用粉色实心圆高亮；两节课重叠时列仍占满，改用「重叠」色块角标标识，不再横向压窄。</li>`,
        `<li><b>日历「今天」按钮与日期同一行</b>，不再另起一行留空。</li>`,
        `<li><b>财务改版</b>：「实际到手」列改为「我的收入」；删除「谁带的最多」副标题；「老师课时排行」整体移到「老师名册」板块最上方；删除「学员抽成贡献」板块。</li>`,
        `<li><b>导入抽成表预览可编辑</b>：预览弹窗的日期 / 学员匹配 / 抽成金额 / 备注均改为可输入框，可手动修正识别错的行再确认导入。</li>`,
        `<li><b>导入账单清爽化</b>：直接显示「名字 + 实际收入」，去掉「家教 - 抽成（导入）」标题与「抽」图标；无批注时不显示「有批注」。</li>`,
        `<li><b>删除「安装到桌面」模块</b>（应用图标、外观设置保留）。</li>`,
        `<li><b>底部「更多」图标</b>由 3×3 点阵改为更简洁的三点样式；年视图不再显示「排课」按钮；编辑模块在 iPhone 上不再超出界面边界。</li>`] },
    { ver: `v1.7.12`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li>手机端主页：底部「学员 / 老师 / 课表 / 财务」快捷入口由一行 4 个小图标改为 <b>2×2 大图标网格</b>，图标放大至 50px 并加圆角粉色底，新增「快捷入口」标题，主页不再空旷。</li>`] },
    { ver: `v1.7.11`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li>收入模型重定义：实际到手 = 我的抽成 − 报销支出；报销支出 = 从「批注」里自动提取的数字之和（如批注写「买资料50、交通30」即报销 80）。排课/编辑弹窗不再手填「实际到手」，只保留「批注（报销支出）」。</li>`,
        `<li>Excel 抽成表导入：单元格数值视为「实际到手收入」，Excel 批注同步导入为课节批注（incomeNote），点开账单即可查看；批注中的数字自动提取为「报销支出」；系统按「到手 + 报销」反推出「我的抽成」，保证三本账自洽并同步到财务统计。</li>`,
        `<li>主页财务速览：桌面端 KPI 卡片改为「本月我的抽成 / 报销支出 / 实际到手 / 到手趋势（环比）」；手机端主页新增「本月财务」三列卡片，抽成、报销、到手一目了然。</li>`,
        `<li>一键备份与丢失预警：数据管理页新增显眼的「立即备份」按钮；启动时若超过 7 天未备份会自动尝试静默备份，超过 7 天 toast 提醒、超过 14 天弹窗强提醒，降低 iPad 清缓存导致数据丢失的风险。</li>`,
        `<li>财务统计 · 新增「导出 PDF」按钮，可生成带汇总 + 明细的月度 / 年度对账单（调用浏览器打印 → 另存为 PDF）。</li>`,
        `<li>平板端财务页可操作化：财务卡片增加横向滚动避免表格被压扁；「含导入数据」「含未上课程」复选框加大点击区域；账单「编辑」按钮触控区域放大，iPad 上可正常编辑账单。</li>`,
        `<li>Service Worker：新增 network-first 策略的 SW，优先拉取最新资源、失败则回退缓存，解决 PWA 主屏幕图标缓存旧版问题，同时支持离线打开。</li>`,
        `<li>手机端主页：底部「学员 / 老师 / 课表 / 财务」快捷入口图标进一步放大，解决页面偏空。</li>`,
        `<li>全站口径统一：财务概览、明细统计、老师课时排行、学员档案、课表年视图，均改为突出「我的抽成 / 报销支出 / 实际到手」，弱化家长流水与老师课酬；原「其余支出」统一更名为「报销支出」。</li>`,
        `<li>老师课时排行：列改为「课酬（=Σ(课时费−我的抽成)）」与「实际到手」，不再显示含义含糊的「其余支出」。</li>`,
        `<li>账单明细：新增「含导入数据」开关；勾选后导入抽成纳入账单，且明细统计不再显示抽成率。点账单任意一行可展开查看「批注」（钱花哪了）。</li>`,
        `<li>修复 bug：财务账单「编辑」按钮此前因全局变量判定方式（window.Schedule 在浏览器顶层 const 下并不挂到 window）而点击无反应，已修复，现可正常打开编辑弹窗。</li>`] },
    { ver: `v1.7.10`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li>缓存破坏：给所有 JS / CSS 资源加 <code>?v</code> 版本号，强制 iPad / 手机端主屏幕 PWA 与浏览器放弃旧缓存，避免设备间版本不一致、加载到旧版界面。</li>`] },
    { ver: `v1.7.9`, date: `2026-08-04`, held: false, divider: true,
      items: [`<li>待办事项升级为三态：「未完成 / 已完成 / 今日无法完成」。旧版「完成/未完成」数据自动迁移；列表点击状态图标可循环切换，编辑弹窗也可直接选择。</li>`,
        `<li>课节「批注」文案简化：排课/编辑弹窗的标签从「批注（其余钱去哪了）」改为仅「批注」，placeholder 示例保留。</li>`,
        `<li>手机端可视化课表 iOS 风格重排：工具栏分两行不拥挤，周视图日期头放大、今日为圆点高亮，重叠课程自动纵向堆叠不再挤成一坨；月/年视图格子更圆更克制。</li>`,
        `<li>手机端待办页简化：隐藏顶部常驻输入区，点右下角 + 弹出极简新建弹窗（事项 + 可选时间），页面更清爽。</li>`,
        `<li>手机端主页：底部「学员 / 老师 / 课表 / 财务」快捷入口图标放大，解决页面偏空。</li>`,
        `<li>手机端我的页：移除「老师名册」入口，剩余 8 个入口正好排成两行 4 列。</li>`] },
    { ver: `v1.7.8`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>课节新增「实际到手收入」独立字段：排课/编辑弹窗都可填写，未填写时自动回退到「我的抽成」（兼容旧数据）。后续所有收入统计、财务、课表、学员档案、主页全部以「实际到手」为口径。</li>`,
        `<li>课节新增「批注」：可填写老师课酬、资料费等说明；可视化课表周视图内联显示、月视图悬浮提示；财务日账单每一条同步显示。</li>`,
        `<li>财务统计 · 日账单标题随「周/月/年/自定义」动态切换，不再固定显示「日账单」；每笔记录右侧新增「编辑」按钮，可直接修改该课节的实际到手与批注。</li>`,
        `<li>统一口径复盘：store.statIn / finance.effectiveRate / finance.group / schedule 各视图 / dashboard / students.js 全部改为从 DB.lessonBreakdown 读取 takeHome，避免 67/70 这类不一致。</li>`] },
    { ver: `v1.7.7`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>可视化课表 · 每节课新增「实际到手收入（抽成）」与「批注：其余＝老师课酬」，周视图内联显示、月视图悬浮提示，导入抽成卡片也标注实际到手。</li>`,
        `<li>财务统计 · 日账单每一条同步显示「实际到手收入」与「批注（其余＝老师课酬）」，与课表两端一致。</li>`,
        `<li>排课 · 默认开始时间改为按该学员上一次上课的开始时间自动带出（无历史则回落 19:00），切换学员即时更新。</li>`,
        `<li>更新日志 · 修正版本顺序（1.7.3 置于 1.7.2 之上）与最早版本日期标注。</li>`] },
    { ver: `v1.7.6`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>财务统计 · 抽成率改为按「真实课时」且自 8 月 1 日起计算，导入的抽成表数据不再参与抽成率（仍计入收入流水与按学员/年级统计）。</li>`,
        `<li>可视化课表 · 导入的抽成表记录现在会同步显示在课表年/月/周视图中（默认显示），并提供工具栏复选框「显示导入抽成」随时开关；导入记录不写具体时间，以灰色卡片/条目展示。</li>`,
        `<li>财务统计 · 新增「日账单」模块（默认显示在底部）：按日期倒序列出每天的收入明细，提供「周账单 / 月账单 / 年账单 / 自定义」切换，参考记账 App 的账单样式，收入以绿色显示。</li>`] },
    { ver: `v1.7.5`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>手机端专项美化（不影响电脑/平板）：主页改为<b>一屏精简仪表</b>，只保留今日问候、3 个关键数字、今日课程/待办各前 3 条和 4 个快捷入口，删减走势/年级/话术/模板等纯展示模块。</li>`,
        `<li>手机端待办页：移除「全部/紧急重要/重要不紧急…」筛选芯片和右侧的「四象限说明」/「每日模板库」，标题与日期计数保持单行，列表更紧凑。</li>`,
        `<li>手机端我的页：云同步卡片移到页面最底部；模块入口改为 4 列紧凑网格，隐藏描述文字，8 个入口一屏可见。</li>`,
        `<li>手机端日历：月视图改为<b>彩色圆点</b>表示有课（参考 iOS 日历，不显示完整文字），周视图改为纵向日程列表，去掉 7 列拥挤排版；整体更紧凑、一屏看完。</li>`] },
    { ver: `v1.7.4`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>财务统计 · 新增「导入抽成表」：选 .xlsx 后，先弹出<b>预览</b>（日期 / 学员 / 匹配或新建 / 抽成 / 备注），确认后才写入。表头自动取纯名字（忽略前缀数字与时薪、「X/Y」括号后缀），日期去星期，批注原文搬入备注（自动去 iPad: 前缀、过滤 Excel 系统批注）。</li>`,
        `<li>财务统计 · 导入的抽成按「每天每家长」生成课时记录（抽成 = 单元格金额，状态已完成），并自动按姓名归入现有学员、缺失则新建；抽成计入财务月度走势与按学员统计，但为不打扰课表，这些记录不在日历周视图/月历中渲染，也不计入老师「累计课时」。</li>`] },
    { ver: `v1.7.3`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>老师名册 · 修复「累计课时」显示为 0 的问题：课节缺失老师时，加载/导入时自动按所属学员当前老师补上 teacherId（历史排课、Excel 导入的课也可能没带老师），老师名册与财务「按老师课时排行」现在都能正确统计已完成课时。</li>`] },
    { ver: `v1.7.2`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>可视化课表 · 课程卡片标题简化为只显示<b>孩子姓名</b>，不再显示年级 + 学科前缀，解决名字被截断、显示不全的问题。</li>`,
        `<li>可视化课表 · 课程卡片颜色/学科信息改为跟随学员档案中的最新课程设置同步，避免档案改了「新概念」后课表仍显示旧学科。</li>`,
        `<li>可视化课表 · 取消时间重叠的红色圆点标注（保留自动并排和编辑时的文字提示，仅去掉红点）。</li>`,
        `<li>待办 · 编辑任务弹窗新增「标记为完成 / 标记为未完成」按钮，误勾后可一键恢复未完成状态。</li>`] },
    { ver: `v1.7.1`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>财务统计 · 历史收入改为「按月总额」填写：不再需要按学员逐个拆分——已经不在你这上课的学员不用再管，直接在「历史收入」弹窗里填 <b>每个月的总抽成</b> 即可，每个月一行，月度走势图照样各自画成一根柱子。</li>`,
        `<li>财务统计 · 历史收入弹窗新增「删除月份」权限：每行末尾的 🗑 可删除不想要的月份；并用「月份选择器 + 添加月份」替代原来的「+ 更早月份」按钮，避免误加重复月份（修复之前编辑时多冒出一个月的问题）。</li>`,
        `<li>财务统计 · 明细表与 CSV 导出不再按学员拆分「历史收入」列（因历史收入已改为全局按月总额、与当前课程区间无关），历史收入总额仍在「区间总览」卡片与月度走势中体现。</li>`] },
    { ver: `v1.6.0`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>学员档案：编辑档案时移除「家长称呼」字段，仅保留「学生姓名」并作为档案主名称（更简洁，契合只用学生姓名的习惯）。</li>`,
        `<li>学员档案：新增「手动排序」——每位学员卡片可 ↑/↓ 移动顺序（桌面端支持拖拽），并可一键「按频率重排」恢复自动序，顺序自动保存。</li>`,
        `<li>财务统计：新增「历史收入（按月）」编辑（财务页「历史收入」按钮）——按 <b>月份 × 学员</b> 表格填写开始用本工作台之前的每月抽成（元），每个月单独一列；月度走势图会把 8 月前的每个月各自画成一根柱子，总抽成与明细表 / CSV 导出均含「历史收入」列（非累计 lump sum）。</li>`,
        `<li>学员档案：新增「从 Excel / CSV 导入课时」——粘贴或选择 CSV（列含 上课时间 / 孩子姓名 / 每次抽成，课时费 / 年级 / 学科 / 时长 可选），自动识别列、按姓名归入已有学员、自动新建缺失学员、跳过完全重复的课程。</li>`,
        `<li>重复校验：新建学员时若同名（忽略大小写 / 空格）已存在会提示确认；导入课时时按姓名匹配已有学员而非重复建，并跳过同一人同日期同抽成的重复课程。</li>`] },
    { ver: `v1.5.0`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>数据管理：移除「档案编码格式」自定义模块与「中间人三本账说明」模块（编码恢复为系统默认格式，三本账逻辑保持不变）。</li>`,
        `<li>数据管理：移除「应用锁」与「分享链接」功能，相关数据改为仅通过「云同步」加密传输，登录不再需要密码。</li>`,
        `<li>云同步：明确「同步空间 ID」格式——留空自动创建，手动填写需为纯数字或数字 + 连字符（如 20260802 或 sakura-2026），手机 / 平板 / 电脑填同一个即可同步同一份数据。</li>`,
        `<li>学员档案：新增「上课频率」字段（每周 1 次 ~ 每天 / 不固定），学员列表按频率自动排序，高频学员排前面，便于优先跟进。</li>`,
        `<li>手机端：主页支持模块删除权限（编辑模式下可隐藏不需要的模块）。</li>`,
        `<li>手机端：待办页「今日待办」模块精简排版，去掉拥挤内容、更清爽。</li>`,
        `<li>手机端：我的页图标换为小人图标，并新增「导入数据」功能（选电脑端导出的 JSON 备份即可导入）。</li>`,
        `<li>三端统一：删除四象限说明底部「试课学员」一行小字提示。</li>`] },
    { ver: `v1.4.0`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>学员档案：固定字段（家长称呼、学生姓名等）可直接编辑 / 修改 / 删除；「学科与课时」的年级、学科改为可自填（预设项 + 自定义输入）。</li>`,
        `<li>学员档案：授课老师可自定义填写，保存后自动归入「老师名册」，并按姓名去重——同名老师只建一条，可对应多个学生。</li>`,
        `<li>学员档案：新增「自定义信息」字段，可自由添加、改名、删除（如家长微信、试课备注等），并在档案卡上展示。</li>`,
        `<li>待办：新增事项可设置具体时间（例如晚上 7 点）；日历中显示时间，没填时间则忽略，填了按时间先后排序。</li>`,
        `<li>离线版：修复「生成离线版」无论含不含数据都提示「打包失败」的问题——改为不依赖网络请求，稳定生成单文件离线网页。</li>`,
        `<li>主题：整体更柔和可爱（糖果色柔光背景、更圆润的卡片、渐变标题），PC / 平板布局不变，手机端保持简洁。</li>`,
        `<li>手机端：底部固定 4 个入口（主页 / 日历 / 待办 / 我的），学员档案等入口收进「我的」；手机端不提供导入 / 导出，统一用「云同步」传输数据，并完善了同步状态提示。</li>`,
        `<li>所有页面统一移除标题下的小字副标题行。</li>`] },
    { ver: `v1.3.0`, date: `2026-08-03`, held: false, divider: true,
      items: [`<li>档案编码格式可自定义：在「数据管理 → 档案编码格式」里用 [日期][年级学科][家长][抽成][课时费][课时长] 占位、自定分隔符与顺序，支持实时试解析预览。（注：该「自定义模板 + 粘贴式一键拆解录入」能力已在后续版本移除，现学员编码由系统按结构化字段自动生成，详见 v2.0.0 更新日志。）</li>`,
        `<li>已存档案不受影响——年级/课时费/抽成等结构化字段独立保存，仅新建/编辑时按新格式解析。</li>`] },
    { ver: `v1.2.0`, date: `2026-08-02`, held: false, divider: true,
      items: [`<li>财务统计：板块支持拖动排序 / 隐藏 / 改名（编辑模块），并支持「恢复默认布局」。</li>`,
        `<li>新增「自定义统计块」：可自主添加 区间总览 / 按老师 / 按年级 / 按学员 / 按月走势 等图表块，随时改名、隐藏或删除。</li>`,
        `<li>财务页新增「导出图片（PNG）」与「导出 CSV」，方便留存与对账（CSV 含合计，适配 Excel）。</li>`,
        `<li>安全加固：云同步采用端到端加密（AES-GCM），数据只存你自己的私密 Gist，明文绝不出本机；Token 仅存本机浏览器。</li>`,
        `<li>三端统一：手机 / 平板 / 电脑共用同一 GitHub Token + 同步空间 ID 即可自动同步数据，并在任意 WiFi / 手机流量下通过公网地址打开。</li>`] },
    { ver: `v1.1.0`, date: `2026-08-02`, held: false, divider: true,
      items: [`<li>焕新命名为「逸云阁」，仪表盘更名为「主页」。</li>`,
        `<li>主页新增可编辑/可删除的「每日模板库」模块。</li>`,
        `<li>新增 iOS 风格个人日历（日/周/月/年），事项挂在日期下，可勾选完成。</li>`,
        `<li>老师名册拆为独立模块，放在「学员档案」下方；设置精简为「数据管理」。</li>`,
        `<li>可视化课表支持 年/月/周 三种视图自由切换；财务统计恢复中间人三本账展示。</li>`,
        `<li>全面适配手机端：底部 5 等分导航、单列重排、表格转列表、触控≥44px、无横向滚动。</li>`,
        `<li>「我的」只保留搜索、AI 助手、帮助、更新日志四个工具入口。</li>`] },
    { ver: `v1.0.0`, date: `2026-08-02`, held: false, divider: false,
      items: [`<li>初始版本：待办（模板/四象限/归档）、学员档案（标准编码解析）、可视化课表（周/月/年）、财务三本账、常用话术库、设置与备份。</li>`] }
  ];

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'changelog') return;
    const block = e => {
      const held = e.held
        ? '<div style="margin:2px 0 10px;font-size:12px;color:#b06;font-weight:600">⏳ 待发布 · 待你确认无误后上线</div>'
        : '';
      return '<div class="log-head"><span class="log-ver">' + e.ver + '</span><span class="log-date">' + e.date + '</span></div>' + held +
        '<ul class="log-list">' + e.items.join('') + '</ul>';
    };
    const parts = [];
    CHANGELOG.forEach((e, i) => { if (i > 0 && e.divider) parts.push('<div class="divider"></div>'); parts.push(block(e)); });
    root.innerHTML = '<div class="card"><div class="card-h"><h3>更新日志</h3></div>' + parts.join('') + '</div>';
  }

  Views.changelog = { title: '更新日志', sub: '版本记录', render() { render(); } };
  return { render };
})();
