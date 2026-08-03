/* ===== 更多 / AI助手 / 帮助 / 搜索 / 关联 / 更新日志 ===== */
window.Views = window.Views || {};

/* ---------- 全局搜索 ---------- */
const Search = (() => {
  function results(kw) {
    if (!kw) return `<div class="muted" style="padding:24px;text-align:center">输入关键词，搜索学员 / 待办 / 课表 / 话术</div>`;
    const k = kw.toLowerCase();
    const stu = DB.data.students.filter(s => (s.code + s.parentName + s.grade + s.subject).toLowerCase().includes(k));
    const todo = DB.data.todos.filter(t => t.title.toLowerCase().includes(k));
    const les = DB.data.lessons.filter(l => { const s = DB.student(l.studentId); return (s && (s.parentName + s.grade + s.subject).toLowerCase().includes(k)) || (l.note || '').toLowerCase().includes(k); });
    const ph = DB.data.phrases.filter(p => (p.title + p.content).toLowerCase().includes(k));
    let h = '';
    if (stu.length) h += `<div class="search-grp">学员档案 · ${stu.length}</div>` + stu.slice(0, 8).map(s =>
      `<div class="search-row" data-go="students"><div class="si" style="background:${U.subColor(s.subject)}">${U.esc(s.parentName.slice(0, 1))}</div>
       <div><div class="st">${U.esc(s.parentName)}</div><div class="ss">${U.esc(s.grade + s.subject)} · ${U.esc(s.code)}</div></div></div>`).join('');
    if (todo.length) h += `<div class="search-grp">待办 · ${todo.length}</div>` + todo.slice(0, 8).map(t =>
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
          <input id="sIn" placeholder="搜索学员、待办、课表、话术…" autocomplete="off"></div>
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
      return `<div class="card only-mobile" style="background:linear-gradient(120deg,#fff,#fff4f8);border-color:var(--pink-200)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div><b style="font-size:14px">☁ 云同步</b>
            <div class="muted" style="font-size:12px">手机 / 平板 / 电脑数据自动统一，无需导入导出文件</div></div>
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
      <div class="card brand-card" style="margin-bottom:12px;background:linear-gradient(120deg,#fff,#fff4f8);border-color:var(--pink-200)">
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
      <div class="card only-mobile" style="margin:16px 0">
        <div class="card-h"><h3>导入数据</h3></div>
        <p class="muted" style="font-size:12.5px;margin-bottom:10px">选电脑端导出的 JSON 备份即可导入，会整体覆盖当前数据（导入前自动保留快照，可在电脑端「数据管理」撤销）。</p>
        <button class="btn btn-primary btn-sm" data-act="m-import">选择备份文件导入</button>
        <input type="file" id="mFileIn" accept="application/json" style="display:none">
      </div>
      ${syncCardHTML()}
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
      const td = DB.data.todos.filter(x => x.date === t && !x.done).length;
      return `今天排了 ${ls.length} 节课，还有 ${td} 条待办未完成。` + (ls.length ? ` 第一节 ${ls[0].start} 开始。` : ' 今天没有排课，可以专心拓客～');
    }
    if (/(抽成|赚|收入|利润|多少钱)/.test(q)) {
      const a = U.monthFirst(U.today()), b = U.monthLast(U.today());
      const m = DB.statIn(a, b, { includeScheduled: true });
      const done = DB.statIn(a, b);
      return `本月（预计）抽成收入 ${U.money(m.profit)}，已落袋 ${U.money(done.profit)}，共 ${m.count} 节课、流水 ${U.money(m.gross)}。`;
    }
    if (/(待办|任务|还有什么|要做)/.test(q)) {
      const n = Todo.pendingCount();
      return `当前共有 ${n} 条未完成的待办（含历史遗留）。打开「待办」可以查看和处理，也可以一键导入每日模板。`;
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
      return '把学员标记为「试课中」并填试课日期后，次日系统会自动在待办生成一条「回访XX妈妈试课体验」，且不会重复生成。';
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
      ['快速上手', '左侧（手机端底部）切换模块。主页聚合今日课程、待办与模板；待办支持模板一键导入；学员按标准编码自动拆解；老师名册是独立模块，可在学员档案下方找到。'],
      ['学员编码与录入', '新建学员可逐项填写，也可用标准编码一键拆解：默认 [日期]-[年级学科]-[家长]-[抽成]/[课时费]|[课时长]\n例：240815-高二数学-李妈妈-50/300|90\n系统自动拆成结构化字段（课时费、我的抽成）。'],
      ['中间人三本账', '每节课记录我的抽成与报销支出，实际到手 = 我的抽成 − 报销支出（报销支出从批注数字提取）。抽成存绝对金额、每节课冗余存价格快照，保证历史账目不被改写。'],
      ['可视化课表', '周视图时间轴可拖拽改时间，重叠自动并排+红框提示；月视图看密度；年视图看淡旺季。同一时段允许排两节课。'],
      ['试课回访', '学员标记「试课中」+ 填试课日期，次日自动在待办生成「回访XX妈妈试课体验」，幂等只生成一次。'],
      ['财务统计', '支持本月/上月/近30天/本年/自定义区间；年级饼图、老师课时排行、学员贡献、明细表；板块可排序与显隐。页面显示数据最近更新时间。'],
      ['数据备份', '数据仅存本机浏览器，不上传。设置-数据管理可导出/导入 JSON、载入演示数据、清空。换设备前务必导出备份。']
    ];
    root.innerHTML = `
    <div class="card">
      <div class="card-h"><h3>使用指南</h3></div>
      ${faq.map(([q, a]) => `<div class="link-card" style="box-shadow:none;margin-bottom:10px">
        <h4>${U.esc(q)}</h4><p class="muted" style="font-size:12.5px;line-height:1.8;white-space:pre-wrap">${U.esc(a)}</p></div>`).join('')}
      <div class="divider"></div>
      <p class="muted" style="font-size:12px">提示：手机端底部导航固定 4 个入口（主页 / 日历 / 待办 / 我的），学员档案、老师名册、可视化课表、财务统计、常用话术都在「我的」里进入；数据在手机端通过「云同步」统一，无需导入导出文件。</p>
    </div>`;
  }
  Views.help = { title: '帮助', sub: '逸云阁使用指南', render() { render(); } };
  return { render };
})();

/* ---------- 关联中心（待办 ↔ 学员） ---------- */
const Link = (() => {
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'link') return;
    const linked = DB.data.todos.filter(t => t.studentId);
    const unlinked = DB.data.todos.filter(t => !t.studentId && !t.done);
    const opt = DB.data.students.map(s => `<option value="${s.id}">${U.esc(s.parentName)}（${U.esc(s.grade + s.subject)}）</option>`).join('');
    const optT = unlinked.map(t => `<option value="${t.id}">${U.esc(t.title)}</option>`).join('');

    root.innerHTML = `
    <div class="link-card">
      <h4>中间人关系</h4>
      <p class="muted" style="font-size:12.5px;line-height:1.8">你是连接「家长」与「老师」的中间人。每节课记录 <b>我的抽成</b> 与 <b>报销支出</b>（批注里写的花费，如买资料50、交通30），<b>实际到手 = 我的抽成 − 报销支出</b>。家长流水、老师课酬等明细退居次要，重点只看抽成与报销。</p>
    </div>

    <div class="link-card">
      <h4>已关联待办（${linked.length}）</h4>
      ${linked.length ? linked.map(t => {
        const s = DB.student(t.studentId);
        return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="link-rel"><svg class="ico"><use href="#i-link"/></svg>${s ? U.esc(s.parentName) : '已删除'} · ${U.esc(s ? s.grade + s.subject : '')}</span>
          <span style="font-size:13px;flex:1;min-width:120px">${U.esc(t.title)}</span>
          <button class="btn btn-sm btn-ghost" data-act="unlink" data-id="${t.id}">解除</button></div>`;
      }).join('') : `<p class="muted" style="font-size:12.5px">还没有把待办关联到学员。把下面的待办和学员关联起来，方便跟进。</p>`}
    </div>

    <div class="link-card">
      <h4>快速关联</h4>
      ${optT ? `<div class="row">
        <div class="field"><label>待办</label><select class="input" id="lk_t">${optT}</select></div>
        <div class="field"><label>学员</label><select class="input" id="lk_s">${opt}</select></div>
      </div>
      <button class="btn btn-primary" data-act="doLink">关联</button>` : `<p class="muted" style="font-size:12.5px">没有可关联的未完成待办。</p>`}
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
  Views.link = { title: '关联', sub: '待办与学员的关联管理', render() { render(); } };
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
      <div class="log-ver">v1.7.10</div><div class="log-date">2026-08-04</div>
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
      <div class="log-ver">v1.7.9</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li>缓存破坏：给所有 JS / CSS 资源加 <code>?v=1.7.9</code> 版本号，强制 iPad / 手机端主屏幕 PWA 与浏览器放弃旧缓存，避免设备间版本不一致、加载到旧版界面。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.8</div><div class="log-date">2026-08-04</div>
      <ul class="log-list">
        <li>待办事项升级为三态：「未完成 / 已完成 / 今日无法完成」。旧版「完成/未完成」数据自动迁移；列表点击状态图标可循环切换，编辑弹窗也可直接选择。</li>
        <li>课节「批注」文案简化：排课/编辑弹窗的标签从「批注（其余钱去哪了）」改为仅「批注」，placeholder 示例保留。</li>
        <li>手机端可视化课表 iOS 风格重排：工具栏分两行不拥挤，周视图日期头放大、今日为圆点高亮，重叠课程自动纵向堆叠不再挤成一坨；月/年视图格子更圆更克制。</li>
        <li>手机端待办页简化：隐藏顶部常驻输入区，点右下角 + 弹出极简新建弹窗（事项 + 可选时间），页面更清爽。</li>
        <li>手机端主页：底部「学员 / 老师 / 课表 / 财务」快捷入口图标放大，解决页面偏空。</li>
        <li>手机端我的页：移除「老师名册」入口，剩余 8 个入口正好排成两行 4 列。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.7</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>课节新增「实际到手收入」独立字段：排课/编辑弹窗都可填写，未填写时自动回退到「我的抽成」（兼容旧数据）。后续所有收入统计、财务、课表、学员档案、主页全部以「实际到手」为口径。</li>
        <li>课节新增「批注」：可填写老师课酬、资料费等说明；可视化课表周视图内联显示、月视图悬浮提示；财务日账单每一条同步显示。</li>
        <li>财务统计 · 日账单标题随「周/月/年/自定义」动态切换，不再固定显示「日账单」；每笔记录右侧新增「编辑」按钮，可直接修改该课节的实际到手与批注。</li>
        <li>统一口径复盘：store.statIn / finance.effectiveRate / finance.group / schedule 各视图 / dashboard / students.js 全部改为从 DB.lessonBreakdown 读取 takeHome，避免 67/70 这类不一致。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.6</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>可视化课表 · 每节课新增「实际到手收入（抽成）」与「批注：其余＝老师课酬」，周视图内联显示、月视图悬浮提示，导入抽成卡片也标注实际到手。</li>
        <li>财务统计 · 日账单每一条同步显示「实际到手收入」与「批注（其余＝老师课酬）」，与课表两端一致。</li>
        <li>排课 · 默认开始时间改为按该学员上一次上课的开始时间自动带出（无历史则回落 19:00），切换学员即时更新。</li>
        <li>更新日志 · 修正版本顺序（1.7.3 置于 1.7.2 之上）与最早版本日期标注。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.5</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>财务统计 · 抽成率改为按「真实课时」且自 8 月 1 日起计算，导入的抽成表数据不再参与抽成率（仍计入收入流水与按学员/年级统计）。</li>
        <li>可视化课表 · 导入的抽成表记录现在会同步显示在课表年/月/周视图中（默认显示），并提供工具栏复选框「显示导入抽成」随时开关；导入记录不写具体时间，以灰色卡片/条目展示。</li>
        <li>财务统计 · 新增「日账单」模块（默认显示在底部）：按日期倒序列出每天的收入明细，提供「周账单 / 月账单 / 年账单 / 自定义」切换，参考记账 App 的账单样式，收入以绿色显示。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.4</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>手机端专项美化（不影响电脑/平板）：主页改为<b>一屏精简仪表</b>，只保留今日问候、3 个关键数字、今日课程/待办各前 3 条和 4 个快捷入口，删减走势/年级/话术/模板等纯展示模块。</li>
        <li>手机端待办页：移除「全部/紧急重要/重要不紧急…」筛选芯片和右侧的「四象限说明」/「每日模板库」，标题与日期计数保持单行，列表更紧凑。</li>
        <li>手机端我的页：云同步卡片移到页面最底部；模块入口改为 4 列紧凑网格，隐藏描述文字，8 个入口一屏可见。</li>
        <li>手机端日历：月视图改为<b>彩色圆点</b>表示有课（参考 iOS 日历，不显示完整文字），周视图改为纵向日程列表，去掉 7 列拥挤排版；整体更紧凑、一屏看完。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.3</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>财务统计 · 新增「导入抽成表」：选 .xlsx 后，先弹出<b>预览</b>（日期 / 学员 / 匹配或新建 / 抽成 / 备注），确认后才写入。表头自动取纯名字（忽略前缀数字与时薪、「X/Y」括号后缀），日期去星期，批注原文搬入备注（自动去 iPad: 前缀、过滤 Excel 系统批注）。</li>
        <li>财务统计 · 导入的抽成按「每天每家长」生成课时记录（抽成 = 单元格金额，状态已完成），并自动按姓名归入现有学员、缺失则新建；抽成计入财务月度走势与按学员统计，但为不打扰课表，这些记录不在日历周视图/月历中渲染，也不计入老师「累计课时」。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.2</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>老师名册 · 修复「累计课时」显示为 0 的问题：课节缺失老师时，加载/导入时自动按所属学员当前老师补上 teacherId（历史排课、Excel 导入的课也可能没带老师），老师名册与财务「按老师课时排行」现在都能正确统计已完成课时。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7.1</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>可视化课表 · 课程卡片标题简化为只显示<b>孩子姓名</b>，不再显示年级 + 学科前缀，解决名字被截断、显示不全的问题。</li>
        <li>可视化课表 · 课程卡片颜色/学科信息改为跟随学员档案中的最新课程设置同步，避免档案改了「新概念」后课表仍显示旧学科。</li>
        <li>可视化课表 · 取消时间重叠的红色圆点标注（保留自动并排和编辑时的文字提示，仅去掉红点）。</li>
        <li>待办 · 编辑任务弹窗新增「标记为完成 / 标记为未完成」按钮，误勾后可一键恢复未完成状态。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.7</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>财务统计 · 历史收入改为「按月总额」填写：不再需要按学员逐个拆分——已经不在你这上课的学员不用再管，直接在「历史收入」弹窗里填 <b>每个月的总抽成</b> 即可，每个月一行，月度走势图照样各自画成一根柱子。</li>
        <li>财务统计 · 历史收入弹窗新增「删除月份」权限：每行末尾的 🗑 可删除不想要的月份；并用「月份选择器 + 添加月份」替代原来的「+ 更早月份」按钮，避免误加重复月份（修复之前编辑时多冒出一个月的问题）。</li>
        <li>财务统计 · 明细表与 CSV 导出不再按学员拆分「历史收入」列（因历史收入已改为全局按月总额、与当前课程区间无关），历史收入总额仍在「区间总览」卡片与月度走势中体现。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.6</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>学员档案：编辑档案时移除「家长称呼」字段，仅保留「学生姓名」并作为档案主名称（更简洁，契合只用学生姓名的习惯）。</li>
        <li>学员档案：新增「手动排序」——每位学员卡片可 ↑/↓ 移动顺序（桌面端支持拖拽），并可一键「按频率重排」恢复自动序，顺序自动保存。</li>
        <li>财务统计：新增「历史收入（按月）」编辑（财务页「历史收入」按钮）——按 <b>月份 × 学员</b> 表格填写开始用本工作台之前的每月抽成（元），每个月单独一列；月度走势图会把 8 月前的每个月各自画成一根柱子，总抽成与明细表 / CSV 导出均含「历史收入」列（非累计 lump sum）。</li>
        <li>学员档案：新增「从 Excel / CSV 导入课时」——粘贴或选择 CSV（列含 上课时间 / 孩子姓名 / 每次抽成，课时费 / 年级 / 学科 / 时长 可选），自动识别列、按姓名归入已有学员、自动新建缺失学员、跳过完全重复的课程。</li>
        <li>重复校验：新建学员时若同名（忽略大小写 / 空格）已存在会提示确认；导入课时时按姓名匹配已有学员而非重复建，并跳过同一人同日期同抽成的重复课程。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.5</div><div class="log-date">2026-08-03</div>
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
      <div class="log-ver">v1.4</div><div class="log-date">2026-08-03</div>
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
      <div class="log-ver">v1.3</div><div class="log-date">2026-08-03</div>
      <ul class="log-list">
        <li>档案编码格式可自定义：在「数据管理 → 档案编码格式」里用 [日期][年级学科][家长][抽成][课时费][课时长] 占位、自定分隔符与顺序，支持实时试解析预览。</li>
        <li>已存档案不受影响——年级/课时费/抽成等结构化字段独立保存，仅新建/编辑时按新格式解析。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.2</div><div class="log-date">2026-08-02</div>
      <ul class="log-list">
        <li>财务统计：板块支持拖动排序 / 隐藏 / 改名（编辑模块），并支持「恢复默认布局」。</li>
        <li>新增「自定义统计块」：可自主添加 区间总览 / 按老师 / 按年级 / 按学员 / 按月走势 等图表块，随时改名、隐藏或删除。</li>
        <li>财务页新增「导出图片（PNG）」与「导出 CSV」，方便留存与对账（CSV 含合计，适配 Excel）。</li>
        <li>安全加固：云同步采用端到端加密（AES-GCM），数据只存你自己的私密 Gist，明文绝不出本机；Token 仅存本机浏览器。</li>
        <li>三端统一：手机 / 平板 / 电脑共用同一 GitHub Token + 同步空间 ID 即可自动同步数据，并在任意 WiFi / 手机流量下通过公网地址打开。</li>
      </ul>
      <div class="divider"></div>
      <div class="log-ver">v1.1</div><div class="log-date">2026-08-02</div>
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
      <div class="log-ver">v1.0</div><div class="log-date">2026-08-01</div>
      <ul class="log-list">
        <li>初始版本：待办（模板/四象限/归档）、学员档案（标准编码解析）、可视化课表（周/月/年）、财务三本账、常用话术库、设置与备份。</li>
      </ul>
    </div>`;
  }
  Views.changelog = { title: '更新日志', sub: '版本记录', render() { render(); } };
  return { render };
})();
