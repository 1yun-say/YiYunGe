/* ===== 财务统计（中间人三本账 · 模块可编辑 + 自定义块 + 导出） ===== */
window.Views = window.Views || {};

const Finance = (() => {
  let range = 'month';           // month | lastMonth | year | 30d | custom
  let from = U.monthFirst(U.today()), to = U.monthLast(U.today());
  let includeScheduled = false;  // 是否把「待上课」也计入
  let dim = 'student';           // student | grade | subject | teacher
  let editMode = false;

  const PALETTE = ['#f9709d', '#ffb6ce', '#8fb8f0', '#7fc8a9', '#f2b544', '#b48ce0', '#65c7c0', '#e2a06a', '#ef8ea4', '#79b36b'];

  /* 历史收入（开始用本工作台之前，按月填写）：histIncome 存为 { 'YYYY-MM': 金额 } 对象；
     兼容旧版单个数字（v1.6 初版误用的累计数）按 legacy 处理。 */
  function histVal(s) {
    if (!s || !s.histIncome) return 0;
    if (typeof s.histIncome === 'number') return +s.histIncome || 0;
    if (typeof s.histIncome === 'object') return Object.values(s.histIncome).reduce((a, b) => a + (+b || 0), 0);
    return 0;
  }
  function histMonth(s, mk) {
    if (!s || !s.histIncome || typeof s.histIncome !== 'object') return 0;
    return +s.histIncome[mk] || 0;
  }

  function applyRange(r) {
    range = r; const t = U.today();
    if (r === 'month') { from = U.monthFirst(t); to = U.monthLast(t); }
    if (r === 'lastMonth') { const m = U.addMonths(U.monthFirst(t), -1); from = U.monthFirst(m); to = U.monthLast(m); }
    if (r === 'year') { from = U.yearFirst(t); to = U.yearLast(t); }
    if (r === '30d') { from = U.addDays(t, -29); to = t; }
  }

  /* ---------- 模块配置：读取并合并自定义块（保留顺序/前向兼容） ---------- */
  function getSections() {
    const def = DB.defaultFinanceSections();
    const saved = (DB.data.settings.financeSections || []).slice();
    const savedByKey = {}; saved.forEach(s => savedByKey[s.key] = s);
    // 以 saved 顺序为基准（保留自定义块穿插位置），缺失的默认块补到末尾
    const seen = {};
    const ord = [];
    saved.forEach(s => { if (!seen[s.key]) { ord.push(s.key); seen[s.key] = 1; } });
    def.forEach(d => { if (!seen[d.key]) { ord.push(d.key); seen[d.key] = 1; } });
    return ord.map(k => {
      const base = def.find(d => d.key === k);
      const s = savedByKey[k] || {};
      if (s.deleted) return null;
      if (base) return { key: k, name: (s.name || base.name), visible: s.visible !== false, custom: false };
      return { key: k, name: s.name || '自定义模块', visible: s.visible !== false, custom: true, type: s.type || 'overview' };
    }).filter(Boolean);
  }
  function sectionName(key) {
    const s = getSections().find(x => x.key === key);
    if (s && s.name) return s.name;
    const d = DB.defaultFinanceSections().find(x => x.key === key);
    return d ? d.name : (typeof key === 'string' ? key : '未知模块');
  }
  // 落盘（一次改动一次保存，不再写逐条编辑日志）
  // 注意：重排/移动时传入的是「解析后」的模块对象，需保留已删除(deleted)模块的标记，
  // 否则会被整体覆盖而「复活」已删除的模块。
  function applySections(newSections) {
    const deleted = (DB.data.settings.financeSections || []).filter(s => s.deleted);
    const keep = newSections.concat(deleted.filter(d => !newSections.some(s => s.key === d.key)));
    DB.data.settings.financeSections = keep;
    DB.save();
  }

  function group(lessons, by) {
    const map = new Map();
    lessons.forEach(l => {
      const s = DB.student(l.studentId);
      const sub = (l.grade || l.subject) ? { grade: l.grade, subject: l.subject } : (s ? DB.primarySubject(s) : { grade: '未知', subject: '' });
      let key, label;
      if (by === 'student') { key = l.studentId; label = s ? `${DB.primarySubject(s).grade}${DB.primarySubject(s).subject}·${s.parentName}` : '已删除学员'; }
      else if (by === 'grade') { key = sub.grade || '未知'; label = key; }
      else if (by === 'subject') { key = sub.subject || '未知'; label = key; }
      else { key = l.teacherId || 'none'; label = DB.teacherName(l.teacherId); }
      if (!map.has(key)) map.set(key, { key, label, count: 0, minutes: 0, gross: 0, profit: 0, hist: 0, _sids: new Set() });
      const g = map.get(key);
      g.count++; g.minutes += +l.duration || 0; g.gross += +l.tuition || 0; g.profit += +l.commission || 0;
      g._sids.add(l.studentId);
    });
    Array.from(map.values()).forEach(g => {
      // 历史收入按月填写、与区间无关，按学员汇总（避免被每节课重复累加）
      g.hist = (by === 'student')
        ? histVal(DB.student(g.key))
        : Array.from(g._sids).reduce((a, sid) => a + histVal(DB.student(sid)), 0);
      delete g._sids;
    });
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
  }

  /* ---------- 各卡片独立渲染（标题取配置 name） ---------- */
  function cardTrend(ctx, title) {
    return `<div class="card">
      <div class="card-h"><h3>${U.esc(title)}</h3><span class="sub">柱高 = 当月抽成</span></div>
      ${U.columns(ctx.monthly, { money: true })}
    </div>`;
  }
  function cardGrade(ctx, title) {
    const by = ctx.byGrade;
    return `<div class="card">
      <div class="card-h"><h3>${U.esc(title)}</h3><span class="sub">按抽成占比</span></div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <div>${U.pie(by.slice(0, 8).map((g, i) => ({ label: g.label, value: g.profit, color: PALETTE[i % PALETTE.length] })), 168)}</div>
        <div style="flex:1;min-width:150px">
          ${by.slice(0, 8).map((g, i) => `<div style="display:flex;align-items:center;gap:7px;font-size:12px;margin-bottom:6px">
            <i style="width:10px;height:10px;border-radius:3px;background:${PALETTE[i % PALETTE.length]};flex:none"></i>
            <span style="flex:1">${U.esc(g.label)}</span>
            <b class="money in">${U.money(g.profit)}</b></div>`).join('') || '<p class="muted" style="font-size:12px">暂无数据</p>'}
        </div>
      </div>
    </div>`;
  }
  function cardTeacher(ctx, title) {
    const by = ctx.byTeacher;
    return `<div class="card">
      <div class="card-h"><h3>${U.esc(title)}</h3><span class="sub">谁带的课最多</span></div>
      ${U.bars(by.map((t, i) => ({ label: t.label, value: t.count, color: PALETTE[i % PALETTE.length] })), { unit: ' 节' })}
      <div class="divider"></div>
      <table class="tbl"><thead><tr><th>老师</th><th class="num">课时</th><th class="num">课酬支出</th><th class="num">我的抽成</th></tr></thead>
        <tbody>${by.map(t => `<tr><td data-label="老师">${U.esc(t.label)}</td><td class="num" data-label="课时">${t.count}</td>
          <td class="num money out" data-label="课酬支出">${U.money(t.gross - t.profit)}</td>
          <td class="num money in" data-label="我的抽成">${U.money(t.profit)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">暂无数据</td></tr>'}</tbody></table>
    </div>`;
  }
  function cardStudent(ctx, title) {
    const by = ctx.byStu;
    return `<div class="card">
      <div class="card-h"><h3>${U.esc(title)}</h3><span class="sub">TOP 8</span></div>
      ${U.bars(by.slice(0, 8).map((g, i) => ({ label: g.label, value: g.profit, color: PALETTE[i % PALETTE.length] })), { money: true })}
    </div>`;
  }
  function cardDetail(ctx, title) {
    const cur = ctx.cur, st = ctx.st;
    return `<div class="card">
      <div class="card-h">
        <h3>${U.esc(title)}</h3>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap">
          <div class="tabs">
            ${[['student', '按学员'], ['grade', '按年级'], ['subject', '按学科'], ['teacher', '按老师']]
          .map(([k, n]) => `<button class="tab ${dim === k ? 'active' : ''}" data-d="${k}">${n}</button>`).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" data-act="exportCsv">导出CSV</button>
        </div>
      </div>
      <table class="tbl">
        <thead><tr><th>${{ student: '学员', grade: '年级', subject: '学科', teacher: '老师' }[dim]}</th>
          <th class="num">课时</th><th class="num">总时长</th>          <th class="num">家长流水</th>
          <th class="num">历史收入</th>
          <th class="num">老师课酬</th><th class="num">我的抽成</th><th class="num">抽成率</th><th style="width:110px">占比</th></tr></thead>
        <tbody>
          ${cur.map(g => `<tr>
            <td data-label="名称">${U.esc(g.label)}</td>
            <td class="num" data-label="课时">${g.count}</td>
            <td class="num" data-label="总时长">${(g.minutes / 60).toFixed(1)} h</td>
            <td class="num money" data-label="家长流水">${U.money(g.gross)}</td>
            <td class="num money in" data-label="历史收入">${U.money(g.hist)}</td>
            <td class="num money out" data-label="老师课酬">${U.money(g.gross - g.profit)}</td>
            <td class="num money in" data-label="我的抽成">${U.money(g.profit)}</td>
            <td class="num" data-label="抽成率">${g.gross ? Math.round(g.profit / g.gross * 100) : 0}%</td>
            <td data-label="占比"><div class="bt" style="height:8px;background:var(--pink-75);border-radius:6px;overflow:hidden">
              <i style="display:block;height:100%;width:${st.profit ? g.profit / st.profit * 100 : 0}%;background:linear-gradient(90deg,#ffb6ce,#f9709d)"></i></div></td>
          </tr>`).join('') || `<tr><td colspan="8" class="muted" style="text-align:center;padding:26px">该区间还没有课程记录</td></tr>`}
        </tbody>
        ${cur.length ? `<tfoot><tr style="font-weight:700;background:var(--pink-50)">
          <td>合计</td>          <td class="num">${st.count}</td><td class="num">${(st.minutes / 60).toFixed(1)} h</td>
          <td class="num money">${U.money(st.gross)}</td><td class="num money in">${U.money(ctx.histTotal)}</td><td class="num money out">${U.money(st.cost)}</td>
          <td class="num money in">${U.money(st.profit)}</td>
          <td class="num">${st.gross ? Math.round(st.profit / st.gross * 100) : 0}%</td><td></td></tr></tfoot>` : ''}
      </table>
      <p class="muted" style="font-size:11.5px;margin-top:10px">
        统计口径：${includeScheduled ? '已完成 + 待上课程' : '仅已完成课程'}；区间 ${from} 至 ${to}（共 ${ctx.days} 天）。
        取消/请假的课程一律不计入。点「导出CSV」可按当前维度与时间区间导出，便于对账。</p>
    </div>`;
  }

  /* 自定义块渲染 */
  function cardOverview(ctx, title) {
    const st = ctx.st;
    const cards = [
      ['我的抽成', U.money(st.profit + ctx.histTotal), 'in'],
      ['家长流水', U.money(st.gross), ''],
      ['老师课酬', U.money(st.cost), 'out'],
      ['课时数', st.count + ' 节', '']
    ];
    return `<div class="card">
      <div class="card-h"><h3>${U.esc(title)}</h3><span class="sub">${from} ~ ${to}</span></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${cards.map(([n, v, c]) => `<div style="flex:1;min-width:110px;background:var(--pink-50);border:1px solid var(--pink-100);border-radius:12px;padding:10px 12px">
          <div class="muted" style="font-size:12px">${n}</div>
          <div class="money ${c}" style="font-size:19px;font-weight:700">${v}</div></div>`).join('')}
      </div>
      ${ctx.histTotal ? `<p class="muted" style="font-size:11.5px;margin:10px 0 0">含历史收入 <b class="money in">${U.money(ctx.histTotal)}</b>（使用本工作台之前、按月填写的每月抽成，已并入各月走势与总抽成）</p>` : ''}
    </div>`;
  }
  function renderSection(sec, ctx) {
    if (sec.custom) {
      if (sec.type === 'overview') return cardOverview(ctx, sec.name);
      if (sec.type === 'teacher') return cardTeacher(ctx, sec.name);
      if (sec.type === 'grade') return cardGrade(ctx, sec.name);
      if (sec.type === 'student') return cardStudent(ctx, sec.name);
      if (sec.type === 'month') return cardTrend(ctx, sec.name);
      return cardOverview(ctx, sec.name);
    }
    return (RENDERERS[sec.key] || cardDetail)(ctx, sec.name);
  }

  const RENDERERS = { trend: cardTrend, grade: cardGrade, teacher: cardTeacher, student: cardStudent, detail: cardDetail };

  /* ---------- 编辑模式外壳（复用 dash-module 样式） ---------- */
  function wrapSection(sec, inner) {
    if (editMode) {
      return `<div class="dash-module editing" data-sec="${sec.key}">
        <div class="dash-handle" title="按住拖动排序">≡</div>
        <div class="dash-actions">
          <button class="act-edit" data-act="renameSec" title="改名"><svg class="ico"><use href="#i-edit"/></svg></button>
          <button class="act-del" data-act="delSec" title="删除此模块"><svg class="ico"><use href="#i-trash"/></svg></button>
          <button class="act-hide" data-act="hideSec" title="隐藏"><svg class="ico"><use href="#i-close"/></svg></button>
        </div>
        <div class="dash-mobile-move">
          <button data-act="moveUpSec" aria-label="上移">▲</button>
          <button data-act="moveDownSec" aria-label="下移">▼</button>
        </div>
        ${inner}
      </div>`;
    }
    return `<div class="dash-module" data-sec="${sec.key}">${inner}</div>`;
  }

  function renderHiddenPanel(hidden) {
    // hidden 既可能是 key 字符串数组，也可能是模块对象数组，统一成 key
    const keys = hidden.map(k => (k && typeof k === 'object') ? k.key : k).filter(Boolean);
    if (!keys.length) {
      return `<div class="dash-hidden-panel empty">
        <h4>已隐藏的模块</h4>
        <p class="muted" style="font-size:12px;margin:0">没有隐藏的模块</p>
      </div>`;
    }
    return `<div class="dash-hidden-panel">
      <h4>已隐藏的模块（${keys.length}）</h4>
      <p class="muted" style="font-size:12px;margin:0 0 8px">点「显示」即可加回页面</p>
      ${keys.map(k => `<div class="dash-hidden-row" data-sec="${U.esc(k)}">
        <span class="pdot" style="background:var(--pink-300)"></span>
        <span style="flex:1">${U.esc(sectionName(k))}</span>
        <button class="btn btn-sm btn-primary" data-act="showSec">显示</button>
      </div>`).join('')}
    </div>`;
  }

  /* ---------- 导出：图片（PNG）/ CSV ---------- */
  function csvCell(v) {
    v = (v === undefined || v === null) ? '' : String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  async function exportPNG() {
    const target = U.$('#finGrid') || U.$('#view');
    U.toast('正在生成图片…');
    try {
      if (typeof html2canvas === 'function') {
        const canvas = await html2canvas(target, { backgroundColor: '#fff7fa', scale: 2, useCORS: true, logging: false });
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `逸云阁财务_${U.today()}.png`;
        a.click();
        U.toast('已导出图片', 'ok');
      } else {
        U.toast('图片组件未加载，请刷新后重试', 'warn');
      }
    } catch (e) {
      U.toast('导出图片失败：' + (e && e.message ? e.message : e), 'warn');
    }
  }
  function exportCSV() {
    try {
      const cur = group(DB.statIn(from, to, { includeScheduled }).lessons, dim);
      const head = { student: '学员', grade: '年级', subject: '学科', teacher: '老师' }[dim];
      const histTotal = DB.data.students.reduce((a, s) => a + histVal(s), 0);
      const header = [head, '课时', '总时长(h)', '家长流水', '历史收入', '老师课酬', '我的抽成', '抽成率'];
      const rows = cur.map(g => [g.label, g.count, (g.minutes / 60).toFixed(1), g.gross, g.hist, g.gross - g.profit, g.profit, g.gross ? Math.round(g.profit / g.gross * 100) : 0]);
      const st = DB.statIn(from, to, { includeScheduled });
      rows.push(['合计', st.count, (st.minutes / 60).toFixed(1), st.gross, histTotal, st.cost, st.profit, st.gross ? Math.round(st.profit / st.gross * 100) : 0]);
      const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `逸云阁财务_${U.cnDate(from)}_${U.cnDate(to)}_${dim}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      U.toast('已导出 CSV', 'ok');
    } catch (e) {
      U.toast('导出 CSV 失败：' + (e && e.message ? e.message : e), 'warn');
    }
  }

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'finance') return;

    const st = DB.statIn(from, to, { includeScheduled });
    const ls = st.lessons;
    const byStu = group(ls, 'student');
    const byGrade = group(ls, 'grade');
    const byTeacher = group(ls, 'teacher');
    const cur = group(ls, dim);
    const days = Math.max(1, U.daysDiff(from, to) + 1);

    const y = to.slice(0, 4);
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const mk = `${y}-${U.pad(i + 1)}`;
      const m = `${mk}-01`;
      const s = DB.statIn(m, U.monthLast(m), { includeScheduled });
      let hist = 0;
      DB.data.students.forEach(st => { hist += histMonth(st, mk); });
      return { label: (i + 1) + '月', value: s.profit + hist, hl: mk === U.today().slice(0, 7) };
    });

    const span = U.daysDiff(from, to);
    const pFrom = U.addDays(from, -span - 1), pTo = U.addDays(from, -1);
    const prev = DB.statIn(pFrom, pTo, { includeScheduled });
    const delta = prev.profit ? Math.round((st.profit - prev.profit) / prev.profit * 100) : null;

    const lastEdit = Math.max(DB.data.meta.lastLessonEdit || 0, DB.data.meta.lastStudentEdit || 0);
    const ctx = { st, byStu, byGrade, byTeacher, cur, monthly, days, from, to, histTotal: DB.data.students.reduce((a, s) => a + histVal(s), 0) };

    const sections = getSections();
    const visible = sections.filter(s => s.visible);

    root.innerHTML = `
    <div class="edit-time"><svg class="ico"><use href="#i-bell"/></svg>数据更新于：${U.fmtTime(lastEdit)}</div>
    <div class="card" style="margin-bottom:16px">
      <div class="sch-toolbar" style="margin:0">
        <div class="seg">
          ${[['month', '本月'], ['lastMonth', '上月'], ['30d', '近30天'], ['year', '本年'], ['custom', '自定义']]
        .map(([k, n]) => `<div class="opt ${range === k ? 'on' : ''}" data-r="${k}">${n}</div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="date" class="input" id="f_from" value="${from}" style="width:150px;padding:6px 9px">
          <span class="muted">至</span>
          <input type="date" class="input" id="f_to" value="${to}" style="width:150px;padding:6px 9px">
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--ink-2);cursor:pointer">
            <input type="checkbox" id="f_inc" ${includeScheduled ? 'checked' : ''}> 含未上课程
          </label>
          <span style="display:flex;gap:8px;margin-left:auto">
            <button class="btn btn-ghost btn-sm" data-act="editHist">历史收入</button>
            <button class="btn btn-ghost btn-sm" data-act="exportPng">导出图片</button>
            <button class="btn ${editMode ? 'btn-primary' : 'btn-ghost'} btn-sm" data-act="toggleEdit">
              <svg class="ico"><use href="#${editMode ? 'i-check' : 'i-gear'}"/></svg>
              ${editMode ? '完成编辑' : '编辑模块'}
            </button>
          </span>
        </div>
      </div>
    </div>

    ${editMode ? renderHiddenPanel(sections.filter(s => !s.visible).map(s => s.key)) : ''}

    <div class="grid" id="finGrid" style="gap:16px">
      ${visible.map(s => wrapSection(s, renderSection(s, ctx))).join('')}
    </div>

    ${editMode ? `<div class="dash-edit-hint">
      <span>拖动左侧 <b>≡</b> 重新排序（手机端用上下按钮）</span>
      <span>点 <b>✎</b> 改标题，点 <b>×</b> 隐藏</span>
      <button class="btn btn-ghost btn-sm" data-act="addCustom" style="margin-left:8px">+ 添加自定义模块</button>
      <button class="btn btn-ghost btn-sm" data-act="resetLayout" style="margin-left:auto">恢复默认布局</button>
    </div>` : ''}`;

    root.querySelectorAll('[data-r]').forEach(o => o.onclick = () => {
      if (o.dataset.r === 'custom') { range = 'custom'; render(); return; }
      applyRange(o.dataset.r); render();
    });
    root.querySelectorAll('[data-d]').forEach(o => o.onclick = () => { dim = o.dataset.d; render(); });
    U.$('#f_from', root).onchange = e => { from = e.target.value; range = 'custom'; render(); };
    U.$('#f_to', root).onchange = e => { to = e.target.value; range = 'custom'; render(); };
    U.$('#f_inc', root).onchange = e => { includeScheduled = e.target.checked; render(); };

    /* 编辑模式：桌面端启用拖动排序（包一层 try，避免拖动初始化异常影响下面的事件绑定） */
    if (editMode && !U.isMobile()) {
      try {
        U.draggableSortable(root.querySelector('#finGrid'), '.dash-module', newOrder => {
          const all = getSections();
          const hidden = all.filter(s => !s.visible);
          const map = {}; all.forEach(s => map[s.key] = s);
          const newVisible = newOrder.map(k => map[k]).filter(Boolean);
          applySections([...newVisible, ...hidden]);
          render();
        });
      } catch (e) { console.warn('财务拖动排序初始化失败', e); }
    }

    /* 事件绑定（务必最后执行，且上面的渲染细节即使抛错也不能让它失效） */
    U.rebind(root, 'fin', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      switch (b.dataset.act) {
        case 'exportPng': exportPNG(); break;
        case 'exportCsv': exportCSV(); break;
        case 'toggleEdit': editMode = !editMode; render(); break;

        case 'editHist': {
          const sts = DB.data.students.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
          // 默认月份：当前月之前的连续 3 个月；并补入数据中已存在的月份，按时间升序
          let months = [];
          for (let k = 1; k <= 3; k++) { const d = U.addMonths(U.monthFirst(U.today()), -k); months.unshift(`${d.slice(0, 4)}-${U.pad(+d.slice(5, 7))}`); }
          const present = new Set();
          sts.forEach(s => { if (s.histIncome && typeof s.histIncome === 'object') Object.keys(s.histIncome).forEach(m => present.add(m)); });
          present.forEach(m => { if (!months.includes(m)) months.push(m); });
          months.sort();
          const vals = {};
          sts.forEach(s => { vals[s.id] = {}; if (s.histIncome && typeof s.histIncome === 'object') Object.keys(s.histIncome).forEach(m => { vals[s.id][m] = String(s.histIncome[m]); }); });
          const monthLabel = mk => (+mk.slice(5, 7)) + '月';
          const gridHTML = () => `<div id="histGrid" style="overflow:auto;max-height:62vh">
            <table class="tbl" style="min-width:max-content;font-size:12.5px">
              <thead><tr><th>学员</th>${months.map(m => `<th style="white-space:nowrap;text-align:center">${monthLabel(m)}
                <button class="btn btn-icon btn-sm" data-delm="${m}" title="移除该月" style="padding:0 3px;margin-left:3px;vertical-align:middle"><svg class="ico" style="width:12px;height:12px"><use href="#i-close"/></svg></button></th>`).join('')}
                <th style="white-space:nowrap"><button class="btn btn-sm btn-primary" data-addm>+ 更早月份</button></th></tr></thead>
              <tbody>${sts.length ? sts.map(s => `<tr><td data-label="学员" style="white-space:nowrap;font-weight:600">${U.esc(s.parentName)}</td>
                ${months.map(m => `<td><input class="input" data-hid="${s.id}" data-m="${m}" type="number" min="0" step="0.01" style="width:104px" placeholder="0" value="${vals[s.id][m] != null ? vals[s.id][m] : ''}"></td>`).join('')}<td></td></tr>`).join('')
                : '<tr><td colspan="2" class="muted" style="text-align:center;padding:20px">还没有学员档案</td></tr>'}</tbody>
            </table></div>`;
          const ret = U.modal({
            title: '编辑历史收入（开始用本工作台之前，按月填写）',
            wide: true,
            okText: '保存',
            body: `<p class="muted" style="font-size:12px;margin:0 0 12px">按 <b>月份 × 学员</b> 填写使用本工作台之前的每月抽成（元）。每个月单独一列，月度走势图会把它们各自画成一根柱子；填 0 或留空 = 该月无收入。</p>${gridHTML()}`,
            onOk: b2 => {
              const collected = {};
              b2.querySelectorAll('input[data-hid]').forEach(inp => {
                const id = inp.dataset.hid, m = inp.dataset.m, v = +inp.value || 0;
                if (!collected[id]) collected[id] = {};
                if (v) collected[id][m] = v;
              });
              sts.forEach(s => { s.histIncome = collected[s.id] || {}; });
              DB.save(); render();
              U.toast('已保存历史收入', 'ok');
            }
          });
          const grid = ret.body.querySelector('#histGrid');
          if (grid) grid.addEventListener('click', e => {
            const add = e.target.closest('[data-addm]'), del = e.target.closest('[data-delm]');
            if (!add && !del) return;
            grid.querySelectorAll('input[data-hid]').forEach(inp => { if (!vals[inp.dataset.hid]) vals[inp.dataset.hid] = {}; vals[inp.dataset.hid][inp.dataset.m] = inp.value; });
            if (add) {
              const earliest = months.length ? months[0] : `${U.today().slice(0, 4)}-01`;
              const d = U.addMonths(earliest + '-01', -1);
              const nm = `${d.slice(0, 4)}-${U.pad(+d.slice(5, 7))}`;
              if (!months.includes(nm)) { months.unshift(nm); grid.innerHTML = gridHTML(); }
            } else if (del) {
              const m = del.dataset.delm;
              months = months.filter(x => x !== m);
              grid.innerHTML = gridHTML();
            }
          });
          break;
        }

        case 'addCustom': {
          const types = [['overview', '区间总览（抽成/流水/课酬/课时）'], ['teacher', '按老师课时排行'], ['grade', '按年级抽成'], ['student', '按学员抽成'], ['month', '按月抽成走势']];
          U.modal({
            title: '添加自定义统计块',
            body: `<div class="form-row"><label>标题</label><input class="input" id="custTitle" placeholder="例如：暑期班抽成"></div>
              <div class="form-row"><label>统计类型</label><select class="input" id="custType">${types.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></div>
              <p class="muted" style="font-size:12px">自定义块会出现在板块末尾，可随时改名、隐藏或删除。导出图片/CSV 时一并包含。</p>`,
            okText: '添加',
            onOk: () => {
              const title = (U.$('#custTitle').value || '').trim() || '自定义统计块';
              const type = U.$('#custType').value;
              // 追加到原始配置数组，保留已有的 deleted 等标记，避免覆盖后「复活」已删除模块
              const raw = (DB.data.settings.financeSections || []).slice();
              raw.push({ key: 'custom_' + U.uid('c'), name: title, visible: true, custom: true, type });
              DB.data.settings.financeSections = raw; DB.save(); render();
              U.toast('已添加自定义模块', 'ok');
            }
          });
          setTimeout(() => { const i = U.$('#custTitle'); if (i) { i.focus(); } }, 60);
          break;
        }

        case 'renameSec': {
          const key = b.closest('.dash-module').dataset.sec;
          const secs = getSections();
          const sec = secs.find(s => s.key === key);
          const oldName = sec.name;
          const defName = DB.defaultFinanceSections().find(d => d.key === key);
          const placeholder = defName ? defName.name : '';
          U.modal({
            title: '修改模块标题',
            body: `<div class="form-row"><label>新标题</label><input class="input" id="secTitleInput" value="${U.esc(oldName)}" placeholder="${U.esc(placeholder)}">
              <p class="muted" style="font-size:12px;margin-top:6px">留空 = 恢复默认标题</p></div>`,
            okText: '保存',
            onOk: () => {
              const v = (U.$('#secTitleInput') || {}).value || '';
              const def = defName ? defName.name : '';
              sec.name = (!v.trim() || v.trim() === def) ? def : v.trim();
              applySections(secs);
              render();
              U.toast('已更新', 'ok');
            }
          });
          setTimeout(() => { const i = U.$('#secTitleInput'); if (i) { i.focus(); i.select(); } }, 60);
          break;
        }
        case 'hideSec': {
          const key = b.closest('.dash-module').dataset.sec;
          const secs = getSections();
          const sec = secs.find(s => s.key === key);
          sec.visible = false;
          applySections(secs);
          render();
          U.toast('已隐藏，可到上方「已隐藏的模块」恢复', 'ok');
          break;
        }
        case 'delSec': {
          const key = b.closest('.dash-module').dataset.sec;
          const isCustom = getSections().find(s => s.key === key && s.custom);
          U.confirm(isCustom ? '删除这个自定义统计块？此操作不可恢复。' : '删除这个统计模块？删除后不再显示（点「恢复默认布局」可找回内置模块）。', () => {
            const raw = (DB.data.settings.financeSections || []).slice();
            const ex = raw.find(s => s.key === key);
            if (ex) { ex.deleted = true; ex.visible = false; }
            else raw.push({ key, deleted: true, visible: false });
            DB.data.settings.financeSections = raw; DB.save(); render();
            U.toast('已删除模块');
          }, '删除');
          break;
        }
        case 'showSec': {
          const key = b.closest('.dash-hidden-row').dataset.sec;
          const secs = getSections();
          const sec = secs.find(s => s.key === key);
          sec.visible = true;
          applySections(secs);
          render();
          break;
        }
        case 'moveUpSec':
        case 'moveDownSec': {
          const key = b.closest('.dash-module').dataset.sec;
          const all = getSections();
          const vis = all.filter(s => s.visible);
          const idx = vis.findIndex(s => s.key === key);
          const swap = b.dataset.act === 'moveUpSec' ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= vis.length) break;
          [vis[idx], vis[swap]] = [vis[swap], vis[idx]];
          const hidden = all.filter(s => !s.visible);
          applySections([...vis, ...hidden]);
          render();
          break;
        }
        case 'resetLayout': {
          U.confirm('恢复默认的模块布局（显示全部、恢复原名、重置顺序、移除自定义块）？', () => {
            DB.data.settings.financeSections = DB.defaultFinanceSections();
            DB.save();
            render();
            U.toast('已恢复默认布局');
          }, '恢复');
          break;
        }
      }
    });
  }

  Views.finance = {
    title: '财务统计',
    sub: '中间人视角：家长流水 / 老师课酬 / 我的抽成三本账分开算',
    render() { editMode = false; applyRange('month'); render(); }
  };

  return { render, group, PALETTE, getSections };
})();
