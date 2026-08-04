/* ===== iOS 风格个人日历：日 / 周 / 月 / 年，同时显示「日程」与「提醒事项」 ===== */
window.Views = window.Views || {};

const Calendar = (() => {
  let view = U.isMobile() ? 'day' : 'month';   // day | week | month | year
  let anchor = U.today();                       // 当前聚焦的日期

  const EVENT_COLORS = {
    '考研课程': '#f2b544', '工作': '#f9709d', '个人': '#8fb8f0', '家庭': '#7fc8a9',
    '健康': '#65c7c0', '社交': '#b48ce0', '其它': '#c0a3b2'
  };
  const REPEAT_OPTIONS = [
    { v: 'never', name: '永不' }, { v: 'daily', name: '每天' }, { v: 'weekdays', name: '工作日' },
    { v: 'weekly', name: '每周' }, { v: 'biweekly', name: '每两周' }, { v: 'monthly', name: '每月' }, { v: 'yearly', name: '每年' }
  ];
  const ALERT_OPTIONS = [
    { v: '0', name: '事件发生时' }, { v: '5', name: '5 分钟前' }, { v: '15', name: '15 分钟前' },
    { v: '30', name: '30 分钟前' }, { v: '60', name: '1 小时前' }, { v: 'none', name: '无' }
  ];

  function eventColor(name) { return EVENT_COLORS[name] || EVENT_COLORS['其它']; }

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
  function titleBig() {
    if (view === 'day') return `${anchor.slice(0, 4)}年${+anchor.slice(5, 7)}月${+anchor.slice(8)}日`;
    if (view === 'month') return `${anchor.slice(0, 4)}年${+anchor.slice(5, 7)}月`;
    if (view === 'year') return `${anchor.slice(0, 4)}年`;
    const d = U.weekDays(anchor);
    const fmt = x => x.slice(5).replace('-', '.');
    const head = d[0].slice(0, 4) === d[6].slice(0, 4) ? fmt(d[0]) : d[0].slice(0, 4) + '.' + fmt(d[0]);
    return `${head} — ${fmt(d[6])}`;
  }

  /* ---------- 按日期聚合提醒事项 ---------- */
  /* ---------- 按日期聚合提醒事项（含重复展开） ---------- */
  function todosOf(dt) {
    const out = [];
    for (const x of DB.data.todos) {
      const rule = U.recurRuleOf(x.repeat, x.date);
      if (!U.recurOccursOn(dt, rule)) continue;
      out.push(x);
    }
    out.sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.time || '99:59').localeCompare(b.time || '99:59') || a.priority - b.priority || a.createdAt - b.createdAt);
    return out;
  }

  /* ---------- 按日期聚合日程（发生在该天的日程，含重复展开） ---------- */
  function eventsOf(dt) {
    const out = [];
    for (const e of DB.data.events) {
      const rule = U.recurRuleOf(e.repeat, e.startDate);
      if (!U.recurOccursOn(dt, rule)) continue;
      // 复制一份并把日期偏移到该发生日，保证全天区间 / 时间块正确
      const off = U.daysDiff(e.startDate, dt);
      const inst = Object.assign({}, e);
      if (off) {
        inst.startDate = dt;
        inst.endDate = U.addDays(e.endDate, off);
      }
      out.push(inst);
    }
    out.sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00') || a.createdAt - b.createdAt);
    return out;
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
      <button class="cal-check" data-act="toggleTodo" aria-label="${st.name}" style="border-color:${st.color};${x.status !== 'pending' ? 'background:' + st.color : ''}">
        ${chkIcon}
      </button>
      <div class="cal-ev-body" data-act="openTodo">
        <div class="cal-ev-bar" style="background:${p.color}"></div>
        <div class="cal-ev-main">
          ${x.time ? `<span class="cal-ev-time">${U.esc(x.time)}</span>` : ''}
          <span class="cal-ev-title">${U.esc(x.title)}</span>
        </div>
        <div class="cal-ev-meta">${st.name}${x.status === 'pending' ? ' · ' + p.name : ''}${x.tag ? ' · ' + U.esc(x.tag) : ''}${x.autoKey ? ' · 自动生成' : ''}</div>
      </div>
    </div>`;
  }

  function eventHTML(x) {
    const c = eventColor(x.calendar);
    const timeText = x.allDay
      ? '全天'
      : `${x.startTime || '--:--'}${x.endTime ? ' — ' + x.endTime : ''}`;
    return `<div class="cal-event cal-event-block" data-eid="${x.id}" style="--ev-color:${c}">
      <div class="cal-ev-dot" style="background:${c}"></div>
      <div class="cal-ev-body" data-act="openEvent">
        <div class="cal-ev-main">
          <span class="cal-ev-time">${U.esc(timeText)}</span>
          <span class="cal-ev-title">${U.esc(x.title)}</span>
        </div>
        ${x.location ? `<div class="cal-ev-meta">📍 ${U.esc(x.location)}</div>` : ''}
      </div>
    </div>`;
  }

  /* ---------- 新建选择：日程 or 提醒事项 ---------- */
  function showAddChoice(dt) {
    U.modal({
      title: '新建项目',
      hideFoot: true,
      body: `<div class="grid g2" style="gap:12px">
        <button class="btn btn-ghost" data-type="event" style="flex-direction:column;align-items:flex-start;padding:16px;height:auto;text-align:left">
          <b style="font-size:14px">日程</b><span class="muted" style="font-size:12px">有开始/结束时间的安排，如上课、会议</span></button>
        <button class="btn btn-ghost" data-type="todo" style="flex-direction:column;align-items:flex-start;padding:16px;height:auto;text-align:left">
          <b style="font-size:14px">提醒事项</b><span class="muted" style="font-size:12px">需要打勾完成的事项，如回访、备课</span></button>
      </div>`
    }).body.addEventListener('click', e => {
      const b = e.target.closest('[data-type]'); if (!b) return;
      e.target.closest('.mask').remove();
      if (b.dataset.type === 'event') editEvent({ startDate: dt, endDate: dt }, render);
      else {
        const nt = { id: U.uid('td'), title: '', note: '', priority: 1, tag: '', date: dt, status: 'pending', doneAt: null, createdAt: Date.now() };
        DB.data.todos.push(nt); DB.save(); Todo.editTodo(nt, render); App.refreshBadge();
      }
    });
  }

  /* ---------- 日程编辑 ---------- */
  function editEvent(ev, after) {
    const isNew = !ev.id;
    ev = Object.assign({
      id: U.uid('ev'), title: '', location: '', allDay: false,
      startDate: U.today(), endDate: U.today(), startTime: '09:00', endTime: '10:00',
      repeat: 'never', alert: '15', calendar: '其它', note: '', createdAt: Date.now()
    }, ev);
    // 保证 allDay 时时间字段干净
    if (ev.allDay) { ev.startTime = ''; ev.endTime = ''; }

    const calOpts = Object.keys(EVENT_COLORS).map(k => `<option value="${k}" ${ev.calendar === k ? 'selected' : ''}>${k}</option>`).join('');
    const alertOpts = ALERT_OPTIONS.map(a => `<option value="${a.v}" ${String(ev.alert) === String(a.v) ? 'selected' : ''}>${a.name}</option>`).join('');
    const startVal = ev.startDate || ev.sd || U.today();

    const mm = U.modal({
      title: isNew ? '新建日程' : '编辑日程',
      okText: '保存',
      body: `<div class="field"><label>标题</label><input class="input" id="ev_title" value="${U.esc(ev.title)}" placeholder="例如：考研数学课"></div>
        <div class="field"><label>位置或视频通话</label><input class="input" id="ev_loc" value="${U.esc(ev.location)}" placeholder="例如：腾讯会议 123-456"></div>
        <div class="field" style="display:flex;align-items:center;justify-content:space-between">
          <label>全天</label>
          <div class="switch ${ev.allDay ? 'on' : ''}" id="ev_allday_sw"></div>
          <input type="checkbox" id="ev_allday" ${ev.allDay ? 'checked' : ''} style="display:none">
        </div>
        <div class="row">
          <div class="field"><label>开始</label><input type="date" class="input" id="ev_sd" value="${startVal}"></div>
          <div class="field ev-time ${ev.allDay ? 'hide' : ''}"><label>&nbsp;</label><input type="time" class="input" id="ev_st" value="${ev.startTime}"></div>
        </div>
        <div class="row">
          <div class="field"><label>结束</label><input type="date" class="input" id="ev_ed" value="${ev.endDate || startVal}"></div>
          <div class="field ev-time ${ev.allDay ? 'hide' : ''}"><label>&nbsp;</label><input type="time" class="input" id="ev_et" value="${ev.endTime}"></div>
        </div>
        ${U.buildRepeatControl(ev.repeat && typeof ev.repeat === 'string' ? ev.repeat : (ev.repeat && ev.repeat.type === 'custom' ? 'custom' : (ev.repeat && ev.repeat.type) || 'never'))}
        <div class="row">
          <div class="field"><label>提醒</label><select class="input" id="ev_alert">${alertOpts}</select></div>
          <div class="field"><label>日历</label><select class="input" id="ev_cal">${calOpts}</select></div>
        </div>
        <div class="field"><label>备注</label><textarea class="input" id="ev_note" rows="2">${U.esc(ev.note)}</textarea></div>`,
      onOk: b => {
        ev.title = U.$('#ev_title', b).value.trim();
        if (!ev.title) { U.toast('请填写日程标题', 'warn'); return false; }
        ev.location = U.$('#ev_loc', b).value.trim();
        ev.allDay = U.$('#ev_allday', b).checked;
        ev.startDate = U.$('#ev_sd', b).value || ev.startDate;
        ev.endDate = U.$('#ev_ed', b).value || ev.endDate;
        ev.startTime = ev.allDay ? '' : (U.$('#ev_st', b).value || '00:00');
        ev.endTime = ev.allDay ? '' : (U.$('#ev_et', b).value || '00:00');
        ev.repeat = U.readRepeatControl(b);
        ev.alert = U.$('#ev_alert', b).value;
        ev.calendar = U.$('#ev_cal', b).value;
        ev.note = U.$('#ev_note', b).value.trim();
        if (ev.endDate < ev.startDate) { U.toast('结束日期不能早于开始日期', 'warn'); return false; }
        if (!ev.allDay && ev.endDate === ev.startDate && ev.endTime < ev.startTime) { U.toast('结束时间不能早于开始时间', 'warn'); return false; }
        if (isNew) DB.data.events.push(ev);
        DB.save();
        if (after) after(); else render();
        U.toast(isNew ? '已添加日程' : '已保存日程', 'ok');
      }
    });

    const sw = U.$('#ev_allday_sw', mm.body);
    sw.onclick = () => {
      const cb = U.$('#ev_allday', mm.body);
      cb.checked = !cb.checked;
      sw.classList.toggle('on', cb.checked);
      mm.body.querySelectorAll('.ev-time').forEach(el => el.classList.toggle('hide', cb.checked));
    };
    U.wireRepeatControl(mm.body, (typeof ev.repeat === 'string' || (ev.repeat && ev.repeat.type === 'custom'))
      ? ev.repeat : (ev.repeat && ev.repeat.type) || 'never');
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
          <div class="cal-title-wrap">
            <div class="cal-title">${titleBig()}</div>
          </div>
          <button class="cal-navbtn" data-act="next" aria-label="下一段">&#8250;</button>
          <button class="cal-today" data-act="today">今天</button>
        </div>
        <button class="btn btn-primary btn-sm" data-act="add" data-day="${anchor}">
          <svg class="ico"><use href="#i-plus"/></svg>新建</button>
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
      else if (a.dataset.act === 'add') showAddChoice(a.dataset.day || U.today());
      else if (a.dataset.act === 'toggleTodo') {
        const x = DB.data.todos.find(y => y.id === a.closest('[data-tid]').dataset.tid);
        if (!x) return;
        const rule = U.recurRuleOf(x.repeat, x.date);
        const occursHere = U.recurOccursOn(anchor, rule);   // 是否就是这个发生日
        if (occursHere) {
          // 重复任务：按发生日单独勾选完成
          x.completedDates = Array.isArray(x.completedDates) ? x.completedDates : [];
          const i = x.completedDates.indexOf(anchor);
          if (i >= 0) x.completedDates.splice(i, 1);
          else x.completedDates.push(anchor);
          x.doneAt = i >= 0 ? null : Date.now();
        } else {
          x.status = Todo.cycle(x.status);
          x.doneAt = x.status === 'done' ? Date.now() : (x.status === 'pending' ? null : x.doneAt);
        }
        DB.save(); render(); App.refreshBadge();
      }
      else if (a.dataset.act === 'openTodo') {
        const x = DB.data.todos.find(y => y.id === a.closest('[data-tid]').dataset.tid);
        if (x) Todo.editTodo(x, render);
      }
      else if (a.dataset.act === 'openEvent') {
        const x = DB.data.events.find(y => y.id === a.closest('[data-eid]').dataset.eid);
        if (x) editEvent(x, render);
      }
      else if (a.dataset.act === 'delEvent') {
        const id = a.closest('[data-eid]').dataset.eid;
        U.confirm('删除这条日程？', () => {
          DB.data.events = DB.data.events.filter(y => y.id !== id); DB.save(); render(); U.toast('已删除日程');
        }, '删除');
      }
    });
  }

  function dayListHTML(dt) {
    const evs = eventsOf(dt);
    const tds = todosOf(dt);
    const parts = [];
    if (evs.length) parts.push(`<div class="cal-seg-h">日程 · ${evs.length}</div>` + evs.map(eventHTML).join(''));
    if (tds.length) parts.push(`<div class="cal-seg-h">提醒事项 · ${tds.length}</div>` + tds.map(todoHTML).join(''));
    return parts.length ? parts.join('') : `<div class="cal-empty">这一天还没有日程和提醒事项，点上方按钮添加</div>`;
  }

  /* ---------- 日视图 ---------- */
  function renderDay(body, today) {
    const list = dayListHTML(anchor);
    body.innerHTML = `
      <div class="cal-day">
        <div class="cal-day-head ${anchor === today ? 'today' : ''}">
          <div class="cal-day-name">${U.wdName(anchor)}</div>
          <div class="cal-day-date">${+anchor.slice(8)}</div>
        </div>
        <div class="cal-day-list">${list}</div>
      </div>`;
  }

  /* ---------- 周视图 ---------- */
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
            const evs = eventsOf(d), tds = todosOf(d);
            return `<div class="cal-week-col ${d===anchor?'sel':''}" data-day="${d}">
              <div class="cal-week-col-h">${evs.length ? evs.length + ' 个日程' : ''}${evs.length && tds.length ? ' · ' : ''}${tds.length ? tds.length + ' 个提醒' : ''}</div>
              ${evs.map(eventHTML).join('')}
              ${tds.map(todoHTML).join('')}
              ${!evs.length && !tds.length ? '<div class="cal-empty-mini">无</div>' : ''}
              <button class="cal-add-mini" data-act="add" data-day="${d}" aria-label="添加">+</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    body.querySelectorAll('.cal-week-col').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('[data-act]') || e.target.closest('[data-tid]') || e.target.closest('[data-eid]')) return;
      anchor = c.dataset.day; setView('day', true);
    }));
  }
  function renderWeekMobile(body, today, days) {
    body.innerHTML = `<div class="cal-week-list">${days.map(d => {
      const evs = eventsOf(d), tds = todosOf(d);
      const isToday = d === today, isSel = d === anchor;
      return `<div class="cal-week-row">
        <div class="cal-week-dayhead ${isToday?'today':''} ${isSel?'sel':''}" data-day="${d}">
          <span class="wd">${U.wdName(d)}</span><span class="dn">${+d.slice(8)}</span>
          <span class="cnt">${evs.length || tds.length ? (evs.length + tds.length) + ' 项' : '无'}</span>
        </div>
        ${evs.map(eventHTML).join('')}
        ${tds.map(todoHTML).join('')}
        ${!evs.length && !tds.length ? '<div class="cal-empty-mini">这一天还没有安排</div>' : ''}
      </div>`;
    }).join('')}</div>`;
    body.querySelectorAll('.cal-week-dayhead').forEach(h => h.addEventListener('click', e => {
      if (e.target.closest('.cal-event') || e.target.closest('[data-act]')) return;
      anchor = h.dataset.day; setView('day', true);
    }));
  }

  /* ---------- 月视图 ---------- */
  function renderMonth(body, today) {
    const first = U.monthFirst(anchor);
    const start = U.dow(first);
    const cells = [];
    for (let i = start; i > 0; i--) cells.push(U.addDays(first, -i));
    let d = first;
    while (d.slice(0, 7) === first.slice(0, 7) || cells.length % 7 !== 0) {
      cells.push(d); d = U.addDays(d, 1);
      if (cells.length > 42) break;
    }
    const mm = first.slice(0, 7);
    const isM = U.isMobile();
    const cellEvents = (evs, tds) => {
      if (isM) {
        const dots = [];
        evs.slice(0, 3).forEach(x => dots.push(`<i style="background:${eventColor(x.calendar)}"></i>`));
        tds.slice(0, Math.max(0, 4 - dots.length)).forEach(x => {
          const st = Todo.sInfo(x.status);
          dots.push(`<i style="background:${x.status==='pending'?Todo.pInfo(x.priority).color:st.color};border-radius:50%"></i>`);
        });
        const total = evs.length + tds.length;
        return `<div class="cal-month-dots">${dots.join('')}${total > 4 ? `<span>+${total - 4}</span>` : ''}</div>`;
      }
      let html = '';
      html += evs.slice(0, 2).map(x => `<div class="cal-month-ev cal-month-ev-block" data-eid="${x.id}" title="${U.esc(x.title)}" style="--ev-color:${eventColor(x.calendar)}">
        <i></i><span>${U.esc(x.title)}</span></div>`).join('');
      html += tds.slice(0, Math.max(0, 3 - evs.length)).map(x => {
        const p = Todo.pInfo(x.priority);
        const st = Todo.sInfo(x.status);
        return `<div class="cal-month-ev ${x.status==='done'?'done':''} ${x.status==='blocked'?'blocked':''}" data-tid="${x.id}" title="${U.esc(x.title)}">
          <i style="background:${x.status==='pending'?p.color:st.color}"></i>
          <span>${x.time ? `<b class="cal-month-ev-time">${U.esc(x.time)}</b>` : ''}${U.esc(x.title)}</span>
        </div>`;
      }).join('');
      const total = evs.length + tds.length;
      if (total > 3) html += `<div class="cal-month-more">+${total - 3} 更多</div>`;
      return html;
    };
    body.innerHTML = `
      <div class="cal-month">
        <div class="cal-month-head">
          ${['日','一','二','三','四','五','六'].map(w => `<div class="cal-month-wd">${w}</div>`).join('')}
        </div>
        <div class="cal-month-grid">
          ${cells.map(dt => {
            const evs = eventsOf(dt), tds = todosOf(dt);
            const out = dt.slice(0, 7) !== mm;
            return `<div class="cal-month-cell ${out?'out':''} ${dt===today?'today':''} ${dt===anchor?'sel':''}" data-day="${dt}">
              <div class="cal-month-dn">${+dt.slice(8)}</div>
              <div class="cal-month-events">${cellEvents(evs, tds)}</div>
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
      if (e.target.closest('[data-eid]')) {
        const x = DB.data.events.find(y => y.id === e.target.closest('[data-eid]').dataset.eid);
        if (x) editEvent(x, render);
        return;
      }
      anchor = c.dataset.day; setView('day', true);
    }));
  }

  /* ---------- 年视图 ---------- */
  function renderYear(body, today) {
    const y = anchor.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${U.pad(i + 1)}-01`);
    const data = months.map(m => {
      const a = m, b = U.monthLast(m);
      // 展开重复：某条 todo/event 只要在当月任一天发生且未在该天完成，即计入当月
      const tds = DB.data.todos.filter(x => {
        const rule = U.recurRuleOf(x.repeat, x.date);
        // 在当月内任一天发生（且当天没被完成）则计入
        for (let d = a; d <= b; d = U.addDays(d, 1)) {
          if (U.recurOccursOn(d, rule) && !(Array.isArray(x.completedDates) && x.completedDates.includes(d))) return true;
        }
        return false;
      }).length;
      const evs = DB.data.events.filter(x => {
        const rule = U.recurRuleOf(x.repeat, x.startDate);
        for (let d = a; d <= b; d = U.addDays(d, 1)) { if (U.recurOccursOn(d, rule)) return true; }
        return false;
      }).length;
      return { m, label: +m.slice(5, 7) + '月', count: tds + evs, events: evs, reminders: tds, a, b };
    });
    const max = Math.max(...data.map(d => d.count), 1);
    body.innerHTML = `
      <div class="cal-year">
        <div class="cal-year-grid">
          ${data.map(d => `
            <div class="cal-year-cell ${d.m.slice(0,7)===today.slice(0,7)?'today':''}" data-m="${d.m}">
              <div class="cal-year-h">${d.label}</div>
              <div class="cal-year-bar" style="height:${Math.max(4, d.count / max * 64)}px"></div>
              <div class="cal-year-meta">${d.count} 项</div>
              <div class="cal-year-sub">${d.events ? d.events + ' 日程 · ' : ''}${d.reminders} 提醒</div>
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
    sub: '个人日程：日 / 周 / 月 / 年视图，同时管理日程与提醒事项',
    render() {
      const saved = DB.data.settings.calendarView;
      if (saved && saved !== view) view = saved;
      anchor = U.today();
      render();
    }
  };
  return { render, setView, editEvent, showAddChoice };
})();
