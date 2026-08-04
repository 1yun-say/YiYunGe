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
      return `<div class="card only-mobile" style="background:linear-gradient(120deg,#fff,var(--pink-50));border-color:var(--pink-200)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><b style="font-size:14px">☁ 云同步</b></div>
          <button class="btn btn-primary btn-sm" data-go="settings">去连接</button>
        </div></div>`;
    }
    const last = s.lastSync ? U.fmtTime(s.lastSync) : '尚未同步';
    return `<div class="card only-mobile" style="background:linear-gradient(120deg,#fff,#eefaf1);border-color:#bfe6c9">
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
      <div class="card brand-card" style="margin-bottom:12px;background:linear-gradient(120deg,#fff,var(--pink-50));border-color:var(--pink-200)">
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
      return `现在有 ${DB.data.students.length} 位学员档案。可直接逐项填写学生姓名、年级学科、课时费、抽成等；也支持用标准编码一键拆解（默认格式：日期-年级学科-学员名-抽成/课时费|时长），例如 240815-高二数学-李明-50/300|90。`;
    }
    if (/(格式|编码|怎么填|怎么新建|怎么录)/.test(q)) {
      return '学员可逐项填写，也可用标准编码一键拆解：默认格式 [日期]-[年级学科]-[家长]-[抽成]/[课时费]|[课时长]\n例：240815-高二数学-李妈妈-50/300|90\n系统会自动拆成结构化字段，分别记录对家长的课时费和我内部的抽成。编码模板目前用系统默认格式。';
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
      ['快速上手', '左侧（手机端底部）切换模块。主页聚合今日课程、提醒事项与模板；提醒事项支持模板一键导入；学员按标准编码自动拆解；老师名册是独立模块，可在学员档案下方找到。'],
      ['学员编码与录入', '新建学员可逐项填写，也可用标准编码一键拆解：默认 [日期]-[年级学科]-[家长]-[抽成]/[课时费]|[课时长]\n例：240815-高二数学-李妈妈-50/300|90\n系统自动拆成结构化字段（课时费、我的抽成）。'],
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
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'changelog') return;
    root.innerHTML = `
    <div class="card">
      <div class="card-h"><h3>更新日志</h3></div>
      <div class="log-ver">v1.9.6</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>全身体检修复（4 项真实问题）</b>：① 修复<b>跨标签页同步未跑数据迁移</b>——同一浏览器多标签时，旧结构数据同步到本页会缺失 repeat / 完成记录等字段，导致重复与完成逻辑错乱；现已复用迁移逻辑，两端数据严格一致。② 修复<b>年视图热力图不展开重复</b>——此前年度统计把重复日程/提醒按原始日期计数，漏掉重复实例，现改为按重复规则逐天展开。③ 修复<b>首页「遗留未完成」误判</b>——重复任务（如每周一回访）因基准日早于今天被全部算作遗留，导致首页拥塞；现仅把「今天不再发生、且未完成」的旧任务判为遗留。④ <b>重复任务勾选视觉一致</b>——当天勾掉的重复待办，勾选框正确显示为已勾选态。</li>
        <li>回归测试新增 8 条（旧字符串 weekly 兼容、跨标签页迁移字段补齐、overdue 误判修复前后对照），重复引擎专项测试达 34 条全绿；全流程 79 条、冒烟 0 运行时错误，三套全绿。</li>
      </ul>

      <div class="log-ver">v1.9.5</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>提醒事项 / 日程「重复」全面自定义</b>：不再只有固定的「每天/每周/每月」等预设。新增<b>自定义重复</b>——可选择每 N 天 / 周 / 个月 / 年，按星期多选（例如<b>每周一、周四、周五</b>），并设置<b>结束方式</b>：永不 / 直到某天 / 重复 N 次。旧版固定值（如 daily / weekly）自动兼容，无需重新录入。</li>
        <li><b>重复真正展开</b>：日历的日 / 周 / 月视图、提醒事项列表、工作台首页、小助手都会按重复规则<b>逐日展开</b>显示，不再只记一条看不见。</li>
        <li><b>单次完成</b>：重复任务可在某一天单独勾选完成（记录到该发生日），<b>不会一次勾掉全部</b>；把日历 / 列表切到其它天仍会正常显示未完成的实例。</li>
        <li><b>提醒事项对齐 iOS 提醒页</b>：编辑 / 新建页补全<b>「重复」</b>与<b>「标记（旗标）」</b>两项——标记项会<b>置顶高亮</b>，并在列表上显示 🚩 与 🔁 重复说明。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.9.4</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>云同步体验增强（解决「两端是否连到同一空间」困扰）</b>：连接成功后，下方以<b>醒目绿色卡片</b>展示本机的<b>真实空间 ID</b> 与一键「复制此 ID」；并新增<b>空间指纹</b>（取 ID 首尾各 4 位，如 <code>5a9c-191b</code>）。两端连到<b>同一份</b>数据时指纹必然相同，用户只要对比指纹即可确认两端是否同步到同一份，不再靠肉眼比对一长串 ID。</li>
        <li><b>复制按钮升级为醒目主按钮</b>，并延长成功提示停留时间（2s → 6s），确保「已连接 / 请核对指纹」的关键提示不被快速淹没。</li>
        <li><b>Toast 支持自定义时长</b>：<code>U.toast(msg, type, dur)</code> 新增可选的 <code>dur</code> 毫秒参数。</li>
        <li><b>ID 格式复核</b>：用户提供的自动生成 ID <code>5a9c0cabf5a31b0802b6ce20a385191b</code>（32 位十六进制）经验证为合法 GitHub Gist ID，可在新版正则下正确识别、不会新建。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.9.3</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>全站「零错误」体检通过</b>：新建一套真正加载全部 19 个脚本（含两个第三方库）、启动 App、逐一渲染全部 17 个视图（仪表盘 / 提醒事项 / 学员 / 老师 / 课表 / 财务 / 日历 / 话术 / 设置 / 我的 / AI / 帮助 / 关联 / 更新日志等）、并触发各视图主要交互（打开新建弹窗、切换日历日 / 周 / 月 / 年、打开搜索、夜间模式切换等）的无头浏览器冒烟测试，全程捕获 <code>console.error</code> / 未捕获异常 / <code>unhandledrejection</code>。结果：<b>运行时错误总数 = 0</b>，并与原有 79 项全流程断言、7 项云同步 ID 断言一同全部通过。</li>
        <li><b>一致性微修</b>：<code>Search</code>（全局搜索）补挂到 <code>window</code>（与 <code>CommissionImport</code> / <code>Brand</code> / <code>Sync</code> 等工具模块一致），避免任何通过 <code>window.Search</code> 调用的路径在未来出错。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.9.2</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>云同步「正确 ID 也被新建」彻底修复（核心 bug，正是你反馈的现象）</b>：之前 GitHub 的 ID 校验正则错误地写成「固定 20 位十六进制」，而 GitHub 真实 Gist ID 是 <b>32 位</b>。于是你从一端复制出来的正确 32 位 ID，在另一端被判定为「格式非法」→ 自动清空 → 重新生成新空间，于是三端连不到同一份数据（尽管网络 / Token / ID 本身都没问题）。现已改正为「20~40 位均可」，并新增「粘贴完整链接也能自动识别 ID」的容错（如 <code>https://gist.github.com/用户名/32位ID</code>）。随附回归测试用真实 32 位 ID 覆盖 断网 / 404 / 成功 / 空 / 格式非法 / 完整链接 共 7 项，全部通过：<b>格式合法的 ID 在任何情况下都不会被丢弃新建</b>。</li>
        <li><b>健壮性</b>：日期解析 <code>U.parse</code> 增加空值 / 非法值守卫，避免任何空日期调用导致整页崩溃（防未来隐患）。</li>
        <li><b>体验一致性</b>：日历页右下「+」按钮现在走日历自己的「新建（日程 / 提醒事项）」弹窗，与其它页面行为统一；之前日历页 FAB 走的是通用快捷菜单。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.9.1</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>修复「遗留提醒」误把已完成项算进去（核心 bug）</b>：v1.7.9 把提醒事项从「完成 / 未完成」两态升级为「未完成 / 已完成 / 今日无法完成」三态后，主页「遗留未完成」计数、AI 助手「未完成提醒数」、关联中心「可关联列表」、以及「全部拉到今天」动作这 4 处仍沿用旧的两态 <code>.done</code> 布尔字段判断。迁移后的新数据已不含 <code>.done</code> 字段（恒为 undefined），导致「是否完成」永远判定为假——<b>已完成的提醒也会被当成遗留项、被一键拉到今天</b>，且主页遗留计数虚高。现 4 处统一改为按三态 <code>status !== 'done'</code> 判断，并已加自动化回归测试（含已完成 / 未完成 / 今日无法完成三种迁移数据）覆盖。</li>
        <li><b>文案一致性</b>：主页模块默认标题「今日待办」改为「今日提醒事项」，与全站重命名统一（用户不可见的内部配置项）。</li>
        <li><b>清理</b>：财务合计行的抽成率调用去掉一处未定义变量兜底；主页模块注释同步更新。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.9.0</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>新增「日程」模块（参考 iOS 日历 / 提醒事项分工）</b>：① 日历现同时承载两类条目——「日程」彩色时间块、<b>无需打勾</b>（如上课、会议、考试）；「提醒事项」保留原有需打勾的勾选框（如回访、待办）。两者在日 / 周 / 月 / 年视图分区展示（「日程 · N」「提醒事项 · N」），互不混淆。② 日程支持：标题、地点、全天开关、起止日期与时间、重复、提醒、颜色分类（考研课程 / 工作 / 个人 / 家庭 / 健康 / 社交 / 其它）、备注；跨天多日日程自动按天聚合显示。③ 日历右上「新建」按钮改为 iOS 风格选择弹窗，先选「日程」或「提醒事项」再进入对应编辑页。</li>
        <li><b>全站「待办」正式更名为「提醒事项」</b>：导航、首页、日历、设置、学员试课回访提示、搜索、AI 助手、帮助与链接中心等所有出现「待办」之处统一改为「提醒事项」，与新增的「日程」形成清晰分工。</li>
        <li><b>云同步「粘贴真实空间 ID 被重新生成」彻底修复（核心 bug）</b>：旧逻辑在点击连接时，只要遇到任何网络异常（断网 / Token 错 / GitHub 不可达）就会把用户粘贴的 ID 清空并新建空间，导致三端永远连不到同一处。现拆分为「格式校验」与「连接尝试」两步：凡是格式合法（GitHub 20 位 hex / Gitee 32 位 hex）的 ID，无论网络 / 鉴权失败一律报错并<b>保留原 ID</b>，只有「留空」或「格式非法」才会自动新建；并随附自动化回归测试覆盖 断网 / 404 / 401 / 403 / 成功 / 空 / 格式非法 共 7 种场景，全部通过。</li>
        <li><b>全流程回归测试清零</b>：重做 jsdom 测试框架，真实加载全部脚本、经 App.go 驱动路由守卫，覆盖启动 / 全部视图渲染 / 提醒事项增删改状态流转 / 学员新建与空学科校验 / 排课与冲突检测 / 财务与抽成表解析 / 日历日程与提醒 / 云同步连接上传下载冲突保护 / 数据导入导出 / reset 共 75 项断言，全绿。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.11</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>云同步「后台自动下载」（准实时多端同步）</b>：① 之前同步只有「改动后自动上传」，另一端需手动点「下载同步」才能看到；现在连接后程序会每 20 秒自动检查云端，一旦发现其他端有更新且本机无未上传改动，就静默拉取并刷新当前页面——实现「平板输入、电脑约 20 秒内自动变好」。② 已连设备重新打开页面也会自动开始后台同步。③ 安全兜底：当本机和云端都有各自改动（撞车）时，自动同步会暂停并提示手动「下载同步」处理，绝不偷偷覆盖任一方数据；你正在输入框打字时也会跳过本周期，避免重渲染清空输入。④「自动同步」开关现同时控制上传与自动下载，取消勾选即停止后台轮询。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.10</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>云同步引导修复</b>：① 修正设置页误导文案——此前提示「多设备填同一个自定义 ID（如 20260802）即可同步」，但 GitHub 的同步空间 ID 由服务器自动分配、不支持自定义名，导致三端各自新建空间无法同步；现改为「留空自动创建，多端共用请复制一端生成的真实空间 ID」。② 连接成功后醒目显示完整真实空间 ID 并提供「复制此 ID」按钮，已连接设备进入设置页也会显示。③ 在 <code>Sync.ensureGist</code> 增加格式校验：手动填写的 ID 若不符合 GitHub(20位hex)/Gitee(32位hex) 格式，直接当无效自动新建，从根上避免再踩坑。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.9</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>全流程体检修复</b>：补做跨模块符号审计时发现并修复一个真 bug——<code>Todo.importTemplates</code> / <code>Todo.editTpl</code> 两个方法此前未挂到 <code>Todo</code> 导出对象，导致 dashboard「模板库」的「导入 / 编辑 / 使用模板」按钮点击即崩溃（渲染不报错，仅点击触发）。已补入导出，跨模块审计清零。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.8</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>可视化课表小课块标签优化 + 日历「今天」按钮对齐</b>：① 重叠课块空间不足时自动省略时间/金额/抽成，仅显示课程名字，避免文字被截断；② 电脑/平板端日历头部「今天」按钮统一为 30px 高度并垂直居中，与左右 ‹ › 按钮对齐（手机端样式不变）。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.7</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>可视化课表重叠课的配色自定义</b>：① 编辑单节课弹窗里新增「课程颜色 + 透明度」滑块，每节课独立可调（不再依赖全局模板）；② 重叠区域新增第 3 种颜色与透明度（「重叠区颜色 / 重叠区透明度」），与上面那节、下面那节各自独立，3 种颜色全部由你自己选；③ 满宽整列渲染保留，重叠课块不被缩窄；④ 课块补回「上课时间 + 到手抽成」信息，普通课与重叠课透明度分别独立控制。⑤ 日历「今天」按钮移到最右侧（日期与 › 不再被分开）；⑥ 日历周视图标题省略年份（如 08.03 — 08.09），一行完整显示。⑦ 自动云同步默认服务商确认为 GitHub（Gist 加密备份）。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.6</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>根治可视化课表「空白」+ 全站稳定性体检</b>：① 修掉 v1.8.5 引入的两个真 bug——safeT2m 函数写成自己调用自己导致栈溢出崩溃、WEEK_MUTED 周视图淡色映射忘记从 U 导出导致每节普通课渲染即崩溃；② 修掉 v1.8.5 更新日志里的反引号导致 extra.js 语法错误、更新日志页打不开；③ 用 Node 把全部 13 个视图逐一真实渲染跑了一遍，确认无异常；④ 全校验跨模块符号引用，确认无「引用未导出」类隐患。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.5</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>真正修复可视化课表「空白」</b>：电脑/平板端周视图只显示头部、整个 grid 不渲染，根因是部分课程数据异常（如上课时间 start 字段缺失/格式错误），导致 U.t2m 抛异常、renderWeek 整体失败。已加多层防御：① includeLesson 过滤掉 start 无效的课程；② 新增 safeT2m/safeEndMin 遇到异常时间不再抛错；③ 排序/冲突分组时把 id 强转字符串，避免 undefined.localeCompare 崩溃；④ renderWeek/renderWeekMobile 外层包 try-catch，再出错会在页面显示具体错误信息而不是空白。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.4</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>修复可视化课表周视图课块「隐身」</b>：课块背景由 #RRGGBBAA 8 位十六进制透明度改为 rgba() 写法，兼容 iPad / 旧版 Safari 及各类浏览器；同时把周视图课块不透明度从 25% 提升到 32%、重叠区 55%、月视图/手机端课卡 12%，让课程在桌面 / 平板端清晰可见，不再和白色背景融为一体。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.3</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>用户反馈 3 项修复</b>：① 手机端课表 / 日历头部——标签独占一行，日期标题与「今天 / 回到今天」按钮严格同一行完整显示，不再截断、不再折行；② 手机端「今日待办」复选框由 22px 缩至 17px 并加左内边距，不再过大、不再贴卡片边缘被裁切；③ 主页 / 财务的柱状走势图补上「暂无数据」兜底（此前无数据时退化为看不见的小桩，桌面 / 平板端看着像空白）。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.2</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>手机端布局整改（用户反馈 8 项）</b>：① 主页彻底删除模板库，模板库改放到导航第 3 个「待办」页「今日待办」下方；② 手机端老师名册改为一行 2 个卡片、卡片内部去空白更紧凑；③ 三端日历 / 课表「今天」按钮强制单行完整显示、不截断不换行；④ 手机端「我的」页「导入数据 / 云同步」由上下两块改为左右并排；⑤ 财务顶部「含未上课程」复选框与按钮保持同一行且不超出屏幕；⑥ 财务账单列表去除横向滑动、去除居中布局；⑦ 手机端明细统计卡片中间空白收紧；⑧ 三端周视图重叠课程恢复横条占满整列，重叠区域改用半透明渐变叠加过渡，课程名显示在各自非重叠区域。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.1</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>v1.8.0 遗留项补全整改</b>：① 三端日历 / 课表「今天」按钮与日期标题严格同一行；② 手机端月视图课程右下角金额不再与课程重叠（改为正常文档流 + 移动端单格最多 2 条课程）；③ 财务列表无批注的项不再显示「批注：导入抽成」，且去除头像列；④ 三端周视图重叠课程改为并列错开、互不压字；⑤ 手机端周视图按 iOS 风格重做为按天议程清单。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.8.0</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li><b>手机端主页精简美化</b>：2×2 快捷入口缩小、卡片间距收紧，确保 iPhone 14 Pro Max 一屏可见无需滚动；「今日待办」上移到「今日课程」之上，「每日模板库」紧跟待办。</li>
        <li><b>三端主页统一</b>：删除「近半年抽成走势 / 本月年级贡献 / 高频话术 / 本月财务」四块，主页更聚焦；同时删去模板库下方的小字说明。</li>
        <li><b>学员状态筛选美化</b>：顶部状态标签简化、不拥挤，「试课中」与计数数字强制同一行不折行。</li>
        <li><b>周视图 iOS 风格重排</b>：星期与日期上下分层、今日日期用粉色实心圆高亮；两节课重叠时列仍占满，改用「重叠」色块角标标识，不再横向压窄。</li>
        <li><b>日历「今天」按钮与日期同一行</b>，不再另起一行留空。</li>
        <li><b>财务改版</b>：「实际到手」列改为「我的收入」；删除「谁带的最多」副标题；「老师课时排行」整体移到「老师名册」板块最上方；删除「学员抽成贡献」板块。</li>
        <li><b>导入抽成表预览可编辑</b>：预览弹窗的日期 / 学员匹配 / 抽成金额 / 备注均改为可输入框，可手动修正识别错的行再确认导入。</li>
        <li><b>导入账单清爽化</b>：直接显示「名字 + 实际收入」，去掉「家教 - 抽成（导入）」标题与「抽」图标；无批注时不显示「有批注」。</li>
        <li><b>删除「安装到桌面」模块</b>（应用图标、外观设置保留）。</li>
        <li><b>底部「更多」图标</b>由 3×3 点阵改为更简洁的三点样式；年视图不再显示「排课」按钮；编辑模块在 iPhone 上不再超出界面边界。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.12</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li>手机端主页：底部「学员 / 老师 / 课表 / 财务」快捷入口由一行 4 个小图标改为 <b>2×2 大图标网格</b>，图标放大至 50px 并加圆角粉色底，新增「快捷入口」标题，主页不再空旷。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.11</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li>收入模型重定义：实际到手 = 我的抽成 − 报销支出；报销支出 = 从「批注」里自动提取的数字之和（如批注写「买资料50、交通30」即报销 80）。排课/编辑弹窗不再手填「实际到手」，只保留「批注（报销支出）」。</li>
        <li>Excel 抽成表导入：单元格数值视为「实际到手收入」，Excel 批注同步导入为课节批注（incomeNote），点开账单即可查看；批注中的数字自动提取为「报销支出」；系统按「到手 + 报销」反推出「我的抽成」，保证三本账自洽并同步到财务统计。</li>
        <li>主页财务速览：桌面端 KPI 卡片改为「本月我的抽成 / 报销支出 / 实际到手 / 到手趋势（环比）」；手机端主页新增「本月财务」三列卡片，抽成、报销、到手一目了然。</li>
        <li>一键备份与丢失预警：数据管理页新增显眼的「立即备份」按钮；启动时若超过 7 天未备份会自动尝试静默备份，超过 7 天 toast 提醒、超过 14 天弹窗强提醒，降低 iPad 清缓存导致数据丢失的风险。</li>
        <li>财务统计 · 新增「导出 PDF」按钮，可生成带汇总 + 明细的月度 / 年度对账单（调用浏览器打印 → 另存为 PDF）。</li>
        <li>平板端财务页可操作化：财务卡片增加横向滚动避免表格被压扁；「含导入数据」「含未上课程」复选框加大点击区域；账单「编辑」按钮触控区域放大，iPad 上可正常编辑账单。</li>
        <li>Service Worker：新增 network-first 策略的 SW，优先拉取最新资源、失败则回退缓存，解决 PWA 主屏幕图标缓存旧版问题，同时支持离线打开。</li>
        <li>手机端主页：底部「学员 / 老师 / 课表 / 财务」快捷入口图标进一步放大，解决页面偏空。</li>
        <li>全站口径统一：财务概览、明细统计、老师课时排行、学员档案、课表年视图，均改为突出「我的抽成 / 报销支出 / 实际到手」，弱化家长流水与老师课酬；原「其余支出」统一更名为「报销支出」。</li>
        <li>老师课时排行：列改为「课酬（=Σ(课时费−我的抽成)）」与「实际到手」，不再显示含义含糊的「其余支出」。</li>
        <li>账单明细：新增「含导入数据」开关；勾选后导入抽成纳入账单，且明细统计不再显示抽成率。点账单任意一行可展开查看「批注」（钱花哪了）。</li>
        <li>修复 bug：财务账单「编辑」按钮此前因全局变量判定方式（window.Schedule 在浏览器顶层 const 下并不挂到 window）而点击无反应，已修复，现可正常打开编辑弹窗。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.10</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li>缓存破坏：给所有 JS / CSS 资源加 <code>?v</code> 版本号，强制 iPad / 手机端主屏幕 PWA 与浏览器放弃旧缓存，避免设备间版本不一致、加载到旧版界面。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.9</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li>待办事项升级为三态：「未完成 / 已完成 / 今日无法完成」。旧版「完成/未完成」数据自动迁移；列表点击状态图标可循环切换，编辑弹窗也可直接选择。</li>
        <li>课节「批注」文案简化：排课/编辑弹窗的标签从「批注（其余钱去哪了）」改为仅「批注」，placeholder 示例保留。</li>
        <li>手机端可视化课表 iOS 风格重排：工具栏分两行不拥挤，周视图日期头放大、今日为圆点高亮，重叠课程自动纵向堆叠不再挤成一坨；月/年视图格子更圆更克制。</li>
        <li>手机端待办页简化：隐藏顶部常驻输入区，点右下角 + 弹出极简新建弹窗（事项 + 可选时间），页面更清爽。</li>
        <li>手机端主页：底部「学员 / 老师 / 课表 / 财务」快捷入口图标放大，解决页面偏空。</li>
        <li>手机端我的页：移除「老师名册」入口，剩余 8 个入口正好排成两行 4 列。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.8</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>课节新增「实际到手收入」独立字段：排课/编辑弹窗都可填写，未填写时自动回退到「我的抽成」（兼容旧数据）。后续所有收入统计、财务、课表、学员档案、主页全部以「实际到手」为口径。</li>
        <li>课节新增「批注」：可填写老师课酬、资料费等说明；可视化课表周视图内联显示、月视图悬浮提示；财务日账单每一条同步显示。</li>
        <li>财务统计 · 日账单标题随「周/月/年/自定义」动态切换，不再固定显示「日账单」；每笔记录右侧新增「编辑」按钮，可直接修改该课节的实际到手与批注。</li>
        <li>统一口径复盘：store.statIn / finance.effectiveRate / finance.group / schedule 各视图 / dashboard / students.js 全部改为从 DB.lessonBreakdown 读取 takeHome，避免 67/70 这类不一致。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.7</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>可视化课表 · 每节课新增「实际到手收入（抽成）」与「批注：其余＝老师课酬」，周视图内联显示、月视图悬浮提示，导入抽成卡片也标注实际到手。</li>
        <li>财务统计 · 日账单每一条同步显示「实际到手收入」与「批注（其余＝老师课酬）」，与课表两端一致。</li>
        <li>排课 · 默认开始时间改为按该学员上一次上课的开始时间自动带出（无历史则回落 19:00），切换学员即时更新。</li>
        <li>更新日志 · 修正版本顺序（1.7.3 置于 1.7.2 之上）与最早版本日期标注。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.6</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>财务统计 · 抽成率改为按「真实课时」且自 8 月 1 日起计算，导入的抽成表数据不再参与抽成率（仍计入收入流水与按学员/年级统计）。</li>
        <li>可视化课表 · 导入的抽成表记录现在会同步显示在课表年/月/周视图中（默认显示），并提供工具栏复选框「显示导入抽成」随时开关；导入记录不写具体时间，以灰色卡片/条目展示。</li>
        <li>财务统计 · 新增「日账单」模块（默认显示在底部）：按日期倒序列出每天的收入明细，提供「周账单 / 月账单 / 年账单 / 自定义」切换，参考记账 App 的账单样式，收入以绿色显示。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.5</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>手机端专项美化（不影响电脑/平板）：主页改为<b>一屏精简仪表</b>，只保留今日问候、3 个关键数字、今日课程/待办各前 3 条和 4 个快捷入口，删减走势/年级/话术/模板等纯展示模块。</li>
        <li>手机端待办页：移除「全部/紧急重要/重要不紧急…」筛选芯片和右侧的「四象限说明」/「每日模板库」，标题与日期计数保持单行，列表更紧凑。</li>
        <li>手机端我的页：云同步卡片移到页面最底部；模块入口改为 4 列紧凑网格，隐藏描述文字，8 个入口一屏可见。</li>
        <li>手机端日历：月视图改为<b>彩色圆点</b>表示有课（参考 iOS 日历，不显示完整文字），周视图改为纵向日程列表，去掉 7 列拥挤排版；整体更紧凑、一屏看完。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.4</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>财务统计 · 新增「导入抽成表」：选 .xlsx 后，先弹出<b>预览</b>（日期 / 学员 / 匹配或新建 / 抽成 / 备注），确认后才写入。表头自动取纯名字（忽略前缀数字与时薪、「X/Y」括号后缀），日期去星期，批注原文搬入备注（自动去 iPad: 前缀、过滤 Excel 系统批注）。</li>
        <li>财务统计 · 导入的抽成按「每天每家长」生成课时记录（抽成 = 单元格金额，状态已完成），并自动按姓名归入现有学员、缺失则新建；抽成计入财务月度走势与按学员统计，但为不打扰课表，这些记录不在日历周视图/月历中渲染，也不计入老师「累计课时」。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.3</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>老师名册 · 修复「累计课时」显示为 0 的问题：课节缺失老师时，加载/导入时自动按所属学员当前老师补上 teacherId（历史排课、Excel 导入的课也可能没带老师），老师名册与财务「按老师课时排行」现在都能正确统计已完成课时。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.2</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>可视化课表 · 课程卡片标题简化为只显示<b>孩子姓名</b>，不再显示年级 + 学科前缀，解决名字被截断、显示不全的问题。</li>
        <li>可视化课表 · 课程卡片颜色/学科信息改为跟随学员档案中的最新课程设置同步，避免档案改了「新概念」后课表仍显示旧学科。</li>
        <li>可视化课表 · 取消时间重叠的红色圆点标注（保留自动并排和编辑时的文字提示，仅去掉红点）。</li>
        <li>待办 · 编辑任务弹窗新增「标记为完成 / 标记为未完成」按钮，误勾后可一键恢复未完成状态。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.1</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>财务统计 · 历史收入改为「按月总额」填写：不再需要按学员逐个拆分——已经不在你这上课的学员不用再管，直接在「历史收入」弹窗里填 <b>每个月的总抽成</b> 即可，每个月一行，月度走势图照样各自画成一根柱子。</li>
        <li>财务统计 · 历史收入弹窗新增「删除月份」权限：每行末尾的 🗑 可删除不想要的月份；并用「月份选择器 + 添加月份」替代原来的「+ 更早月份」按钮，避免误加重复月份（修复之前编辑时多冒出一个月的问题）。</li>
        <li>财务统计 · 明细表与 CSV 导出不再按学员拆分「历史收入」列（因历史收入已改为全局按月总额、与当前课程区间无关），历史收入总额仍在「区间总览」卡片与月度走势中体现。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.6.0</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>学员档案：编辑档案时移除「家长称呼」字段，仅保留「学生姓名」并作为档案主名称（更简洁，契合只用学生姓名的习惯）。</li>
        <li>学员档案：新增「手动排序」——每位学员卡片可 ↑/↓ 移动顺序（桌面端支持拖拽），并可一键「按频率重排」恢复自动序，顺序自动保存。</li>
        <li>财务统计：新增「历史收入（按月）」编辑（财务页「历史收入」按钮）——按 <b>月份 × 学员</b> 表格填写开始用本工作台之前的每月抽成（元），每个月单独一列；月度走势图会把 8 月前的每个月各自画成一根柱子，总抽成与明细表 / CSV 导出均含「历史收入」列（非累计 lump sum）。</li>
        <li>学员档案：新增「从 Excel / CSV 导入课时」——粘贴或选择 CSV（列含 上课时间 / 孩子姓名 / 每次抽成，课时费 / 年级 / 学科 / 时长 可选），自动识别列、按姓名归入已有学员、自动新建缺失学员、跳过完全重复的课程。</li>
        <li>重复校验：新建学员时若同名（忽略大小写 / 空格）已存在会提示确认；导入课时时按姓名匹配已有学员而非重复建，并跳过同一人同日期同抽成的重复课程。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.5.0</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>数据管理：移除「档案编码格式」自定义模块与「中间人三本账说明」模块（编码恢复为系统默认格式，三本账逻辑保持不变）。</li>
        <li>数据管理：移除「应用锁」与「分享链接」功能，相关数据改为仅通过「云同步」加密传输，登录不再需要密码。</li>
        <li>云同步：明确「同步空间 ID」格式——留空自动创建，手动填写需为纯数字或数字 + 连字符（如 20260802 或 sakura-2026），手机 / 平板 / 电脑填同一个即可同步同一份数据。</li>
        <li>学员档案：新增「上课频率」字段（每周 1 次 ~ 每天 / 不固定），学员列表按频率自动排序，高频学员排前面，便于优先跟进。</li>
        <li>手机端：主页支持模块删除权限（编辑模式下可隐藏不需要的模块）。</li>
        <li>手机端：待办页「今日待办」模块精简排版，去掉拥挤内容、更清爽。</li>
        <li>手机端：我的页图标换为小人图标，并新增「导入数据」功能（选电脑端导出的 JSON 备份即可导入）。</li>
        <li>三端统一：删除四象限说明底部「试课学员」一行小字提示。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.4.0</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>学员档案：固定字段（家长称呼、学生姓名等）可直接编辑 / 修改 / 删除；「学科与课时」的年级、学科改为可自填（预设项 + 自定义输入）。</li>
        <li>学员档案：授课老师可自定义填写，保存后自动归入「老师名册」，并按姓名去重——同名老师只建一条，可对应多个学生。</li>
        <li>学员档案：新增「自定义信息」字段，可自由添加、改名、删除（如家长微信、试课备注等），并在档案卡上展示。</li>
        <li>待办：新增事项可设置具体时间（例如晚上 7 点）；日历中显示时间，没填时间则忽略，填了按时间先后排序。</li>
        <li>离线版：修复「生成离线版」无论含不含数据都提示「打包失败」的问题——改为不依赖网络请求，稳定生成单文件离线网页。</li>
        <li>主题：整体更柔和可爱（糖果色柔光背景、更圆润的卡片、渐变标题），PC / 平板布局不变，手机端保持简洁。</li>
        <li>手机端：底部固定 4 个入口（主页 / 日历 / 待办 / 我的），学员档案等入口收进「我的」；手机端不提供导入 / 导出，统一用「云同步」传输数据，并完善了同步状态提示。</li>
        <li>所有页面统一移除标题下的小字副标题行。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.3.0</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>档案编码格式可自定义：在「数据管理 → 档案编码格式」里用 [日期][年级学科][家长][抽成][课时费][课时长] 占位、自定分隔符与顺序，支持实时试解析预览。</li>
        <li>已存档案不受影响——年级/课时费/抽成等结构化字段独立保存，仅新建/编辑时按新格式解析。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.2.0</div><div class="log-date">2026-08-02</div>
      <ul class="log-list">
        <li>财务统计：板块支持拖动排序 / 隐藏 / 改名（编辑模块），并支持「恢复默认布局」。</li>
        <li>新增「自定义统计块」：可自主添加 区间总览 / 按老师 / 按年级 / 按学员 / 按月走势 等图表块，随时改名、隐藏或删除。</li>
        <li>财务页新增「导出图片（PNG）」与「导出 CSV」，方便留存与对账（CSV 含合计，适配 Excel）。</li>
        <li>安全加固：云同步采用端到端加密（AES-GCM），数据只存你自己的私密 Gist，明文绝不出本机；Token 仅存本机浏览器。</li>
        <li>三端统一：手机 / 平板 / 电脑共用同一 GitHub Token + 同步空间 ID 即可自动同步数据，并在任意 WiFi / 手机流量下通过公网地址打开。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.1.0</div><div class="log-date">2026-08-02</div>
      <ul class="log-list">
        <li>焕新命名为「逸云阁」，仪表盘更名为「主页」。</li>
        <li>主页新增可编辑/可删除的「每日模板库」模块。</li>
        <li>新增 iOS 风格个人日历（日/周/月/年），事项挂在日期下，可勾选完成。</li>
        <li>老师名册拆为独立模块，放在「学员档案」下方；设置精简为「数据管理」。</li>
        <li>可视化课表支持 年/月/周 三种视图自由切换；财务统计恢复中间人三本账展示。</li>
        <li>全面适配手机端：底部 5 等分导航、单列重排、表格转列表、触控≥44px、无横向滚动。</li>
        <li>「我的」只保留搜索、AI 助手、帮助、更新日志四个工具入口。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.0.0</div><div class="log-date">2026-08-02</div>
      <ul class="log-list">
        <li>初始版本：待办（模板/四象限/归档）、学员档案（标准编码解析）、可视化课表（周/月/年）、财务三本账、常用话术库、设置与备份。</li>
      </ul>
    </div>`;
  }
  Views.changelog = { title: '更新日志', sub: '版本记录', render() { render(); } };
  return { render };
})();
