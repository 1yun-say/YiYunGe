/* ===== 主页（仪表盘）=====
   每个模块独立函数 + 整体 layout 调度
   支持：拖动排序 / 编辑标题 / 隐藏恢复
*/
window.Views = window.Views || {};

const Dashboard = (() => {
  let editMode = false;
  let modState = {};   // 本次 render 周期内的临时状态

  /* ---------- 工具：模块 title 解析 ---------- */
  function defaultTitle(key) {
    const m = DB.DASH_MODULES.find(x => x.key === key);
    return m ? m.name : key;
  }
  function resolveTitle(key) {
    const custom = (DB.data.settings.dashboardLayout.customTitle || {})[key];
    return (custom || '').trim() || defaultTitle(key);
  }
  function getLayout() {
    const L = DB.data.settings.dashboardLayout;
    // 容错：补齐缺失的 key
    const allKeys = DB.DASH_MODULES.map(m => m.key);
    const order = Array.from(new Set([...(L.order || []), ...allKeys])).filter(k => allKeys.includes(k));
    return { order, hidden: L.hidden || [], customTitle: L.customTitle || {} };
  }
  function saveLayout(patch) {
    Object.assign(DB.data.settings.dashboardLayout, patch);
    DB.save();
  }

  /* ---------- 问候 / 标签栏 ---------- */
  function greet() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  /* ============================================================
     8 个独立模块：每个都是 (ctx) => string
     ctx = { t, todayLessons, undone, mStat, mDone, wStat, byGrade, months, trials, overdue, conflictDays, pub }
     ============================================================ */

  function moduleGreet(ctx) {
    return `
    <div class="card dash-greet" style="margin-bottom:16px;background:linear-gradient(120deg,#fff,#fff4f8);border-color:var(--pink-200)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <h2 style="font-size:19px">${greet()}，今天有 <span style="color:var(--pink-600)">${ctx.todayLessons.length}</span> 节课、
            <span style="color:var(--pink-600)">${ctx.undone.length}</span> 件待办</h2>
          <p class="muted" style="font-size:12.5px;margin-top:3px">
            ${U.parse(ctx.t).getFullYear()} 年 ${+ctx.t.slice(5, 7)} 月 ${+ctx.t.slice(8)} 日 ${U.wdName(ctx.t)}
            ${ctx.todayLessons.length ? ` · 第一节 ${ctx.todayLessons[0].start} 开始` : ' · 今天没有排课'}</p>
        </div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" data-go="todo">去处理待办</button>
          <button class="btn btn-ghost btn-sm" data-go="schedule">看本周课表</button>
          <button class="btn btn-primary btn-sm" data-act="book">快速排课</button>
        </div>
      </div>
      ${(ctx.conflictDays.length || ctx.trials.length || ctx.overdue.length) ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        ${ctx.conflictDays.length ? `<span class="tag alert">本周 ${ctx.conflictDays.length} 天存在时间重叠，注意确认</span>` : ''}
        ${ctx.trials.length ? `<span class="tag gold">${ctx.trials.length} 位学员试课中，次日自动生成回访任务</span>` : ''}
        ${ctx.overdue.length ? `<span class="tag sky">${ctx.overdue.length} 条待办从前几天遗留下来</span>` : ''}
      </div>` : ''}
    </div>`;
  }

  function moduleKpi(ctx) {
    return `
    <div class="grid g4 dash-kpi" style="margin-bottom:16px">
      <div class="stat"><div class="lab">今日课程</div><div class="val">${ctx.todayLessons.length}</div>
        <div class="sub">共 ${ctx.todayLessons.reduce((s, l) => s + l.duration, 0)} 分钟</div></div>
      <div class="stat"><div class="lab">今日待办</div><div class="val">${ctx.undone.length}</div>
        <div class="sub">已完成 ${ctx.todosAll.length - ctx.undone.length} 件</div></div>
      <div class="stat hl secret"><div class="lab">本月实际到手（${ctx.inc ? '含未上课' : '已上课'}）</div><div class="val">${U.money(ctx.mStat.profit)}</div>
        <div class="sub">已落袋 ${U.money(ctx.mDone.profit)}</div></div>
      <div class="stat ${ctx.pub ? 'hl' : ''}"><div class="lab">本月课时 / 流水</div><div class="val">${ctx.mStat.count}</div>
        <div class="sub">${U.money(ctx.mStat.gross)}</div></div>
    </div>`;
  }

  function moduleTodayLessons(ctx) {
    return `
        <div class="card">
          <div class="card-h">
            <h3 data-title="todayLessons">${U.esc(resolveTitle('todayLessons'))}</h3>
            <span class="sub">点击查看 / 修改</span>
          </div>
          ${ctx.todayLessons.length ? ctx.todayLessons.map(l => {
      const s = DB.student(l.studentId) || { parentName: '?' };
      const sub = DB.lessonSub(l);
      const c = U.subColor(sub.subject);
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      const passed = U.t2m(l.start) + l.duration < now;
      return `<div class="todo-item plain" data-lid="${l.id}" style="cursor:pointer;${passed ? 'opacity:.6' : ''}">
              <div style="width:4px;align-self:stretch;border-radius:4px;background:${c};flex:none"></div>
              <div style="width:52px;text-align:center;flex:none">
                <b style="font-size:14px">${l.start}</b>
                <div class="muted" style="font-size:10px">${l.duration}分</div></div>
              <div class="t-body">
                <div class="t-title"><b>${U.esc(sub.grade)}${U.esc(sub.subject)}</b> · ${U.esc(s.parentName)}</div>
                <div class="t-meta">
                  <span class="tag gray">${U.esc(DB.teacherName(l.teacherId))}</span>
                  <span class="tag">${U.money(l.tuition)}</span>
                  <span class="tag secret" style="background:#ffe9f1;color:#e85686">到手 ${U.money(DB.lessonBreakdown(l).takeHome)}</span>
                  ${l.status === 'done' ? '<span class="tag leaf">已完成</span>' : ''}
                </div>
              </div>
              ${l.status !== 'done' ? `<button class="btn btn-sm btn-ghost" data-act="finish">标记完成</button>` : ''}
            </div>`;
    }).join('') : `<div class="empty" style="padding:26px"><p>今天没有课，可以专心拓客</p></div>`}
        </div>`;
  }

  function moduleTodayTodo(ctx) {
    const isM = U.isMobile();
    const show = isM ? 4 : 6;
    return `
        <div class="card">
          <div class="card-h">
            <h3 data-title="todayTodo">${U.esc(resolveTitle('todayTodo'))}</h3>
            <button class="btn btn-sm btn-ghost" data-act="importTpl">导入模板</button>
          </div>
          <div class="todo-list">
            ${ctx.undone.length ? ctx.undone.slice(0, show).map(x => {
      const p = Todo.pInfo(x.priority);
      const st = Todo.sInfo(x.status);
      const chkIcon = x.status === 'done'
        ? '<svg viewBox="0 0 24 24" class="ico"><path d="M5 12.5 10 17 19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : x.status === 'blocked'
          ? '<svg viewBox="0 0 24 24" class="ico"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'
          : '';
      return `<div class="todo-item ${x.status==='done'?'done':''} ${x.status==='blocked'?'blocked':''}" data-p="${x.priority}" data-tid="${x.id}">
                <div class="chk chk-${x.status}" data-act="toggleTodo" title="${st.name}" style="color:#fff;border-color:${st.color};${x.status !== 'pending' ? 'background:' + st.color : ''}">${chkIcon}</div>
                <div class="t-body"><div class="t-title">${U.esc(x.title)}</div>
                  <div class="t-meta"><span class="tag" style="background:${p.color}1f;color:${p.color}">${p.name}</span>
                  ${x.status !== 'pending' ? `<span class="tag" style="background:${st.color}1f;color:${st.color}">${st.name}</span>` : ''}
                  ${!isM && x.autoKey ? '<span class="tag gold">自动</span>' : ''}</div></div>
              </div>`;
    }).join('') : `<div class="empty" style="padding:22px"><p>今日待办已清空</p></div>`}
          </div>
          ${ctx.undone.length > show ? `<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:9px" data-go="todo">查看全部 ${ctx.undone.length} 条</button>` : ''}
        </div>`;
  }

  function moduleTrend(ctx) {
    return `
        <div class="card secret">
          <div class="card-h">
            <h3 data-title="trend">${U.esc(resolveTitle('trend'))}</h3>
            <span class="sub">本月 ${U.money(ctx.mStat.profit)}</span>
          </div>
          ${U.columns(ctx.months, { money: true })}
        </div>`;
  }

  function moduleGrade(ctx) {
    return `
        <div class="card secret">
          <div class="card-h">
            <h3 data-title="grade">${U.esc(resolveTitle('grade'))}</h3>
            <span class="sub">谁最赚钱</span>
          </div>
          ${ctx.byGrade.length ? ctx.byGrade.slice(0, 5).map((g, i) => `
            <div class="bar-row"><div class="bl">${U.esc(g.label)}</div>
              <div class="bt"><i style="width:${g.profit / (ctx.byGrade[0].profit || 1) * 100}%;background:${Finance.PALETTE[i % Finance.PALETTE.length]}"></i></div>
              <div class="bv">${U.money(g.profit)}</div></div>`).join('')
        : `<p class="muted" style="font-size:12px">本月还没有课程数据</p>`}
          <div class="divider"></div>
          <div style="display:flex;justify-content:space-between;font-size:12.5px">
            <span class="muted">本周 ${ctx.wStat.count} 节 · 流水 ${U.money(ctx.wStat.gross)}</span>
            <b class="money in">抽成 ${U.money(ctx.wStat.profit)}</b>
          </div>
        </div>`;
  }

  function modulePhrases(ctx) {
    return `
        <div class="card">
          <div class="card-h">
            <h3 data-title="phrases">${U.esc(resolveTitle('phrases'))}</h3>
            <button class="btn btn-sm btn-ghost" data-go="scripts">全部</button>
          </div>
          ${DB.data.phrases.slice().sort((a, b) => (b.hits || 0) - (a.hits || 0)).slice(0, 4).map(p => `
            <div class="tpl-chip" style="margin-bottom:7px" data-pid="${p.id}">
              <span class="pdot" style="background:${p.cat === 'parent' ? '#8fb8f0' : p.cat === 'teacher' ? '#7fc8a9' : '#f2b544'}"></span>
              <div style="flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.esc(p.title)}</div>
              <button class="btn btn-icon" data-act="copyPh" title="复制"><svg class="ico"><use href="#i-copy"/></svg></button>
            </div>`).join('')}
        </div>`;
  }

  function moduleTemplates(ctx) {
    return `
    <div class="card">
      <div class="card-h">
        <h3 data-title="templates">${U.esc(resolveTitle('templates'))}</h3>
        <button class="btn btn-icon" data-act="addTpl" title="新增模板"><svg class="ico"><use href="#i-plus"/></svg></button>
      </div>
      <p class="muted" style="font-size:12px;margin-bottom:10px">在主页即可直接编辑或删除模板，改动会同步到「待办」的模板库。</p>
      <button class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:11px" data-act="importAll">一键导入全部到今天</button>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${DB.data.templates.length ? DB.data.templates.map(tpl => `
          <div class="tpl-chip" data-tpl="${tpl.id}">
            <span class="pdot" style="background:${Todo.pInfo(tpl.priority).color}"></span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.esc(tpl.title)}</div>
              ${tpl.tag ? `<span class="tag gray" style="margin-top:3px">${U.esc(tpl.tag)}</span>` : ''}
            </div>
            <button class="btn btn-icon" data-act="useTpl" title="导入这条"><svg class="ico"><use href="#i-plus"/></svg></button>
            <button class="btn btn-icon" data-act="editTpl" title="编辑"><svg class="ico"><use href="#i-edit"/></svg></button>
            <button class="btn btn-icon" data-act="delTpl" title="删除"><svg class="ico"><use href="#i-trash"/></svg></button>
          </div>`).join('') : `<p class="muted" style="font-size:12px">还没有模板，点右上角 + 新增</p>`}
      </div>
    </div>`;
  }

  const MODULES = {
    greet:        { title: '今日问候',    render: moduleGreet,        layout: 'full' },
    kpi:          { title: '关键指标',    render: moduleKpi,          layout: 'full' },
    todayLessons: { title: '今日课程',    render: moduleTodayLessons, layout: 'col' },
    todayTodo:    { title: '今日待办',    render: moduleTodayTodo,    layout: 'col' },
    trend:        { title: '近半年抽成走势', render: moduleTrend,     layout: 'col' },
    grade:        { title: '本月年级贡献', render: moduleGrade,       layout: 'col' },
    phrases:      { title: '高频话术',    render: modulePhrases,      layout: 'col' },
    templates:    { title: '每日模板库',  render: moduleTemplates,    layout: 'col' }
  };

  /* ---------- 包装：单个模块外层 + 拖动 handle / 编辑按钮 / 移动端上下移 ---------- */
  function wrapModule(key, inner, full) {
    const cls = 'dash-module' + (full ? ' full' : '') + (editMode ? ' editing' : '');
    if (editMode) {
      return `<div class="${cls}" data-mod="${key}" data-key="${key}">
        <div class="dash-handle" title="按住拖动排序">≡</div>
        <div class="dash-actions">
          <button class="act-edit" data-act="editMod" title="编辑标题"><svg class="ico"><use href="#i-edit"/></svg></button>
          <button class="act-hide" data-act="hideMod" title="隐藏"><svg class="ico"><use href="#i-close"/></svg></button>
        </div>
        <div class="dash-mobile-move">
          <button data-act="moveUp" aria-label="上移">▲</button>
          <button data-act="moveDown" aria-label="下移">▼</button>
        </div>
        ${inner}
      </div>`;
    }
    return `<div class="${cls}" data-mod="${key}" data-key="${key}">${inner}</div>`;
  }

  /* ---------- 已隐藏模块恢复面板（仅编辑模式） ---------- */
  function renderHiddenPanel(hidden) {
    if (!hidden.length) {
      return `<div class="dash-hidden-panel empty">
        <h4>已隐藏的模块</h4>
        <p class="muted" style="font-size:12px;margin:0">没有隐藏的模块</p>
      </div>`;
    }
    return `<div class="dash-hidden-panel">
      <h4>已隐藏的模块（${hidden.length}）</h4>
      <p class="muted" style="font-size:12px;margin:0 0 8px">点「恢复」即可加回主页</p>
      ${hidden.map(k => `<div class="dash-hidden-row" data-mod="${k}">
        <span class="pdot" style="background:var(--pink-300)"></span>
        <span style="flex:1">${U.esc(defaultTitle(k))}</span>
        <button class="btn btn-sm btn-primary" data-act="restoreMod">恢复</button>
      </div>`).join('')}
    </div>`;
  }

  /* ---------- 手机端一屏精简仪表 ---------- */
  function renderMobile(ctx) {
    const { t, todayLessons, undone, mStat, mDone, inc } = ctx;
    const totalMin = todayLessons.reduce((s, l) => s + (+l.duration || 0), 0);
    const profit = inc ? mStat.profit : mDone.profit;
    const profitLabel = inc ? '含预计' : '已落袋';
    const qk = [
      { go: 'students', ic: 'i-user', name: '学员' },
      { go: 'teachers', ic: 'i-user', name: '老师' },
      { go: 'schedule', ic: 'i-cal', name: '课表' },
      { go: 'finance', ic: 'i-coin', name: '财务' }
    ];
    const lessonRow = l => {
      const s = DB.student(l.studentId) || { parentName: '?' };
      const sub = DB.lessonSub(l);
      const c = U.subColor(sub.subject);
      return `<div class="lesson-row" data-lid="${l.id}" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:5px 0;border-bottom:1px solid var(--line-2)">
        <div style="width:3px;align-self:stretch;border-radius:3px;background:${c};flex:none"></div>
        <div style="width:42px;text-align:center;flex:none">
          <b style="font-size:12px">${l.start}</b>
          <div class="muted" style="font-size:9px">${l.duration}分</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>${U.esc(sub.grade)}${U.esc(sub.subject)}</b> · ${U.esc(s.parentName)}</div>
          <div class="muted" style="font-size:10px">${U.esc(DB.teacherName(l.teacherId))} · ${U.money(l.tuition)}</div>
        </div>
        ${l.status !== 'done' ? `<button class="btn btn-sm btn-ghost" data-act="finish" style="min-height:30px;padding:0 8px;font-size:11px">完成</button>` : ''}
      </div>`;
    };
    const todoRow = x => {
      const p = Todo.pInfo(x.priority);
      return `<div class="todo-item" data-tid="${x.id}" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line-2);min-height:34px">
        <div class="chk" data-act="toggleTodo" style="width:18px;height:18px;border:2px solid ${p.color};border-radius:5px;flex:none;cursor:pointer;display:grid;place-items:center"></div>
        <div style="flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.esc(x.title)}</div>
        <span class="tag" style="font-size:9px;padding:1px 5px;background:${p.color}1f;color:${p.color};flex:none">${p.short}</span>
      </div>`;
    };
    return `
    <div class="dash-mobile">
      <div class="dash-mobile-toolbar">
        <div style="min-width:0">
          <h2 style="font-size:15px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${greet()}，今天有 ${todayLessons.length} 节课、${undone.length} 件待办</h2>
          <div class="muted" style="font-size:11px">${U.parse(t).getFullYear()} 年 ${+t.slice(5, 7)} 月 ${+t.slice(8)} 日 ${U.wdName(t)}</div>
        </div>
        <div style="display:flex;gap:6px;flex:none">
          <button class="btn btn-ghost btn-sm" data-act="backup" style="min-height:34px;padding:0 10px;font-size:12px">备份</button>
        </div>
      </div>
      <div class="dash-mobile-stats">
        <div class="dash-mobile-stat"><div class="lab">今日课程</div><div class="val">${todayLessons.length}</div><div class="sub">${totalMin} 分钟</div></div>
        <div class="dash-mobile-stat"><div class="lab">今日待办</div><div class="val">${undone.length}</div><div class="sub">待完成</div></div>
        <div class="dash-mobile-stat"><div class="lab">本月到手</div><div class="val">${U.money(profit).replace('¥', '')}</div><div class="sub">${profitLabel}</div></div>
      </div>
      <div class="dash-mobile-card">
        <h4>今日课程</h4>
        ${todayLessons.length ? todayLessons.slice(0, 3).map(lessonRow).join('') : '<div class="muted" style="font-size:12px;padding:6px 0">今天没有排课</div>'}
        ${todayLessons.length > 3 ? `<div class="muted" style="font-size:11px;text-align:center;padding-top:6px">还有 ${todayLessons.length - 3} 节</div>` : ''}
      </div>
      <div class="dash-mobile-card">
        <h4>今日待办</h4>
        ${undone.length ? undone.slice(0, 3).map(todoRow).join('') : '<div class="muted" style="font-size:12px;padding:6px 0">今日待办已清空</div>'}
        ${undone.length > 3 ? `<div class="muted" style="font-size:11px;text-align:center;padding-top:6px">还有 ${undone.length - 3} 件</div>` : ''}
      </div>
      <div class="dash-mobile-quick">
        ${qk.map(q => `<button class="dash-mobile-qb" data-go="${q.go}">
          <svg class="ico"><use href="#${q.ic}"/></svg>${q.name}</button>`).join('')}
      </div>
    </div>`;
  }
  function bindMobile(root, ctx) {
    U.rebind(root, 'dashm', e => {
      const go = e.target.closest('[data-go]');
      if (go) { App.go(go.dataset.go); return; }
      const b = e.target.closest('[data-act]');
      if (!b) {
        const li = e.target.closest('[data-lid]');
        if (li) Schedule.editLesson(li.dataset.lid);
        return;
      }
      switch (b.dataset.act) {
        case 'backup': {
          const name = DB.exportJSON();
          U.toast(name ? `已导出「${name}」` : '导出失败', name ? 'ok' : 'warn');
          break;
        }
        case 'finish': {
          const l = DB.data.lessons.find(x => x.id === b.closest('[data-lid]').dataset.lid);
          if (l) { l.status = 'done'; DB.save(); render(); U.toast('已标记完成'); }
          break;
        }
        case 'toggleTodo': {
          const x = DB.data.todos.find(y => y.id === b.closest('[data-tid]').dataset.tid);
          if (x) {
            x.status = Todo.cycle(x.status);
            x.doneAt = x.status === 'done' ? Date.now() : (x.status === 'pending' ? null : x.doneAt);
            DB.save(); render(); App.refreshBadge();
            if (x.status === 'done') U.toast('完成一件');
          }
          break;
        }
      }
    });
  }

  /* ---------- 顶层 render：拆 left/right 列 + 单列 full ---------- */
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'dashboard') return;
    const t = U.today(), pub = App.isPublic();
    // 主页抽成口径：默认只统计「已上课」的实际抽成；开启开关后把待上课也计入
    const inc = !!DB.data.settings.dashIncScheduled;
    const todayLessons = DB.data.lessons.filter(l => l.date === t && l.status !== 'cancelled')
      .sort((a, b) => U.t2m(a.start) - U.t2m(b.start));
    const todosAll = Todo.ofDate(t);
    const undone = todosAll.filter(x => x.status !== 'done').sort((a, b) => a.priority - b.priority);
    const overdue = DB.data.todos.filter(x => !x.done && x.date < t);
    const mFrom = U.monthFirst(t), mTo = U.monthLast(t);
    const mStat = DB.statIn(mFrom, mTo, { includeScheduled: inc });
    const mDone = DB.statIn(mFrom, mTo);
    const week = U.weekDays(t);
    const wStat = DB.statIn(week[0], week[6], { includeScheduled: inc });
    const trials = DB.data.students.filter(s => s.status === 'trial');
    const conflictDays = week.filter(d => {
      const ls = DB.data.lessons.filter(l => l.date === d && l.status !== 'cancelled');
      const lay = Schedule.layout(ls);
      return Object.values(lay).some(v => v.conflict);
    });
    const months = Array.from({ length: 6 }, (_, i) => {
      const m = U.monthFirst(U.addMonths(mFrom, i - 5));
      const s = DB.statIn(m, U.monthLast(m), { includeScheduled: inc });
      return { label: +m.slice(5, 7) + '月', value: s.profit, hl: i === 5 };
    });
    const byGrade = Finance.group(DB.statIn(mFrom, mTo, { includeScheduled: inc }).lessons, 'grade');

    const ctx = { t, pub, todayLessons, todosAll, undone, overdue, mStat, mDone, wStat, trials, conflictDays, months, byGrade, inc };
    if (U.isMobile()) { root.innerHTML = renderMobile(ctx); bindMobile(root, ctx); return; }

    const layout = getLayout();
    const visible = layout.order.filter(k => !layout.hidden.includes(k));

    /* 布局：full 独占整行，其余按 2 列网格自动排布（无空白列、无大段留白） */
    let html = '';
    visible.forEach(k => {
      const mod = MODULES[k];
      if (!mod) return;
      html += wrapModule(k, mod.render(ctx), mod.layout === 'full');
    });

    root.innerHTML = `
    <div class="dash-toolbar">
      <span class="muted" style="font-size:12px">共 ${visible.length}/${layout.order.length} 个模块</span>
      <button class="btn ${inc ? 'btn-primary' : 'btn-ghost'} btn-sm" data-act="toggleInc" title="主页抽成默认只统计已上课；开启后把待上课也计入抽成">
        ${inc ? '抽成含未上课' : '抽成仅已上课'}</button>
      <button class="btn btn-ghost btn-sm" data-act="backup" title="把当前全部数据导出成一个 JSON 文件存到本机，换设备/清缓存后可用它恢复">
        <svg class="ico"><use href="#i-download"/></svg>备份数据</button>
      <button class="btn ${editMode ? 'btn-primary' : 'btn-ghost'} btn-sm" data-act="toggleEdit" style="margin-left:auto">
        <svg class="ico"><use href="#${editMode ? 'i-check' : 'i-gear'}"/></svg>
        ${editMode ? '完成编辑' : '编辑模块'}
      </button>
    </div>
    ${editMode ? renderHiddenPanel(layout.hidden) : ''}
    <div class="dash-grid ${editMode ? 'edit-mode' : ''}">
      ${html}
    </div>
    ${editMode ? `<div class="dash-edit-hint">
      <span>拖动左侧 <b>≡</b> 重新排序（手机端用上下按钮）</span>
      <span>点 <b>✎</b> 改标题，点 <b>×</b> 隐藏</span>
    </div>` : ''}`;

    /* 拖动绑定（仅编辑模式 + 桌面端） */
    if (editMode && !U.isMobile()) {
      U.draggableSortable(root.querySelector('.dash-grid'), '.dash-module', newOrder => {
        saveLayout({ order: newOrder });
      });
    }

    /* 事件绑定 */
    U.rebind(root, 'dash', e => {
      const go = e.target.closest('[data-go]');
      if (go) { App.go(go.dataset.go); return; }
      const b = e.target.closest('[data-act]');
      if (!b) {
        const li = e.target.closest('[data-lid]');
        if (li) Schedule.editLesson(li.dataset.lid);
        return;
      }
        switch (b.dataset.act) {
        case 'toggleInc': DB.data.settings.dashIncScheduled = !DB.data.settings.dashIncScheduled; DB.save(); render(); U.toast(DB.data.settings.dashIncScheduled ? '主页抽成已含待上课（预计）' : '主页抽成仅统计已上课（实际）', 'ok'); break;
        case 'backup': {
          const name = DB.exportJSON();
          U.toast(name ? `已导出「${name}」，请到浏览器「下载」里查看` : '导出失败', name ? 'ok' : 'warn');
          break;
        }
        case 'toggleEdit': editMode = !editMode; render(); break;
        case 'book': Schedule.book(null, {}, () => render()); break;
        case 'finish': {
          const l = DB.data.lessons.find(x => x.id === b.closest('[data-lid]').dataset.lid);
          l.status = 'done'; DB.save(); render(); U.toast('已标记完成');
          break;
        }
        case 'toggleTodo': {
          const x = DB.data.todos.find(y => y.id === b.closest('[data-tid]').dataset.tid);
          x.status = Todo.cycle(x.status);
          x.doneAt = x.status === 'done' ? Date.now() : (x.status === 'pending' ? null : x.doneAt);
          DB.save(); render(); App.refreshBadge();
          if (x.status === 'done') U.toast('完成一件');
          break;
        }
        case 'importTpl': {
          let n = 0;
          DB.data.templates.forEach(tpl => {
            if (DB.data.todos.some(x => x.date === t && x.tplId === tpl.id)) return;
            Todo.add({ title: tpl.title, priority: tpl.priority, tag: tpl.tag, tplId: tpl.id, date: t }); n++;
          });
          DB.save(); render(); App.refreshBadge();
          U.toast(n ? `已导入 ${n} 条模板任务` : '今天已经导入过了', n ? 'ok' : 'warn');
          break;
        }
        case 'copyPh': {
          const p = DB.data.phrases.find(x => x.id === b.closest('[data-pid]').dataset.pid);
          U.copy(p.content); p.hits = (p.hits || 0) + 1; DB.save();
          break;
        }
        case 'addTpl': Todo.editTpl(null, render); break;
        case 'editTpl': {
          const tpl = DB.data.templates.find(x => x.id === b.closest('[data-tpl]').dataset.tpl);
          Todo.editTpl(tpl, render); break;
        }
        case 'useTpl': {
          const tpl = DB.data.templates.find(x => x.id === b.closest('[data-tpl]').dataset.tpl);
          Todo.importTemplates([tpl.id]); render(); break;
        }
        case 'delTpl': {
          const tpl = DB.data.templates.find(x => x.id === b.closest('[data-tpl]').dataset.tpl);
          U.confirm(`删除模板「${tpl.title}」？`, () => {
            DB.data.templates = DB.data.templates.filter(x => x.id !== tpl.id); DB.save(); render();
          }, '删除');
          break;
        }
        case 'importAll': Todo.importTemplates(); render(); break;

        /* 模块管理 */
        case 'editMod': {
          const key = b.closest('.dash-module').dataset.mod;
          U.modal({
            title: '编辑模块标题',
            body: `<div class="form-row"><label>新标题</label><input class="input" id="modTitleInput" value="${U.esc(resolveTitle(key))}" placeholder="${U.esc(defaultTitle(key))}">
              <p class="muted" style="font-size:12px;margin-top:6px">留空 = 恢复默认标题「${U.esc(defaultTitle(key))}」</p></div>`,
            okText: '保存',
            onOk: () => {
              const v = (U.$('#modTitleInput') || {}).value || '';
              const custom = DB.data.settings.dashboardLayout.customTitle || {};
              if (!v.trim() || v.trim() === defaultTitle(key)) delete custom[key];
              else custom[key] = v.trim();
              DB.data.settings.dashboardLayout.customTitle = custom;
              DB.save(); render();
              U.toast('已更新', 'ok');
            }
          });
          setTimeout(() => { const i = U.$('#modTitleInput'); if (i) { i.focus(); i.select(); } }, 60);
          break;
        }
        case 'hideMod': {
          const key = b.closest('.dash-module').dataset.mod;
          const L = getLayout();
          if (!L.hidden.includes(key)) L.hidden.push(key);
          saveLayout({ hidden: L.hidden });
          render();
          U.toast('已隐藏，可到顶部「已隐藏的模块」恢复', 'ok');
          break;
        }
        case 'restoreMod': {
          const key = b.closest('.dash-hidden-row').dataset.mod;
          const L = getLayout();
          L.hidden = L.hidden.filter(k => k !== key);
          saveLayout({ hidden: L.hidden });
          render();
          break;
        }
        case 'moveUp':
        case 'moveDown': {
          const key = b.closest('.dash-module').dataset.mod;
          const L = getLayout();
          const idx = L.order.indexOf(key);
          if (idx < 0) break;
          const swap = b.dataset.act === 'moveUp' ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= L.order.length) break;
          [L.order[idx], L.order[swap]] = [L.order[swap], L.order[idx]];
          saveLayout({ order: L.order });
          render();
          break;
        }
      }
    });
  }

  Views.dashboard = {
    title: '主页',
    sub: '今天要上的课、要做的事、能赚的钱',
    render() { editMode = false; render(); }
  };
  return { render };
})();
