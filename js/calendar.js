/* ===== iOS 风格个人日历：日 / 周 / 月 / 年，事项挂在日期下，可勾选完成 ===== */
window.Views = window.Views || {};

const Calendar = (() => {
  let view = U.isMobile() ? 'day' : 'month';   // day | week | month | year
  let anchor = U.today();                       // 当前聚焦的日期

  /* ---------- 视图切换 ---------- */
  function setView(v, keepAnchor) {
    view = v;
    DB.data.settings.calendarView = v; DB.save();
    if (!keepAnchor) anchor = U.today();
    render();
  }
  function shift(delta) {
    if (view === 'day') anchor = U.addDays(anchor, delta);
    else if (view === 'week') anchor = U.addDays(anchor, delta * 7);
    else if (view === 'month') anchor = U.addMonths(U.monthFirst(anchor), delta);
    else anchor = U.addMonths(anchor, delta * 12);
    render();
  }

  /* ---------- 标题 / 当天 ---------- */
  function titleText() {
    if (view === 'day') return `${+anchor.slice(5, 7)}月${+anchor.slice(8)}日 ${U.wdName(anchor)}`;
    if (view === 'week') {
      const d = U.weekDays(anchor);
      return `${d[0].replace(/-/g, '.')} — ${d[6].slice(5).replace('-', '.')}`;
    }
    if (view === 'month') return `${anchor.slice(0, 4)} 年 ${+anchor.slice(5, 7)} 月`;
    return `${anchor.slice(0, 4)} 年`;
  }
  function titleBig() {
    if (view === 'day') return `${anchor.slice(0, 4)}年${+anchor.slice(5, 7)}月${+anchor.slice(8)}日`;
    if (view === 'month') return `${anchor.slice(0, 4)}年${+anchor.slice(5, 7)}月`;
    if (view === 'year') return `${anchor.slice(0, 4)}年`;
    const d = U.weekDays(anchor);
    return `${d[0]} — ${d[6]}`;
  }

  /* ---------- 工具：按日期聚合待办 ---------- */
  function todosOf(dt) {
    return DB.data.todos.filter(x => x.date === dt)
      .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.time || '99:59').localeCompare(b.time || '99:59') || a.priority - b.priority || a.createdAt - b.createdAt);
  }
  function todoHTML(x) {
    const p = Todo.pInfo(x.priority);
    const st = Todo.sInfo(x.status);
    const chkIcon = x.status === 'done'
      ? '<svg viewBox="0 0 24 24" class="ico"><path d="M5 12.5 10 17 19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : x.status === 'blocked'
        ? '<svg viewBox="0 0 24 24" class="ico"><path d="M6 12h12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>'
        : '';
    return `<div class="cal-event ${x.status === 'done' ? 'done' : ''} ${x.status === 'blocked' ? 'blocked' : ''}" data-tid="${x.id}">
      <button class="cal-check" data-act="toggle" aria-label="${st.name}" style="border-color:${st.color};${x.status !== 'pending' ? 'background:' + st.color : ''}">
        ${chkIcon}
      </button>
      <div class="cal-ev-body" data-act="open">
        <div class="cal-ev-bar" style="background:${p.color}"></div>
        <div class="cal-ev-main">
          ${x.time ? `<span class="cal-ev-time">${U.esc(x.time)}</span>` : ''}
          <span class="cal-ev-title">${U.esc(x.title)}</span>
        </div>
        <div class="cal-ev-meta">${st.name}${x.status === 'pending' ? ' · ' + p.name : ''}${x.tag ? ' · ' + U.esc(x.tag) : ''}${x.autoKey ? ' · 自动生成' : ''}</div>
      </div>
    </div>`;
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'calendar') return;
    const t = U.today();

    root.innerHTML = `
    <div class="cal-wrap">
      <div class="cal-bar">
        <div class="cal-tabs">
          ${[['day','日'],['week','周'],['month','月'],['year','年']]
            .map(([k, n]) => `<button class="cal-tab ${view===k?'on':''}" data-v="${k}">${n}</button>`).join('')}
        </div>
        <div class="cal-nav">
          <button class="cal-navbtn" data-act="prev" aria-label="上一段">&#8249;</button>
          <div class="cal-title">${titleBig()}</div>
          <button class="cal-navbtn" data-act="next" aria-label="下一段">&#8250;</button>
          <button class="cal-today" data-act="today">今天</button>
        </div>
        <button class="btn btn-primary btn-sm" data-act="add" data-day="${anchor}">
          <svg class="ico"><use href="#i-plus"/></svg>添加待办</button>
      </div>
      <div class="cal-body" id="calBody"></div>
    </div>`;

    const body = U.$('#calBody', root);
    if (view === 'day')   renderDay(body, t);
    if (view === 'week')  renderWeek(body, t);
    if (view === 'month') renderMonth(body, t);
    if (view === 'year')  renderYear(body, t);

    root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => setView(b.dataset.v));
    U.rebind(root, 'cal', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'prev') shift(-1);
      else if (a.dataset.act === 'next') shift(1);
      else if (a.dataset.act === 'today') { anchor = U.today(); render(); }
      else if (a.dataset.act === 'add') {
        const dt = a.dataset.day || U.today();
        const nt = { id: U.uid('td'), title: '', note: '', priority: 1, tag: '', date: dt, status: 'pending', doneAt: null, createdAt: Date.now() };
        DB.data.todos.push(nt); DB.save(); Todo.editTodo(nt, render); App.refreshBadge();
      }
      else if (a.dataset.act === 'toggle') {
        const x = DB.data.todos.find(y => y.id === a.closest('[data-tid]').dataset.tid);
        if (!x) return;
        x.status = Todo.cycle(x.status);
        x.doneAt = x.status === 'done' ? Date.now() : (x.status === 'pending' ? null : x.doneAt);
        DB.save(); render(); App.refreshBadge();
      }
      else if (a.dataset.act === 'open') {
        const x = DB.data.todos.find(y => y.id === a.closest('[data-tid]').dataset.tid);
        if (x) Todo.editTodo(x, render);
      }
    });
  }

  /* ---------- 日视图：单日事项列表（最常用，勾选友好） ---------- */
  function renderDay(body, today) {
    const list = todosOf(anchor);
    body.innerHTML = `
      <div class="cal-day">
        <div class="cal-day-head ${anchor === today ? 'today' : ''}">
          <div class="cal-day-name">${U.wdName(anchor)}</div>
          <div class="cal-day-date">${+anchor.slice(8)}</div>
        </div>
        <div class="cal-day-list">
          ${list.length ? list.map(todoHTML).join('')
            : `<div class="cal-empty">这一天还没有待办，点上方按钮记录一件</div>`}
        </div>
      </div>`;
  }

  /* ---------- 周视图：桌面 7 列；手机改为纵向日程列表 ---------- */
  function renderWeek(body, today) {
    const days = U.weekDays(anchor);
    if (U.isMobile()) return renderWeekMobile(body, today, days);
    body.innerHTML = `
      <div class="cal-week-view">
        <div class="cal-week-head">
          ${days.map(d => `<div class="cal-week-hcell ${d===today?'today':''} ${d===anchor?'sel':''}">
            <div class="cal-week-wd">${U.wdName(d).slice(1)}</div>
            <div class="cal-week-dn">${+d.slice(8)}</div>
          </div>`).join('')}
        </div>
        <div class="cal-week-cols">
          ${days.map(d => {
            const ls = todosOf(d);
            return `<div class="cal-week-col ${d===anchor?'sel':''}" data-day="${d}">
              <div class="cal-week-col-h">${ls.length} 项</div>
              ${ls.length ? ls.map(todoHTML).join('') : '<div class="cal-empty-mini">无</div>'}
              <button class="cal-add-mini" data-act="add" data-day="${d}" aria-label="添加">+</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    body.querySelectorAll('.cal-week-col').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('[data-act]')) return;
      anchor = c.dataset.day; setView('day', true);
    }));
  }
  function renderWeekMobile(body, today, days) {
    body.innerHTML = `<div class="cal-week-list">${days.map(d => {
      const ls = todosOf(d);
      const isToday = d === today, isSel = d === anchor;
      return `<div class="cal-week-row">
        <div class="cal-week-dayhead ${isToday?'today':''} ${isSel?'sel':''}" data-day="${d}">
          <span class="wd">${U.wdName(d)}</span><span class="dn">${+d.slice(8)}</span>
          <span class="cnt">${ls.length ? ls.length + ' 项' : '无'}</span>
        </div>
        ${ls.length ? ls.map(todoHTML).join('') : '<div class="cal-empty-mini">这一天还没有待办</div>'}
      </div>`;
    }).join('')}</div>`;
    body.querySelectorAll('.cal-week-dayhead').forEach(h => h.addEventListener('click', e => {
      if (e.target.closest('.cal-event') || e.target.closest('[data-act]')) return;
      anchor = h.dataset.day; setView('day', true);
    }));
  }

  /* ---------- 月视图：iOS 风格网格，事项嵌入日期格 ---------- */
  function renderMonth(body, today) {
    const first = U.monthFirst(anchor);
    const start = U.dow(first);          // 0=周日
    const cells = [];
    for (let i = start; i > 0; i--) cells.push(U.addDays(first, -i));
    let d = first;
    while (d.slice(0, 7) === first.slice(0, 7) || cells.length % 7 !== 0) {
      cells.push(d); d = U.addDays(d, 1);
      if (cells.length > 42) break;
    }
    const mm = first.slice(0, 7);
    const isM = U.isMobile();
    const cellEvents = ls => {
      if (isM) {
        return `<div class="cal-month-dots">${ls.slice(0, 4).map(x => {
        const st = Todo.sInfo(x.status);
        return `<i style="background:${x.status==='pending'?Todo.pInfo(x.priority).color:st.color}"></i>`;
      }).join('')}${ls.length > 4 ? `<span>+${ls.length - 4}</span>` : ''}</div>`;
      }
      return `${ls.slice(0, 3).map(x => {
        const p = Todo.pInfo(x.priority);
        const st = Todo.sInfo(x.status);
        return `<div class="cal-month-ev ${x.status==='done'?'done':''} ${x.status==='blocked'?'blocked':''}" data-tid="${x.id}" title="${U.esc(x.title)}">
          <i style="background:${x.status==='pending'?p.color:st.color}"></i>
          <span>${x.time ? `<b class="cal-month-ev-time">${U.esc(x.time)}</b>` : ''}${U.esc(x.title)}</span>
        </div>`;
      }).join('')}${ls.length > 3 ? `<div class="cal-month-more">+${ls.length - 3} 更多</div>` : ''}`;
    };
    body.innerHTML = `
      <div class="cal-month">
        <div class="cal-month-head">
          ${['日','一','二','三','四','五','六'].map(w => `<div class="cal-month-wd">${w}</div>`).join('')}
        </div>
        <div class="cal-month-grid">
          ${cells.map(dt => {
            const ls = todosOf(dt);
            const out = dt.slice(0, 7) !== mm;
            return `<div class="cal-month-cell ${out?'out':''} ${dt===today?'today':''} ${dt===anchor?'sel':''}" data-day="${dt}">
              <div class="cal-month-dn">${+dt.slice(8)}</div>
              <div class="cal-month-events">${cellEvents(ls)}</div>
              <button class="cal-month-add" data-act="add" data-day="${dt}" aria-label="添加">+</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    body.querySelectorAll('.cal-month-cell').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('[data-act]')) return;
      if (e.target.closest('[data-tid]')) {
        const x = DB.data.todos.find(y => y.id === e.target.closest('[data-tid]').dataset.tid);
        if (x) Todo.editTodo(x, render);
        return;
      }
      anchor = c.dataset.day; setView('day', true);
    }));
  }

  /* ---------- 年视图：12 月热力（仅显示待办数） ---------- */
  function renderYear(body, today) {
    const y = anchor.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${U.pad(i + 1)}-01`);
    const data = months.map(m => {
      const a = m, b = U.monthLast(m);
      const todos = DB.data.todos.filter(x => x.date >= a && x.date <= b);
      return { m, label: +m.slice(5, 7) + '月', todos: todos.length, a, b };
    });
    const max = Math.max(...data.map(d => d.todos), 1);
    body.innerHTML = `
      <div class="cal-year">
        <div class="cal-year-grid">
          ${data.map(d => `
            <div class="cal-year-cell ${d.m.slice(0,7)===today.slice(0,7)?'today':''}" data-m="${d.m}">
              <div class="cal-year-h">${d.label}</div>
              <div class="cal-year-bar" style="height:${Math.max(4, d.todos / max * 64)}px"></div>
              <div class="cal-year-meta">${d.todos} 待办</div>
            </div>`).join('')}
        </div>
      </div>`;
    body.querySelectorAll('.cal-year-cell').forEach(c => c.onclick = () => {
      anchor = c.dataset.m; setView('month', true);
    });
  }

  /* ---------- 启动 ---------- */
  Views.calendar = {
    title: '日历',
    sub: '个人日程：日 / 周 / 月 / 年视图，事项挂在日期下，可勾选完成',
    render() {
      const saved = DB.data.settings.calendarView;
      if (saved && saved !== view) view = saved;
      anchor = U.today();
      render();
    }
  };
  return { render, setView };
})();