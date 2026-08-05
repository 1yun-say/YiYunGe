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
  let curDate = U.today();
  let filter = -1;
  let tplSelMode = false;          // 每日模板库「批量删除」选择模式
  const tplSel = new Set();        // 已选中的模板 id 集合

  /* --- 数据迁移：旧版 done 布尔值 → 三态 status --- */
  function migrate() {
    DB.data.todos.forEach(t => {
      if (t.status === 'pending' || t.status === 'done' || t.status === 'blocked') return;
      t.status = t.done ? 'done' : 'pending';
      if (!t.doneAt && t.status === 'done') t.doneAt = Date.now();
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
      time: '', status: 'pending', doneAt: null, createdAt: Date.now()
    }, t));
    DB.save();
  }

  function importTemplates(ids) {
    let n = 0;
    DB.data.templates.forEach(tpl => {
      if (ids && !ids.includes(tpl.id)) return;
      if (DB.data.todos.some(t => t.date === curDate && t.tplId === tpl.id)) return; // 当天已导入
      add({ title: tpl.title, priority: tpl.priority, tag: tpl.tag, tplId: tpl.id, date: curDate });
      n++;
    });
    U.toast(n ? `已导入 ${n} 条模板任务` : '今天已经导入过了', n ? 'ok' : 'warn');
    render();
  }

  /* --- 渲染 --- */
  function computeOverdue() {
    const today = U.today();
    return DB.data.todos.filter(t => {
      if (t.status === 'done') return false;
      const r = U.recurRuleOf(t.repeat, t.date);
      if (r && r.type !== 'never') return false;   // 重复任务不进遗留
      return t.date < today;
    });
  }
  function buildSegHTML(isM, undone) {
    if (isM) return '';
    return `<div class="seg" style="margin-bottom:12px">
            <div class="opt ${filter < 0 ? 'on' : ''}" data-f="-1">全部</div>
            ${P.map(p => `<div class="opt ${filter === p.v ? 'on' : ''}" data-f="${p.v}">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.name}
              <b style="margin-left:4px;color:inherit;opacity:.6">${undone.filter(t => t.priority === p.v).length}</b></div>`).join('')}
          </div>`;
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
      <button class="btn btn-icon" data-act="useTpl" title="导入这条"><svg class="ico"><use href="#i-plus"/></svg></button>
      <button class="btn btn-icon" data-act="editTpl" title="编辑"><svg class="ico"><use href="#i-edit"/></svg></button>
      <button class="btn btn-icon" data-act="delTpl" title="删除"><svg class="ico"><use href="#i-trash"/></svg></button>
    </div>`;
  }

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
            ${DB.data.templates.length ? DB.data.templates.map(tpl => tplChipHTML(tpl, tplSelMode, tplSel.has(tpl.id))).join('') : `<p class="muted" style="font-size:12px">还没有模板，点右上角 + 添加</p>`}
          </div>
          ${tplSelMode ? tplBatchBarHTML() : ''}
        </div>

        <div class="card">
          <div class="card-h"><h3>四象限说明</h3></div>
          ${P.map(p => `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
            <span class="pdot" style="width:9px;height:9px;border-radius:50%;background:${p.color};margin-top:6px;flex:none"></span>
            <div><b style="font-size:12.5px">${p.name}</b>
              <div class="muted" style="font-size:11px">${p.short}</div></div>
          </div>`).join('')}
          <div class="divider"></div>
        </div>
      </div>`;
  }
  function buildMobileTplHTML(isM) {
    if (!isM) return '';
    return `      <div class="card">
        <div class="card-h"><h3>每日模板库</h3>
          <button class="btn btn-icon ${tplSelMode ? 'on' : ''}" data-act="tplBatch" title="${tplSelMode ? '退出批量删除' : '批量删除'}"><svg class="ico"><use href="#i-check"/></svg></button>
          <button class="btn btn-icon" data-act="addTpl" title="新增模板"><svg class="ico"><use href="#i-plus"/></svg></button>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px">
          ${DB.data.templates.length ? DB.data.templates.map(tpl => tplChipHTML(tpl, tplSelMode, tplSel.has(tpl.id))).join('') : `<p class="muted" style="font-size:12px">还没有模板，点右上角 + 添加</p>`}
        </div>
        ${tplSelMode ? tplBatchBarHTML() : ''}
        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:11px" data-act="importAll">一键导入全部到今天</button>
      </div>`;
  }

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'todo') return;
    const list = ofDate(curDate);
    const sortFn = (a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0)   // 旗标置顶
      || a.priority - b.priority
      || (a.time || '99:59').localeCompare(b.time || '99:59')
      || a.createdAt - b.createdAt;
    const undone = list.filter(t => t.status !== 'done').sort(sortFn);
    const done = list.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const shown = filter < 0 ? undone : undone.filter(t => t.priority === filter);
    const overdue = computeOverdue();
    const isM = U.isMobile();
    const segHTML = buildSegHTML(isM, undone);
    const rightColHTML = buildRightColHTML(isM);

    const mobileTplHTML = buildMobileTplHTML(isM);

    root.innerHTML = `
    <div class="grid todo-view" style="grid-template-columns:minmax(0,1fr) 320px">
      <div style="display:flex;flex-direction:column;gap:16px">

        ${overdue.length ? `<div class="card" style="border-color:#ffd0d0;background:#fff8f8">
          <div class="card-h"><h3 style="color:#cf5252">遗留未完成 ${overdue.length} 条</h3>
            <button class="btn btn-sm btn-ghost" data-act="pullOverdue">全部拉到今天</button></div>
          <div class="todo-list">${overdue.slice(0, 5).map(t => rowHTML(t, true)).join('')}</div>
        </div>` : ''}

        <div class="card">
          <div class="card-h">
            <h3>${curDate === U.today() ? '今日提醒事项' : U.cnDate(curDate) + ' 提醒事项'}
              <span class="tag">${undone.length} 提醒 / ${done.length} 完成</span></h3>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="btn btn-icon" data-act="prevDay" title="前一天">&#8249;</button>
              <input type="date" class="input" style="width:150px;padding:5px 8px" id="tdDate" value="${curDate}">
              <button class="btn btn-icon" data-act="nextDay" title="后一天">&#8250;</button>
            </div>
          </div>

          ${isM ? '' : `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <input class="input" id="quickTitle" style="flex:1;min-width:140px" placeholder="输入任务后回车，例如：给王妈妈发本周课表">
            <input type="time" class="input" id="quickTime" style="width:120px" title="可选的具体时间，如 19:00">
            <select class="input" id="quickP" style="width:132px">
              ${P.map(p => `<option value="${p.v}" ${p.v === 1 ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            <button class="btn btn-primary" data-act="quickAdd">添加</button>
          </div>`}

          ${segHTML}

          <div class="todo-list">
            ${shown.length ? shown.map(t => rowHTML(t)).join('')
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

  function rowHTML(t, showDate) {
    const p = pInfo(t.priority);
    const st = sInfo(t.status);
    const stu = t.studentId ? DB.student(t.studentId) : null;
    // 重复任务在「当前展示日」被勾掉时（写进 completedDates 而非改 status），也要显示为已勾选态
    const doneOnCur = (t.repeat && t.repeat !== 'never')
      ? (Array.isArray(t.completedDates) && t.completedDates.includes(curDate))
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
    return `<div class="todo-item ${doneOnCur ? 'done' : ''} ${blockedOnCur ? 'blocked' : ''}" data-p="${t.priority}" data-id="${t.id}">
      <div class="chk chk-${chkCls}" data-act="toggle" title="${doneOnCur ? '已完成' : (blockedOnCur ? '今日无法完成' : '未完成')}" style="color:#fff;border-color:${chkColor};${doneOnCur || blockedOnCur ? 'background:' + chkColor : ''}">${chkIcon}</div>
      <div class="t-body">
        <div class="t-title">
          ${t.time ? `<span class="t-time">${U.esc(t.time)}</span>` : ''}${U.esc(t.title)}
        </div>
        ${t.note ? `<div class="muted" style="font-size:11.5px;margin-top:2px">${U.esc(t.note)}</div>` : ''}
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
        <button class="btn btn-icon" data-act="edit" title="编辑"><svg class="ico"><use href="#i-edit"/></svg></button>
        <button class="btn btn-icon" data-act="del" title="删除"><svg class="ico"><use href="#i-trash"/></svg></button>
      </div>
    </div>`;
  }

  function bind(root) {
    U.$('#tdDate', root).onchange = e => { curDate = e.target.value; render(); };
    root.querySelectorAll('.seg .opt').forEach(o => o.onclick = () => { filter = +o.dataset.f; render(); });

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
        case 'quickAdd': doQuickAdd(root); break;
        case 'toggle': {
          const rule = U.recurRuleOf(t.repeat, t.date);
          // 仅「真正重复」的任务(type!=='never' 且当前展示日确为发生日)才走「按日期单独勾选」分支；
          // 非重复任务(never)必须改 status，否则在到期日当天点击时只写 completedDates、
          // 而渲染/未读数都按 status 判定，导致对勾不显示、未读数不减。
          if (rule.type !== 'never' && U.recurOccursOn(curDate, rule)) {
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
        case 'del': DB.removeRecord('todos', tid); DB.save(); render(); App.refreshBadge(); break;
        case 'pullOverdue':
          // 仅把「非重复」的过期未完成任务拉到今天；重复任务以 repeat 为锚点，
          // 改 date 会悄悄偏移发生日，故跳过（重复任务本就会在今天发生）。
          DB.data.todos.forEach(x => {
            if (x.status === 'done') return;
            const r = U.recurRuleOf(x.repeat, x.date);
            if (r && r.type !== 'never') return;
            if (x.date < U.today()) x.date = U.today();
          });
          DB.save(); curDate = U.today(); render(); U.toast('已全部拉到今天');
          break;
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
      }
    });

    const quickTitle = U.$('#quickTitle', root);
    if (quickTitle) quickTitle.addEventListener('keydown', e => { if (e.key === 'Enter') doQuickAdd(root); });
  }

  function doQuickAdd(root) {
    const i = U.$('#quickTitle', root);
    if (!i) return;
    const v = i.value.trim(); if (!v) return;
    const tIn = U.$('#quickTime', root);
    const time = tIn ? (tIn.value || '') : '';
    add({ title: v, priority: +U.$('#quickP', root).value, date: curDate, time });
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
    U.modal({
      title: isNew ? '新增每日模板' : '编辑模板',
      body: `<div class="field"><label>模板内容</label>
          <input class="input" id="f_t" value="${U.esc(tpl.title)}" placeholder="例如：给今天上课的家长发提醒"></div>
        <div class="row">
          <div class="field"><label>默认优先级</label><select class="input" id="f_p">
            ${P.map(p => `<option value="${p.v}" ${p.v === tpl.priority ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
          <div class="field"><label>标签</label><input class="input" id="f_g" value="${U.esc(tpl.tag)}" placeholder="日常 / 家长沟通 / 财务"></div>
        </div>
        <p class="muted" style="font-size:11.5px">模板不会自己产生任务，需要你在提醒事项页点「一键导入」，避免堆积。</p>`,
      onOk: b => {
        const title = U.$('#f_t', b).value.trim();
        if (!title) { U.toast('请填写模板内容', 'warn'); return false; }
        const o = { title, priority: +U.$('#f_p', b).value, tag: U.$('#f_g', b).value.trim() };
        if (isNew) DB.data.templates.push(Object.assign({ id: U.uid('tpl') }, o));
        else Object.assign(tpl, o);
        DB.save();
        if (after) after(); else render();
      }
    });
  }

  Views.todo = {
    title: '提醒事项',
    sub: '模板化管理每日重复提醒，别再手打第二遍',
    render(root) { curDate = U.today(); filter = -1; render(); }
  };

  return { checkAuto, pendingCount, P, pInfo, STATUS, sInfo, cycle, add, addNew, ofDate, render, editTodo, importTemplates, editTpl };
})();
