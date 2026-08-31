/* ===== 提醒事项（原「待办」） ===== */
window.Views = window.Views || {};

const Todo = (() => {
  const P = [
    { v: 0, name: '紧急重要', short: '立刻做', color: '#ef6f6f' },
    { v: 1, name: '重要不紧急', short: '计划做', color: '#f2b544' },
    { v: 2, name: '紧急不重要', short: '快速做', color: '#8fb8f0' },
    { v: 3, name: '不紧急不重要', short: '有空做', color: '#a8899a' }
  ];
  const pInfo = v => P[v] || P[3];
  const STATUS = {
    pending: { name: '未完成', color: 'var(--pink-500)', next: 'done' },
    done:    { name: '已完成', color: 'var(--leaf)',      next: 'blocked' },
    blocked: { name: '今日无法完成', color: '#a8899a',    next: 'pending' }
  };
  const sInfo = s => STATUS[s] || STATUS.pending;
  const cycle = s => STATUS[s]?.next || 'done';
  /* 行内输入「标题｜备注」语法：拆出标题与备注（支持半角/全角竖线，取首个分隔符） */
  function splitTitleNote(raw) {
    const v = (raw || '').trim();
    if (!v) return { title: '', note: '' };
    const m = v.split(/[|｜]/);
    return { title: m[0].trim(), note: m.length > 1 ? m.slice(1).join('|').trim() : '' };
  }
  let curDate = U.today();
  let lastUndone = [];             // 当前渲染的未完成列表，用于上下排序
  let lastTemplates = [];          // 当前渲染的模板顺序，用于模板上下排序
  let tplSelMode = false;          // 每日模板库「批量删除」选择模式
  const tplSel = new Set();        // 已选中的模板 id 集合

  /* --- 数据迁移：旧版 done 布尔值 → 三态 status；补齐 order 字段用于手动排序 --- */
  function migrate() {
    DB.data.todos.forEach(t => {
      if (t.status === 'pending' || t.status === 'done' || t.status === 'blocked') return;
      t.status = t.done ? 'done' : 'pending';
      if (!t.doneAt && t.status === 'done') t.doneAt = Date.now();
    });
    DB.data.todos.forEach((t, idx) => {
      if (typeof t.order === 'number') return;
      t.order = (t.createdAt || Date.now()) + idx;
    });
    (DB.data.templates || []).forEach((tpl, idx) => {
      if (typeof tpl.order === 'number') return;
      tpl.order = idx;
    });
  }

  /* --- 自动任务：试课回访 --- */
  function checkAuto() {
    migrate();
    const t = U.today();
    let added = 0;
    DB.data.students.forEach(s => {
      if (s.status !== 'trial' || !s.trialDate) return;
      const due = U.addDays(s.trialDate, 1);
      if (t < due) return;                          // 还没到回访日
      const key = `trial:${s.id}:${s.trialDate}`;
      if (DB.data.todos.some(x => x.autoKey === key)) return;
      DB.data.todos.push({
        id: U.uid('td'), title: `回访${s.parentName}试课体验（${s.grade}${s.subject}）`,
        note: '确认孩子和老师是否匹配、是否愿意转正式课；不合适则立即换老师。',
        priority: 0, tag: '试课跟进', date: due > t ? due : t, status: 'pending', doneAt: null,
        autoKey: key, studentId: s.id, createdAt: Date.now()
      });
      added++;
    });
    if (added) { DB.save(); U.toast(`自动生成 ${added} 条试课回访提醒`); }
    return added;
  }

  /* 某条待办在某天是否出现（含重复展开 + 单次完成裁剪） */
  function occursOnDate(t, d) {
    const rule = U.recurRuleOf(t.repeat, t.date);
    if (!U.recurOccursOn(d, rule)) return false;
    if (Array.isArray(t.completedDates) && t.completedDates.includes(d)) return false;
    return true;
  }
  const ofDate = d => DB.data.todos.filter(t => occursOnDate(t, d));
  const pendingCount = () => {
    const t = U.today();
    return DB.data.todos.filter(x => occursOnDate(x, t) && x.status !== 'done').length;
  };

  function add(t) {
    DB.data.todos.push(Object.assign({
      id: U.uid('td'), title: '', note: '', priority: 1, tag: '', date: curDate,
      time: '', status: 'pending', doneAt: null, createdAt: Date.now(), order: Date.now()
    }, t));
    DB.save();
  }

  function importTemplates(ids) {
    let n = 0;
    const base = Date.now();
    sortTemplates().forEach((tpl, i) => {
      if (ids && !ids.includes(tpl.id)) return;
      if (tpl.repeat && tpl.repeat !== 'never') return;   // 已设重复规则的模板会自动生成，不再手动导入
      if (DB.data.todos.some(t => t.date === curDate && t.tplId === tpl.id)) return; // 当天已导入
      add({ title: tpl.title, priority: tpl.priority, tag: tpl.tag, tplId: tpl.id, date: curDate, order: base + i });
      n++;
    });
    U.toast(n ? `已导入 ${n} 条模板任务` : '今天已经导入过了', n ? 'ok' : 'warn');
    render();
  }

  /* 某条待办在某天是否已被标记为完成（重复任务按 completedDates 判定，普通任务按 status） */
  function isDoneOnDay(t, d) {
    const r = U.recurRuleOf(t.repeat, t.date);
    if (r.type !== 'never') return Array.isArray(t.completedDates) && t.completedDates.includes(d);
    return t.status === 'done';
  }

  /* 移动端：按可见的若干天，把「设置了重复规则的模板」幂等展开成具体待办实例。
   * 每天只生成一次（tplId+date 去重），不重复堆积。 */
  function ensureTemplateInstances(days) {
    let changed = false;
    // 先清理：被「跳过某天」的模板实例（含跨端同步过来的 skip），确保删除某天模板实例在本机/他端都彻底消失
    if (Array.isArray(DB.data.skippedTemplateDays) && DB.data.skippedTemplateDays.length) {
      const before = DB.data.todos.length;
      DB.data.todos = DB.data.todos.filter(t => {
        if (!t || !t.tplId) return true;
        return !DB.data.skippedTemplateDays.some(s => s.tplId === t.tplId && s.date === t.date);
      });
      if (DB.data.todos.length !== before) changed = true;
    }
    (DB.data.templates || []).forEach(tpl => {
      if (!tpl.repeat || tpl.repeat === 'never') return;
      const start = tpl.startDate || U.today();
      const rule = U.recurRuleOf(tpl.repeat, start);
      if (rule.type === 'never') return;
      days.forEach(d => {
        if (!U.recurOccursOn(d, rule)) return;
        if (DB.data.skippedTemplateDays && DB.data.skippedTemplateDays.some(s => s.tplId === tpl.id && s.date === d)) return; // 用户删除过的某天不再生成
        if (DB.data.todos.some(t => t.tplId === tpl.id && t.date === d)) return;
        DB.data.todos.push({
          id: U.uid('td'), title: tpl.title, note: '', priority: (tpl.priority == null ? 1 : tpl.priority),
          tag: tpl.tag || '', date: d, time: '', status: 'pending', doneAt: null,
          tplId: tpl.id, createdAt: Date.now(), order: Date.now()
        });
        changed = true;
      });
    });
    if (changed) DB.save();
  }

  /* 移动端：在指定日期的行内输入框回车，生成一条待办（备忘录式，无弹窗） */
  function quickAddDay(d, value) {
    const { title, note } = splitTitleNote(value);
    if (!title) return;
    add({ title, note, priority: 1, date: d, status: 'pending' });
    render(); App.refreshBadge();
  }

  /* --- 渲染 --- */
  function computeOverdue() {
    const today = U.today();
    return DB.data.todos.filter(t => {
      if (t.status !== 'pending') return false;     // 仅待处理才算遗留；blocked/done 不再显示
      const r = U.recurRuleOf(t.repeat, t.date);
      if (r && r.type !== 'never') return false;    // 重复任务不进遗留
      return t.date < today;
    });
  }
  /* 每日模板库：单条模板 chip（支持批量删除选择模式） */
  function tplChipHTML(tpl, selMode, selected) {
    const color = pInfo(tpl.priority).color;
    if (selMode) {
      return `<div class="tpl-chip sel" data-tpl="${tpl.id}" data-act="tplToggle" role="button" tabindex="0">
        <span class="tpl-check ${selected ? 'on' : ''}">${selected ? '✓' : ''}</span>
        <span class="pdot" style="background:${color}"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.esc(tpl.title)}</div>
          ${tpl.tag ? `<span class="tag gray" style="margin-top:3px">${U.esc(tpl.tag)}</span>` : ''}
        </div>
      </div>`;
    }
    return `<div class="tpl-chip" data-tpl="${tpl.id}">
      <span class="pdot" style="background:${color}"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.esc(tpl.title)}</div>
        ${tpl.tag ? `<span class="tag gray" style="margin-top:3px">${U.esc(tpl.tag)}</span>` : ''}
      </div>
      <button class="btn btn-icon" data-act="tplUp" title="上移">↑</button>
      <button class="btn btn-icon" data-act="tplDown" title="下移">↓</button>
      <button class="btn btn-icon" data-act="useTpl" title="导入这条"><svg class="ico"><use href="#i-plus"/></svg></button>
      <button class="btn btn-icon" data-act="editTpl" title="编辑"><svg class="ico"><use href="#i-edit"/></svg></button>
      <button class="btn btn-icon" data-act="delTpl" title="删除"><svg class="ico"><use href="#i-trash"/></svg></button>
    </div>`;
  }

  const sortTemplates = () => {
    const arr = (DB.data.templates || []).slice();
    arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    return arr;
  };

  /* 每日模板库：批量删除操作条 */
  function tplBatchBarHTML() {
    const total = DB.data.templates.length;
    const n = tplSel.size;
    return `<div class="tpl-batch-bar">
      <button class="btn btn-sm btn-ghost" data-act="tplSelAll">${n === total && total ? '取消全选' : '全选'}</button>
      <span class="tpl-sel-count">已选 ${n} 项</span>
      <button class="btn btn-sm btn-danger" data-act="tplDelSel" ${n ? '' : 'disabled'}>删除选中</button>
      <button class="btn btn-sm btn-ghost" data-act="tplSelCancel">退出</button>
    </div>`;
  }

  function buildRightColHTML(isM) {
    if (isM) return '';
    lastTemplates = sortTemplates();
    return `<div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div class="card-h"><h3>每日模板库</h3>
            <button class="btn btn-icon ${tplSelMode ? 'on' : ''}" data-act="tplBatch" title="${tplSelMode ? '退出批量删除' : '批量删除'}"><svg class="ico"><use href="#i-check"/></svg></button>
            <button class="btn btn-icon" data-act="addTpl" title="新增模板"><svg class="ico"><use href="#i-plus"/></svg></button>
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:11px" data-act="importAll">
            一键导入全部到${curDate === U.today() ? '今天' : U.cnDate(curDate)}
          </button>
          <div style="display:flex;flex-direction:column;gap:7px">
            ${lastTemplates.length ? lastTemplates.map(tpl => tplChipHTML(tpl, tplSelMode, tplSel.has(tpl.id))).join('') : `<p class="muted" style="font-size:12px">还没有模板，点右上角 + 添加</p>`}
          </div>
          ${tplSelMode ? tplBatchBarHTML() : ''}
        </div>
      </div>`;
  }
  function buildMobileTplHTML(isM) {
    if (!isM) return '';
    lastTemplates = sortTemplates();
    return `      <div class="card">
        <div class="card-h"><h3>每日模板库</h3>
          <button class="btn btn-icon ${tplSelMode ? 'on' : ''}" data-act="tplBatch" title="${tplSelMode ? '退出批量删除' : '批量删除'}"><svg class="ico"><use href="#i-check"/></svg></button>
          <button class="btn btn-icon" data-act="addTpl" title="新增模板"><svg class="ico"><use href="#i-plus"/></svg></button>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px">
          ${lastTemplates.length ? lastTemplates.map(tpl => tplChipHTML(tpl, tplSelMode, tplSel.has(tpl.id))).join('') : `<p class="muted" style="font-size:12px">还没有模板，点右上角 + 添加</p>`}
        </div>
        ${tplSelMode ? tplBatchBarHTML() : ''}
        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:11px" data-act="importAll">一键导入全部模板</button>
      </div>`;
  }

  function render() {
    if (U.isMobile()) { renderMobile(); return; }
    const root = U.$('#view');
    if (!root || App.route !== 'todo') return;
    const list = ofDate(curDate);
    const sortFn = (a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0)   // 旗标置顶
      || (a.order || 0) - (b.order || 0)                           // 手动排序
      || (a.time || '99:59').localeCompare(b.time || '99:59')
      || a.createdAt - b.createdAt;
    const undone = list.filter(t => t.status !== 'done').sort(sortFn);
    const done = list.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    lastUndone = undone;                                           // 给上下排序用
    const overdue = computeOverdue();
    const isM = U.isMobile();
    const isToday = curDate === U.today();
    const rightColHTML = buildRightColHTML(isM);

    const mobileTplHTML = buildMobileTplHTML(isM);

    root.innerHTML = `
    <div class="grid todo-view" style="grid-template-columns:minmax(0,1fr) 320px">
      <div style="display:flex;flex-direction:column;gap:16px">

        ${isToday && overdue.length ? `<div class="card" style="border-color:#ffd0d0;background:#fff8f8">
          <div class="card-h"><h3 style="color:#cf5252">遗留未完成 ${overdue.length} 条</h3>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm btn-ghost" data-act="ignoreOverdue">忽略全部</button>
              <button class="btn btn-sm btn-ghost" data-act="pullOverdue">全部拉到今天</button>
            </div></div>
          <div class="todo-list">${overdue.map(t => overdueRowHTML(t)).join('')}</div>
        </div>` : ''}

        <div class="card">
          <div class="card-h">
            <h3>${isToday ? '今日提醒事项' : U.cnDate(curDate) + ' 提醒事项'}</h3>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="btn btn-icon" data-act="prevDay" title="前一天">&#8249;</button>
              <input type="date" class="input" style="width:150px;padding:5px 8px" id="tdDate" value="${curDate}">
              <button class="btn btn-icon" data-act="nextDay" title="后一天">&#8250;</button>
            </div>
          </div>

          ${isM ? '' : `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <input class="input" id="quickTitle" style="flex:1;min-width:140px" placeholder="输入任务后回车，例如：给王妈妈发本周课表（标题｜备注 可带备注）">
            <input type="time" class="input" id="quickTime" style="width:120px" title="可选的具体时间，如 19:00">
            <select class="input" id="quickP" style="width:132px">
              ${P.map(p => `<option value="${p.v}" ${p.v === 1 ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            <button class="btn btn-primary" data-act="quickAdd">添加</button>
          </div>`}

          <div class="todo-list">
            ${undone.length ? undone.map(t => rowHTML(t)).join('')
        : `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><use href="#i-flower"/></svg>
                 <p>${isM ? '这一天很清爽，点右下角 + 新建一件吧' : '这一天很清爽，从右侧模板一键导入日常提醒吧'}</p></div>`}
          </div>

          ${done.length ? `<div class="divider"></div>
            <div class="archive-head" data-act="toggleArch">
              <span class="caret">&#9656;</span> 已完成提醒（${done.length}）
            </div>
            <div class="todo-list" id="archBox" style="display:none">${done.map(t => rowHTML(t)).join('')}</div>` : ''}
        </div>
      </div>

      ${mobileTplHTML}

      ${rightColHTML}
    </div>`;

    bind(root);
  }

  function rowHTML(t, viewDate, showDate) {
    viewDate = viewDate || curDate;
    const p = pInfo(t.priority);
    const st = sInfo(t.status);
    const stu = t.studentId ? DB.student(t.studentId) : null;
    // 重复任务在「当前展示日」被勾掉时（写进 completedDates 而非改 status），也要显示为已勾选态
    const doneOnCur = (t.repeat && t.repeat !== 'never')
      ? (Array.isArray(t.completedDates) && t.completedDates.includes(viewDate))
      : (t.status === 'done');
    const blockedOnCur = (t.repeat && t.repeat !== 'never')
      ? false
      : (t.status === 'blocked');
    const chkIcon = doneOnCur
      ? '<svg viewBox="0 0 24 24" class="ico"><path d="M5 12.5 10 17 19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : blockedOnCur
        ? '<svg viewBox="0 0 24 24" class="ico"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'
        : '';
    const chkCls = doneOnCur ? 'done' : (blockedOnCur ? 'blocked' : 'pending');
    // 重复任务勾掉（写进 completedDates）的完成态用绿色语义，而非「未完成」粉色。
    const chkColor = doneOnCur ? 'var(--leaf, #38a169)' : st.color;
    return `<div class="todo-item ${doneOnCur ? 'done' : ''} ${blockedOnCur ? 'blocked' : ''}" data-p="${t.priority}" data-id="${t.id}" data-view="${viewDate}">
      <div class="chk chk-${chkCls}" data-act="toggle" title="${doneOnCur ? '已完成' : (blockedOnCur ? '今日无法完成' : '未完成')}" style="color:#fff;border-color:${chkColor};${doneOnCur || blockedOnCur ? 'background:' + chkColor : ''}">${chkIcon}</div>
      <div class="t-body">
        <div class="t-title">
          ${t.time ? `<span class="t-time">${U.esc(t.time)}</span>` : ''}${U.esc(t.title)}${t.note ? `<span class="t-note"> ${U.esc(t.note)}</span>` : ''}
        </div>
        <div class="t-meta">
          <span class="tag" style="background:${p.color}1f;color:${p.color}">${p.name}</span>
          ${t.status !== 'pending' ? `<span class="tag" style="background:${st.color}1f;color:${st.color}">${st.name}</span>` : ''}
          ${t.tag ? `<span class="tag gray">${U.esc(t.tag)}</span>` : ''}
          ${t.flag ? `<span class="tag" style="background:#ffd9d9;color:#cf5252">🚩 标记</span>` : ''}
          ${t.autoKey ? `<span class="tag gold">自动生成</span>` : ''}
          ${stu ? `<span class="tag sky">${U.esc(DB.studentLabel(stu))}</span>` : ''}
          ${(() => { const r = U.recurRuleOf(t.repeat, t.date); const d = U.recurDescribe(r); return d && d !== '不重复' ? `<span class="tag" style="background:#e8f1ff;color:#3a6ea5">🔁 ${U.esc(d)}</span>` : ''; })()}
          ${showDate ? `<span class="tag alert">${U.cnDate(t.date)}</span>` : ''}
          ${t.status === 'done' && t.doneAt ? `<span class="muted" style="font-size:11px">完成于 ${new Date(t.doneAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
        </div>
      </div>
      <div class="t-actions">
        <button class="btn btn-icon" data-act="up" title="上移">↑</button>
        <button class="btn btn-icon" data-act="down" title="下移">↓</button>
        <button class="btn btn-icon" data-act="edit" title="编辑"><svg class="ico"><use href="#i-edit"/></svg></button>
        <button class="btn btn-icon" data-act="del" title="删除"><svg class="ico"><use href="#i-trash"/></svg></button>
      </div>
    </div>`;
  }

  /* 遗留卡片专用行：每条可单独「拉到今天 / 忽略 / 删除」，不再强制批量拉到今天 */
  function overdueRowHTML(t) {
    const p = pInfo(t.priority);
    const stu = t.studentId ? DB.student(t.studentId) : null;
    return `<div class="todo-item overdue" data-id="${t.id}">
      <div class="t-body">
        <div class="t-title">${U.esc(t.title)}${t.note ? `<span class="t-note"> ${U.esc(t.note)}</span>` : ''}</div>
        <div class="t-meta">
          <span class="tag" style="background:${p.color}1f;color:${p.color}">${p.name}</span>
          ${t.tag ? `<span class="tag gray">${U.esc(t.tag)}</span>` : ''}
          ${stu ? `<span class="tag sky">${U.esc(DB.studentLabel(stu))}</span>` : ''}
          <span class="tag alert">${U.cnDate(t.date)}</span>
        </div>
      </div>
      <div class="t-actions">
        <button class="btn btn-sm btn-ghost" data-act="pullOne" title="拉到今天">拉到今天</button>
        <button class="btn btn-sm btn-ghost" data-act="ignoreOne" title="忽略">忽略</button>
        <button class="btn btn-icon" data-act="del" title="删除"><svg class="ico"><use href="#i-trash"/></svg></button>
      </div>
    </div>`;
  }

  /* 移动端（≤820px）：以 curDate 为起点展示连续 7 天，每天一个分组；行内回车新增；支持跳到任意一天 */
  function renderMobile() {
    const root = U.$('#view');
    if (!root || App.route !== 'todo') return;
    const today = U.today();
    const isToday = curDate === today;
    const days = Array.from({ length: 7 }, (_, i) => U.addDays(curDate, i));
    ensureTemplateInstances(days);                 // 把可见 7 天里符合规则的模板自动展开成待办
    const overdue = isToday ? computeOverdue() : [];

    const groupsHTML = days.map(d => {
      const isDayToday = d === today;
      const dayTodos = DB.data.todos.filter(t => {
        if (occursOnDate(t, d)) return true;
        // 已完成（含重复任务当天被勾掉）也显示在该日下，便于回看
        if (t.repeat && t.repeat !== 'never' && Array.isArray(t.completedDates) && t.completedDates.includes(d)) return true;
        return false;
      });
      const sortFn = (a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0)
        || (a.order || 0) - (b.order || 0)
        || (a.time || '99:59').localeCompare(b.time || '99:59')
        || a.createdAt - b.createdAt;
      const undone = dayTodos.filter(t => !isDoneOnDay(t, d)).sort(sortFn);
      const done = dayTodos.filter(t => isDoneOnDay(t, d)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
      const itemsHTML = (undone.length || done.length)
        ? undone.map(t => rowHTML(t, d, false)).join('') + done.map(t => rowHTML(t, d, false)).join('')
        : `<div class="empty sm"><p>暂无事项，下面输入即可添加</p></div>`;
      const header = `${U.cnDate(d)} <span class="wd">${U.wdName(d)}</span>${isDayToday ? '<span class="tag today-pill">今天</span>' : ''}`;
      return `<section class="day-group${isDayToday ? ' today' : ''}">
        <div class="day-h">${header}</div>
        <div class="todo-list">${itemsHTML}</div>
        <input class="input day-quick" data-date="${d}" placeholder="添加事项，回车确认（标题｜备注）">
      </section>`;
    }).join('');

    root.innerHTML = `
    <div class="todo-mobile">
      <div class="todo-mbar">
        <h3>${isToday ? '今日提醒事项' : U.cnDate(curDate) + ' 起'}</h3>
        <div class="todo-mbar-actions">
          <button class="btn btn-icon" data-act="prevDay" title="前一天">&#8249;</button>
          <input type="date" class="input" id="tdDate" value="${curDate}">
          <button class="btn btn-icon" data-act="nextDay" title="后一天">&#8250;</button>
          ${isToday ? '' : '<button class="btn btn-sm btn-ghost" data-act="backToday">回到今天</button>'}
        </div>
      </div>

      ${overdue.length ? `<div class="card" style="border-color:#ffd0d0;background:#fff8f8">
        <div class="card-h"><h3 style="color:#cf5252">遗留未完成 ${overdue.length} 条</h3>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-ghost" data-act="ignoreOverdue">忽略全部</button>
            <button class="btn btn-sm btn-ghost" data-act="pullOverdue">全部拉到今天</button>
          </div></div>
        <div class="todo-list">${overdue.map(t => overdueRowHTML(t)).join('')}</div>
      </div>` : ''}

      ${groupsHTML}
      ${buildMobileTplHTML(true)}
    </div>`;

    bind(root);   // 复用桌面端绑定（含 #tdDate、所有 data-act 的 switch）
    // 行内回车新增：备忘录式，不弹窗
    root.querySelectorAll('.day-quick').forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const d = inp.dataset.date, val = inp.value;
        if (!val.trim()) return;
        quickAddDay(d, val);
        setTimeout(() => { const n = U.$('.day-quick[data-date="' + d + '"]', root); if (n) n.focus(); }, 30);
      });
    });
  }

  function bind(root) {
    U.$('#tdDate', root).onchange = e => { curDate = e.target.value; render(); };

    U.rebind(root, 'todo', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const act = btn.dataset.act;
      const item = btn.closest('.todo-item');
      const tid = item && item.dataset.id;
      const t = tid && DB.data.todos.find(x => x.id === tid);
      const tplEl = btn.closest('[data-tpl]');
      const tpl = tplEl && DB.data.templates.find(x => x.id === tplEl.dataset.tpl);

      switch (act) {
        case 'prevDay': curDate = U.addDays(curDate, -1); render(); break;
        case 'nextDay': curDate = U.addDays(curDate, 1); render(); break;
        case 'backToday': curDate = U.today(); render(); break;
        case 'quickAdd': doQuickAdd(root); break;
        case 'toggle': {
          const vd = item && item.dataset.view ? item.dataset.view : curDate; // 当前事项所属视图日期（移动端为所在天）
          const rule = U.recurRuleOf(t.repeat, t.date);
          // 仅「真正重复」的任务(type!=='never' 且当前展示日确为发生日)才走「按日期单独勾选」分支；
          // 非重复任务(never)必须改 status，否则在到期日当天点击时只写 completedDates、
          // 而渲染/未读数都按 status 判定，导致对勾不显示、未读数不减。
          if (rule.type !== 'never' && U.recurOccursOn(vd, rule)) {
            // 重复任务：按当前展示日单独勾选完成
            t.completedDates = Array.isArray(t.completedDates) ? t.completedDates : [];
            const i = t.completedDates.indexOf(curDate);
            if (i >= 0) { t.completedDates.splice(i, 1); t.doneAt = null; U.toast('已恢复为未完成'); }
            else { t.completedDates.push(curDate); t.doneAt = Date.now(); U.toast('完成一件，很好'); }
          } else {
            t.status = cycle(t.status);
            t.doneAt = t.status === 'done' ? Date.now() : (t.status === 'pending' ? null : t.doneAt);
            if (t.status === 'done') U.toast('完成一件，很好');
          }
          DB.save(); render(); App.refreshBadge();
          break;
        }
        case 'edit': editTodo(t); break;
        case 'del': {
          if (t && t.tplId) {
            // 实例本身不携带 repeat 字段，需回查所属模板是否带重复规则，才能正确识别「重复模板实例」
            const tplDef = DB.data.templates.find(x => x.id === t.tplId);
            const tplRepeat = tplDef && tplDef.repeat;
            const isRecurringTpl = !!(tplRepeat && tplRepeat !== 'never');
            if (isRecurringTpl) {
              // 重复模板自动生成的实例：删除=仅跳过这一天，不影响其他天（记到模板排除日，避免下次渲染重生）
              DB.data.skippedTemplateDays = Array.isArray(DB.data.skippedTemplateDays) ? DB.data.skippedTemplateDays : [];
              if (!DB.data.skippedTemplateDays.some(s => s.tplId === t.tplId && s.date === t.date)) {
                DB.data.skippedTemplateDays.push({ tplId: t.tplId, date: t.date });
              }
              DB.removeRecord('todos', tid);
              DB.save(); render(); App.refreshBadge(); U.toast('已删除该天，不影响其他天');
              break;
            }
          }
          DB.removeRecord('todos', tid); DB.save(); render(); App.refreshBadge();
          break;
        }
        case 'up':
        case 'down': {
          const ids = lastUndone.map(x => x.id);
          const idx = ids.indexOf(tid);
          if (idx < 0) break;
          const swap = act === 'up' ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= ids.length) break;
          [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
          ids.forEach((id, i) => {
            const x = DB.data.todos.find(z => z.id === id);
            if (x) x.order = (i + 1) * 1000;
          });
          DB.save(); render(); App.refreshBadge();
          break;
        }
        case 'pullOne': {
          // 单条遗留：「拉到今天」——保留原任务（标为今日无法完成），克隆一条新的到今天
          if (!t || t.status !== 'pending') break;
          const r = U.recurRuleOf(t.repeat, t.date);
          if (r && r.type !== 'never') break;          // 重复任务以 repeat 为锚点，不拉
          const today = U.today();
          if (t.date >= today) break;
          // 克隆新任务到今天
          const clone = Object.assign({}, t, {
            id: U.uid('td'),
            date: today,
            status: 'pending',
            order: Date.now(),
            createdAt: Date.now(),
            doneAt: null,
            completedDates: []
          });
          t.status = 'blocked';                         // 原任务保留在原日期，标记为已处理
          DB.data.todos.push(clone);
          DB.save(); render(); App.refreshBadge(); U.toast('已拉到今天');
          break;
        }
        case 'ignoreOne':
          // 单条遗留：「忽略」——标记为今日无法完成，不再出现于遗留卡片
          if (t && t.status !== 'done') { t.status = 'blocked'; DB.save(); render(); App.refreshBadge(); U.toast('已标记今日无法完成'); }
          break;
        case 'pullOverdue': {
          // 批量拉到今天：保留原任务（标 blocked），为每条非重复遗留克隆一条今天的新任务
          const today = U.today();
          let n = 0;
          DB.data.todos.forEach(x => {
            if (x.status !== 'pending') return;
            const r = U.recurRuleOf(x.repeat, x.date);
            if (r && r.type !== 'never') return;
            if (x.date >= today) return;
            DB.data.todos.push(Object.assign({}, x, {
              id: U.uid('td'),
              date: today,
              status: 'pending',
              order: Date.now() + n,
              createdAt: Date.now(),
              doneAt: null,
              completedDates: []
            }));
            x.status = 'blocked';
            n++;
          });
          DB.save(); curDate = today; render(); U.toast(`已拉 ${n} 条到今天`);
          break;
        }
        case 'ignoreOverdue': {
          // 一键忽略全部遗留：批量标记为今日无法完成（带确认，防止误点）
          const before = computeOverdue().length;
          if (!before) break;
          U.confirm(`忽略全部 ${before} 条遗留未完成？它们会被标记为今日无法完成`, () => {
            DB.data.todos.forEach(x => {
              if (x.status !== 'pending') return;
              const r = U.recurRuleOf(x.repeat, x.date);
              if (r && r.type !== 'never') return;
              if (x.date < U.today()) x.status = 'blocked';
            });
            DB.save(); render(); App.refreshBadge(); U.toast(`已标记 ${before} 条今日无法完成`, 'ok');
          }, '忽略');
          break;
        }
        case 'toggleArch': {
          const box = U.$('#archBox', root); const open = box.style.display === 'none';
          box.style.display = open ? 'flex' : 'none'; btn.classList.toggle('open', open); break;
        }
        case 'importAll': importTemplates(); break;
        case 'useTpl': importTemplates([tpl.id]); break;
        case 'editTpl': editTpl(tpl); break;
        case 'delTpl':
          U.confirm(`删除模板「${tpl.title}」？`, () => {
            DB.removeRecord('templates', tpl.id); DB.save(); render();
          }, '删除');
          break;
        case 'addTpl': editTpl(null); break;
        /* ---- 每日模板库：批量删除 ---- */
        case 'tplBatch': tplSelMode = !tplSelMode; if (!tplSelMode) tplSel.clear(); render(); break;
        case 'tplToggle': {
          const id = btn.closest('[data-tpl]').dataset.tpl;
          if (tplSel.has(id)) tplSel.delete(id); else tplSel.add(id);
          render(); break;
        }
        case 'tplSelAll': {
          if (tplSel.size === DB.data.templates.length) tplSel.clear();
          else DB.data.templates.forEach(t => tplSel.add(t.id));
          render(); break;
        }
        case 'tplSelCancel': tplSelMode = false; tplSel.clear(); render(); break;
        case 'tplDelSel': {
          const ids = [...tplSel];
          if (!ids.length) break;
          U.confirm(`确定删除选中的 ${ids.length} 个模板？删除会跨端同步到其他设备`, () => {
            ids.forEach(id => DB.removeRecord('templates', id));
            DB.save();
            tplSel.clear(); tplSelMode = false;
            render();
            U.toast(`已删除 ${ids.length} 个模板`, 'ok');
          }, '删除');
          break;
        }
        case 'tplUp':
        case 'tplDown': {
          const ids = lastTemplates.map(x => x.id);
          const idx = ids.indexOf(tpl.id);
          if (idx < 0) break;
          const swap = act === 'tplUp' ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= ids.length) break;
          [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
          ids.forEach((id, i) => {
            const x = DB.data.templates.find(z => z.id === id);
            if (x) x.order = (i + 1) * 1000;
          });
          DB.save(); render();
          break;
        }
      }
    });

    const quickTitle = U.$('#quickTitle', root);
    if (quickTitle) quickTitle.addEventListener('keydown', e => { if (e.key === 'Enter') doQuickAdd(root); });
  }

  function doQuickAdd(root) {
    const i = U.$('#quickTitle', root);
    if (!i) return;
    const { title, note } = splitTitleNote(i.value);
    if (!title) return;
    const tIn = U.$('#quickTime', root);
    const time = tIn ? (tIn.value || '') : '';
    add({ title, note, priority: +U.$('#quickP', root).value, date: curDate, time });
    i.value = ''; if (tIn) tIn.value = ''; render(); App.refreshBadge();
    setTimeout(() => { const el = U.$('#quickTitle'); if (el) el.focus(); }, 30);
  }

  function editTodo(t, after) {
    const st = sInfo(t.status);
    const flagOn = t.flag ? 'on' : '';
    const mm = U.modal({
      title: '编辑任务',
      body: `<div class="field"><label>任务内容</label><input class="input" id="f_t" value="${U.esc(t.title)}"></div>
        <div class="field"><label>备注</label><textarea class="input" id="f_n">${U.esc(t.note || '')}</textarea></div>
        <div class="row">
          <div class="field"><label>状态</label><select class="input" id="f_s">
            <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>未完成</option>
            <option value="done" ${t.status === 'done' ? 'selected' : ''}>已完成</option>
            <option value="blocked" ${t.status === 'blocked' ? 'selected' : ''}>今日无法完成</option></select></div>
          <div class="field"><label>优先级</label><select class="input" id="f_p">
            ${P.map(p => `<option value="${p.v}" ${p.v === t.priority ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
          <div class="field"><label>时间（可选）</label><input type="time" class="input" id="f_m" value="${t.time || ''}"></div>
          <div class="field"><label>标签</label><input class="input" id="f_g" value="${U.esc(t.tag || '')}" placeholder="如 家长沟通"></div>
        </div>
        ${U.buildRepeatControl(t.repeat && typeof t.repeat === 'string' ? t.repeat : (t.repeat && t.repeat.type === 'custom' ? 'custom' : (t.repeat && t.repeat.type) || 'never'))}
        <div class="field" style="display:flex;align-items:center;justify-content:space-between">
          <label>标记（旗标，置顶高亮）</label>
          <div class="switch ${flagOn}" id="f_flag_sw"></div>
          <input type="checkbox" id="f_flag" ${t.flag ? 'checked' : ''} style="display:none">
        </div>
        <div class="field"><label>日期</label><input type="date" class="input" id="f_d" value="${t.date}"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="btnToggleDone">${t.status === 'done' ? '标记为未完成' : '标记为完成'}</button>
        </div>`,
      onOk: b => {
        t.title = U.$('#f_t', b).value.trim() || t.title;
        t.note = U.$('#f_n', b).value.trim();
        t.status = U.$('#f_s', b).value;
        t.doneAt = t.status === 'done' ? (t.doneAt || Date.now()) : (t.status === 'pending' ? null : t.doneAt);
        t.priority = +U.$('#f_p', b).value;
        t.time = U.$('#f_m', b).value || '';
        t.tag = U.$('#f_g', b).value.trim();
        t.repeat = U.readRepeatControl(b);
        t.flag = U.$('#f_flag', b).checked;
        t.date = U.$('#f_d', b).value || t.date;
        DB.save();
        if (after) after(); else { render(); App.refreshBadge(); }
      }
    });
    U.wireRepeatControl(mm.body, (typeof t.repeat === 'string' || (t.repeat && t.repeat.type === 'custom'))
      ? t.repeat : (t.repeat && t.repeat.type) || 'never');
    const flagSw = U.$('#f_flag_sw', mm.body);
    flagSw.onclick = () => {
      const cb = U.$('#f_flag', mm.body);
      cb.checked = !cb.checked;
      flagSw.classList.toggle('on', cb.checked);
    };
    mm.body.addEventListener('click', e => {
      if (e.target.id === 'btnToggleDone') {
        t.status = t.status === 'done' ? 'pending' : 'done';
        t.doneAt = t.status === 'done' ? Date.now() : null; DB.save();
        if (after) after(); else { render(); App.refreshBadge(); }
        U.toast(t.status === 'done' ? '已标记完成' : '已恢复为未完成');
        e.target.closest('.mask').remove();
      }
    });
  }

  function addNew() {
    const mm = U.modal({
      title: '新建提醒事项',
      body: `<div class="field"><label>任务内容</label><input class="input" id="f_t" placeholder="例如：给王妈妈发本周课表" autofocus></div>
        <div class="row">
          <div class="field"><label>时间（可选）</label><input type="time" class="input" id="f_m"></div>
          <div class="field"><label>优先级</label><select class="input" id="f_p">
            ${P.map(p => `<option value="${p.v}" ${p.v === 1 ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
        </div>
        ${U.buildRepeatControl('never')}
        <div class="field" style="display:flex;align-items:center;justify-content:space-between">
          <label>标记（旗标，置顶高亮）</label>
          <div class="switch" id="f_flag_sw"></div>
          <input type="checkbox" id="f_flag" style="display:none">
        </div>`,
      onOk: b => {
        const title = U.$('#f_t', b).value.trim();
        if (!title) { U.toast('请填写内容', 'warn'); return false; }
        add({
          title, time: U.$('#f_m', b).value || '', date: curDate, status: 'pending',
          priority: +U.$('#f_p', b).value, repeat: U.readRepeatControl(b), flag: U.$('#f_flag', b).checked
        });
        render(); App.refreshBadge();
      }
    });
    U.wireRepeatControl(mm.body, 'never');
    const flagSw = U.$('#f_flag_sw', mm.body);
    flagSw.onclick = () => {
      const cb = U.$('#f_flag', mm.body);
      cb.checked = !cb.checked; flagSw.classList.toggle('on', cb.checked);
    };
  }

  function editTpl(tpl, after) {
    const isNew = !tpl;
    tpl = tpl || { title: '', priority: 1, tag: '' };
    const mm = U.modal({
      title: isNew ? '新增每日模板' : '编辑模板',
      body: `<div class="field"><label>模板内容</label>
          <input class="input" id="f_t" value="${U.esc(tpl.title)}" placeholder="例如：给今天上课的家长发提醒"></div>
        <div class="row">
          <div class="field"><label>默认优先级</label><select class="input" id="f_p">
            ${P.map(p => `<option value="${p.v}" ${p.v === tpl.priority ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
          <div class="field"><label>标签</label><input class="input" id="f_g" value="${U.esc(tpl.tag)}" placeholder="日常 / 家长沟通 / 财务"></div>
        </div>
        ${U.buildRepeatControl(tpl.repeat && typeof tpl.repeat === 'string' ? tpl.repeat : (tpl.repeat && tpl.repeat.type === 'custom' ? 'custom' : (tpl.repeat && tpl.repeat.type) || 'never'))}
        <div class="field"><label>开始日期（可选，留空＝从今天起生效）</label><input type="date" class="input" id="f_from" value="${tpl.startDate || ''}"></div>
        <p class="muted" style="font-size:11.5px">设了重复规则（每天 / 区间 / 周几）的模板会在匹配的日子自动出现待办，无需手动导入；没设规则的模板仍用「一键导入全部」手动添加。</p>`,
      onOk: b => {
        const title = U.$('#f_t', b).value.trim();
        if (!title) { U.toast('请填写模板内容', 'warn'); return false; }
        const o = {
          title, priority: +U.$('#f_p', b).value, tag: U.$('#f_g', b).value.trim(),
          repeat: U.readRepeatControl(b), startDate: U.$('#f_from', b).value || ''
        };
        if (isNew) {
          const maxOrder = (DB.data.templates || []).reduce((m, x) => Math.max(m, x.order || 0), -1);
          DB.data.templates.push(Object.assign({ id: U.uid('tpl'), order: maxOrder + 1 }, o));
        } else Object.assign(tpl, o);
        DB.save();
        if (after) after(); else render();
      }
    });
    U.wireRepeatControl(mm.body, (typeof tpl.repeat === 'string' || (tpl.repeat && tpl.repeat.type === 'custom'))
      ? tpl.repeat : (tpl.repeat && tpl.repeat.type) || 'never');
  }

  Views.todo = {
    title: '提醒事项',
    sub: '模板化管理每日重复提醒，别再手打第二遍',
    render(root) { curDate = U.today(); render(); }
  };

  return { checkAuto, pendingCount, P, pInfo, STATUS, sInfo, cycle, add, addNew, ofDate, render, editTodo, importTemplates, editTpl };
})();
