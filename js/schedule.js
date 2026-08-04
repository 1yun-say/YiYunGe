/* ===== 可视化课表：年 / 月 / 周 ===== */
window.Views = window.Views || {};

const Schedule = (() => {
  const DAY_START = 8 * 60, DAY_END = 23 * 60;   // 8:00 - 23:00，1 分钟 = 1px
  // 电脑端默认月视图（最常用），手机端默认周视图（一眼看一周）
  let mode = U.isMobile() ? 'week' : 'month';
  let anchor = U.today();
  let showImported = DB.data.settings.scheduleShowImported !== false; // 默认显示导入抽成

  /* 数据防御：有用户反馈电脑/平板周视图完全空白。根因疑似个别课程 start 字段缺失/格式错误，
     导致 U.t2m 抛异常、renderWeek 整体失败。以下辅助函数用于过滤/容错。 */
  function validStart(l) { return typeof l.start === 'string' && /^\d{1,2}:\d{2}$/.test(l.start); }
  function safeT2m(l) { return validStart(l) ? U.t2m(l.start) : DAY_START; }
  function safeEndMin(l) { return safeT2m(l) + (+l.duration || 60); }
  const endMin = safeEndMin; // 兼容旧调用

  function includeLesson(l) {
    return l.status !== 'cancelled' && (!l.importedCommission || showImported) && validStart(l);
  }

  // 该学员上一次上课的开始时间（按日期+时间倒序取最近一节）；无历史返回 ''
  function lastStartFor(sid) {
    const ls = DB.data.lessons.filter(l => l.studentId === sid && !l.importedCommission && l.status !== 'cancelled');
    if (!ls.length) return '';
    ls.sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    return ls[0].start || '';
  }

  /* 优先读取学员档案里当前最新的学科信息（课程卡片上的学科/颜色随档案同步），再用课程本身数据兜底 */
  function currentSub(l) {
    const s = DB.student(l.studentId);
    if (s && l.subjectId) {
      const sb = (s.subjects || []).find(x => x.id === l.subjectId);
      if (sb) return { grade: sb.grade || '', subject: sb.subject || '其它', subjectId: l.subjectId };
    }
    if (l.grade || l.subject) return { grade: l.grade || '', subject: l.subject || '其它', subjectId: l.subjectId };
    const ps = s ? DB.primarySubject(s) : { grade: '', subject: '其它' };
    return { grade: ps.grade, subject: ps.subject, subjectId: l.subjectId };
  }

  /* 冲突分组：返回 map lessonId -> {cols, idx, conflict} */
  function layout(list) {
    const res = {};
    const sorted = list.slice().sort((a, b) => safeT2m(a) - safeT2m(b) || String(a.id).localeCompare(String(b.id)));
    let group = [], groupEnd = -1;
    const flush = () => {
      if (!group.length) return;
      const n = group.length;
      group.forEach((l, i) => res[l.id] = { cols: n, idx: i, conflict: n > 1 });
      group = []; groupEnd = -1;
    };
    sorted.forEach(l => {
      const s = safeT2m(l);
      if (group.length && s >= groupEnd) flush();
      group.push(l);
      groupEnd = Math.max(groupEnd, endMin(l));
    });
    flush();
    return res;
  }

  function conflictCount(days) {
    let n = 0;
    days.forEach(d => {
      const ls = DB.data.lessons.filter(l => l.date === d && includeLesson(l));
      const lay = layout(ls);
      const set = new Set();
      Object.entries(lay).forEach(([id, v]) => { if (v.conflict) set.add(id); });
      n += set.size ? 1 : 0;
    });
    return n;
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'schedule') return;
    root.innerHTML = `
      <div class="edit-time"><svg class="ico"><use href="#i-bell"/></svg>上次编辑：${U.fmtTime(DB.data.meta.lastLessonEdit)}</div>
      <div class="sch-toolbar">
        <div class="sch-nav">
          <div class="tabs">
            <button class="tab ${mode === 'year' ? 'active' : ''}" data-m="year">年视图</button>
            <button class="tab ${mode === 'month' ? 'active' : ''}" data-m="month">月视图</button>
            <button class="tab ${mode === 'week' ? 'active' : ''}" data-m="week">周视图</button>
          </div>
          <button class="btn btn-ghost btn-sm" data-act="prev">&#8249;</button>
          <div class="sch-title-wrap">
            <div class="sch-title">${titleText()}</div>
            <button class="btn btn-ghost btn-sm" data-act="today">回到今天</button>
          </div>
          <button class="btn btn-ghost btn-sm" data-act="next">&#8250;</button>
        </div>
        <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
          <span class="muted" style="font-size:12px">${summaryText()}</span>
          <label class="switch-row" style="margin:0;cursor:pointer;font-size:12px;color:var(--ink-2)">
            <input type="checkbox" id="schShowImp" ${showImported ? 'checked' : ''}> 显示导入抽成
          </label>
          ${(mode === 'year' || (U.isMobile() && mode !== 'week')) ? '' : `<button class="btn btn-primary" data-act="book"><svg class="ico"><use href="#i-plus"/></svg>排课</button>`}
        </div>
      </div>
      <div id="schBody"></div>`;

    const body = U.$('#schBody', root);
    if (mode === 'week') renderWeek(body);
    else if (mode === 'month') renderMonth(body);
    else renderYear(body);

    root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      mode = b.dataset.m;
      DB.data.settings.scheduleMode = mode; DB.save();
      render();
    });
    const si = U.$('#schShowImp', root);
    if (si) si.onchange = e => { showImported = e.target.checked; DB.data.settings.scheduleShowImported = showImported; DB.save(); render(); };
    U.rebind(root, 'sch', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const step = { week: 7, month: 0, year: 0 };
      if (a.dataset.act === 'prev') anchor = mode === 'week' ? U.addDays(anchor, -7) : mode === 'month' ? U.addMonths(U.monthFirst(anchor), -1) : U.addMonths(anchor, -12);
      if (a.dataset.act === 'next') anchor = mode === 'week' ? U.addDays(anchor, 7) : mode === 'month' ? U.addMonths(U.monthFirst(anchor), 1) : U.addMonths(anchor, 12);
      if (a.dataset.act === 'today') anchor = U.today();
      if (a.dataset.act === 'book') { book(null); return; }
      render();
    });
  }

  function titleText() {
    if (mode === 'week') {
      const d = U.weekDays(anchor);
      return `${d[0].replace(/-/g, '.')} — ${d[6].slice(5).replace('-', '.')}`;
    }
    if (mode === 'month') return `${anchor.slice(0, 4)} 年 ${+anchor.slice(5, 7)} 月`;
    return `${anchor.slice(0, 4)} 年`;
  }

  function summaryText() {
    let a, b;
    if (mode === 'week') { const d = U.weekDays(anchor); a = d[0]; b = d[6]; }
    else if (mode === 'month') { a = U.monthFirst(anchor); b = U.monthLast(anchor); }
    else { a = U.yearFirst(anchor); b = U.yearLast(anchor); }
    const all = DB.lessonsIn(a, b).filter(l => includeLesson(l));
    const s = all.filter(l => l.status === 'done');
    const gross = s.reduce((x, l) => x + (+l.tuition || 0), 0);
    const profit = s.reduce((x, l) => x + DB.lessonBreakdown(l).takeHome, 0);
    const pub = App.isPublic();
    return `${all.length} 节课 · 流水 ${U.money(gross)}` + (pub ? '' : ` · 实际到手 ${U.money(profit)}`);
  }

  /* ---------- 周视图 ---------- */
  function renderWeek(box) {
    try {
      if (U.isMobile()) { renderWeekMobile(box); return; }
      const days = U.weekDays(anchor), t = U.today();
      const slots = [];
      for (let m = DAY_START; m < DAY_END; m += 30) slots.push(m);

      box.innerHTML = `
      <div class="week-wrap">
        <div class="week-head">
          <div class="wh-cell"></div>
          ${days.map(d => `<div class="wh-cell ${d === t ? 'today' : ''}">${U.wdName(d)}<b>${+d.slice(8)}</b></div>`).join('')}
        </div>
        <div class="week-body">
          <div class="time-col">${slots.map(m => `<div class="time-slot">${m % 60 === 0 ? U.m2t(m) : ''}</div>`).join('')}</div>
          ${days.map(d => `<div class="day-col ${d === t ? 'today' : ''}" data-date="${d}">
              ${slots.map(m => `<div class="slot" data-date="${d}" data-min="${m}"></div>`).join('')}
              ${dayLessonsHTML(d)}
            </div>`).join('')}
        </div>
      </div>
      <div class="legend">
        ${Object.entries(U.SUBJECT_COLORS).slice(0, 8).map(([k, v]) => `<span><i style="background:${U.subColor(k)}"></i>${k}</span>`).join('')}
      </div>`;

      bindWeek(box);
    } catch (e) {
      console.error('renderWeek error', e);
      box.innerHTML = `<div class="card" style="border-color:var(--alert);background:#fff3f3;padding:18px 20px;margin-top:10px">
        <h4 style="color:var(--alert);margin-bottom:8px">可视化课表渲染出错</h4>
        <p style="color:var(--ink-1);margin-bottom:8px;word-break:break-word">${U.esc(e.message || String(e))}</p>
        <p style="font-size:12px;color:var(--ink-3)">常见原因：最近添加或导入的课程「上课时间」格式不对（应为 08:00、14:30 等 HH:MM）。<br>请检查「学员档案 → 课程记录」，或尝试「数据管理 → 导出备份」后联系我排查。</p>
      </div>`;
    }
  }

  /* 手机端周视图：iOS 风格「按天议程清单」，避免 7 列时间轴在窄屏挤压、重叠 */
  function renderWeekMobile(box) {
    try {
      const days = U.weekDays(anchor), t = U.today();
      box.innerHTML = `<div class="cal-week-list">
        ${days.map(d => {
          const ls = DB.data.lessons.filter(l => l.date === d && includeLesson(l))
            .sort((a, b) => safeT2m(a) - safeT2m(b));
          const isToday = d === t, isSel = d === anchor;
          return `<div class="cal-week-row">
            <div class="cal-week-dayhead ${isToday ? 'today' : ''} ${isSel ? 'sel' : ''}" style="cursor:default">
              <span class="wd">${U.wdName(d)}</span><span class="dn">${+d.slice(8)}</span>
              <span class="cnt">${ls.length ? ls.length + ' 节' : '无'}</span>
            </div>
            ${ls.length ? ls.map(l => lessonCardMobile(l)).join('') : '<div class="cal-empty-mini">这天没课</div>'}
          </div>`;
        }).join('')}
      </div>`;
      box.querySelectorAll('.sch-lesson-card').forEach(el => el.addEventListener('click', () => editLesson(el.dataset.lid)));
    } catch (e) {
      console.error('renderWeekMobile error', e);
      box.innerHTML = `<div class="card" style="border-color:var(--alert);background:#fff3f3;padding:18px 20px;margin-top:10px">
        <h4 style="color:var(--alert);margin-bottom:8px">周视图渲染出错</h4>
        <p style="color:var(--ink-1);margin-bottom:8px;word-break:break-word">${U.esc(e.message || String(e))}</p>
        <p style="font-size:12px;color:var(--ink-3)">常见原因：某条课程记录的上「上课时间」格式不对（应为 HH:MM）。请检查课程记录或「数据管理 → 导出备份」后联系我排查。</p>
      </div>`;
    }
  }

  function lessonCardMobile(l) {
    const s = DB.student(l.studentId) || { parentName: '已删除' };
    const isImp = !!l.importedCommission;
    const bd = DB.lessonBreakdown(l);
    const sub = currentSub(l);
    const c = isImp ? '#b0b0b0' : U.subColor(sub.subject);
    const pub = App.isPublic();
    return `<div class="sch-lesson-card ${l.status} ${isImp ? 'imported' : ''}" data-lid="${l.id}"
        style="border-left-color:${c};background:${isImp ? '#f5f5f5' : rgba(c, .12)}">
      <div class="slc-top"><span class="slc-time">${l.start}-${U.m2t(endMin(l))}</span>${isImp ? '<span class="bill-imp-tag">导入</span>' : ''}</div>
      <div class="slc-name">${U.esc(s.parentName)} · ${U.esc(sub.subject || '未设科目')}</div>
      <div class="slc-meta">${U.money(l.tuition)}${pub ? '' : ' ｜ 到手 ' + U.money(bd.takeHome)}${l.status === 'done' ? ' · 已完成' : ''}</div>
    </div>`;
  }

  function overlapGroups(ls) {
    const sorted = ls.slice().sort((a, b) => safeT2m(a) - safeT2m(b) || String(a.id).localeCompare(String(b.id)));
    const groups = []; let g = [], end = -1;
    sorted.forEach(l => {
      const s = safeT2m(l);
      if (g.length && s >= end) { groups.push(g); g = []; end = -1; }
      g.push(l); end = Math.max(end, endMin(l));
    });
    if (g.length) groups.push(g);
    return groups;
  }

  /* 周视图课块颜色：固定淡色（轻盈通透），导入课用中性灰 */
  function morandiColor(l){
    if(l.importedCommission) return '#b0b0b0';
    const sub=currentSub(l);
    return U.WEEK_MUTED[sub.subject] || U.WEEK_MUTED['其它'];
  }

  /* 把 #RRGGBB 转成 rgba，避免 #RRGGBBAA 在老 Safari / 部分浏览器上失效导致背景变纯白看不见 */
  function rgba(hex, a){
    const v = hex.replace('#', '');
    const r = parseInt(v.slice(0,2), 16), g = parseInt(v.slice(2,4), 16), b = parseInt(v.slice(4,6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function nameOf(l) {
    const s = DB.student(l.studentId) || { parentName: '已删除' };
    const sub = currentSub(l);
    return `${U.esc(s.parentName)} · ${U.esc(sub.subject || '未设科目')}`;
  }

  function lessonBar(l, conflict, isM, pub) {
    const s = DB.student(l.studentId) || { parentName: '已删除' };
    const isImp = !!l.importedCommission;
    const bd = DB.lessonBreakdown(l);
    const top = safeT2m(l) - DAY_START;
    const h = Math.max(24, +l.duration || 60);
    const sub = currentSub(l);
    const timeLine = `<div class="lm">${l.start}-${U.m2t(endMin(l))} · ${U.money(l.tuition)}${pub ? '' : ` <span style="color:var(--pink-600)">到手${U.money(bd.takeHome)}</span>`}</div>`;
    if (isImp) {
      return `<div class="lesson imported ${conflict ? 'conflict' : ''} ${l.status}" draggable="false" data-lid="${l.id}"
        style="top:${top}px;height:${h}px;left:2px;width:calc(100% - 4px);z-index:${conflict ? 3 : 2};
        border-left-color:#b9b2a8;background:${conflict ? 'rgba(185,178,168,.62)' : 'rgba(245,245,245,.85)'};color:#666">
        ${conflict ? '' : `<b>${U.esc(s.parentName)}</b>`}
        ${timeLine}
        ${conflict ? '' : `<div class="lm take">到手 ${U.money(bd.takeHome)}${l.incomeNote ? ' · 批注：' + U.esc(l.incomeNote) : ''}</div>`}
      </div>`;
    }
    const c = morandiColor(l);
    const bg = conflict ? rgba(c, .55) : rgba(c, .32);
    return `<div class="lesson ${l.status} ${conflict ? 'conflict' : ''}" draggable="${isM ? 'false' : 'true'}" data-lid="${l.id}"
      style="top:${top}px;height:${h}px;left:2px;width:calc(100% - 4px);z-index:${conflict ? 3 : 2};
      border-left-color:${c};background:${bg}">
      ${conflict ? '' : `<b>${U.esc(s.parentName)}</b>`}
      ${conflict ? '' : timeLine + (h > 62 ? `<div class="lm">${U.esc(DB.teacherName(l.teacherId))}${l.status === 'done' ? ' · 已完成' : ''}</div>` : '') + `<div class="lm take">到手 ${U.money(bd.takeHome)}${l.incomeNote ? ' · 批注：' + U.esc(l.incomeNote) : ''}</div>`}
    </div>`;
  }

  function dayLessonsHTML(date) {
    const ls = DB.data.lessons.filter(l => l.date === date && includeLesson(l));
    const isM = U.isMobile();
    const pub = App.isPublic();
    const groups = overlapGroups(ls);
    let html = '';
    groups.forEach(g => {
      if (g.length === 1) { html += lessonBar(g[0], false, isM, pub); return; }
      // 每节课占满整列（莫兰迪色，半透明）
      g.forEach(l => { html += lessonBar(l, true, isM, pub); });
      // 重叠区：两两之间画竖直渐变（上方课色 → 下方课色），形成三色过渡
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const a = g[i], b = g[j];
        const s = Math.max(safeT2m(a), safeT2m(b));
        const e = Math.min(endMin(a), endMin(b));
        if (e > s) {
          const ca = morandiColor(a), cb = morandiColor(b);
          html += `<div class="lesson-overlap" style="top:${s - DAY_START}px;height:${e - s}px;left:2px;width:calc(100% - 4px);background:linear-gradient(to bottom, ${rgba(ca, .7)}, ${rgba(cb, .7)})"></div>`;
        }
      }
      // 课程名写到各自「非重叠」区域
      g.forEach(l => {
        const s = safeT2m(l), e = endMin(l);
        let ovs = [];
        g.forEach(o => { if (o.id === l.id) return; const os = Math.max(s, safeT2m(o)), oe = Math.min(e, endMin(o)); if (oe > os) ovs.push([os, oe]); });
        ovs.sort((x, y) => x[0] - y[0]);
        let ex = [[s, e]];
        ovs.forEach(([a, b]) => {
          const n = [];
          ex.forEach(([x0, x1]) => {
            if (b <= x0 || a >= x1) n.push([x0, x1]);
            else { if (a > x0) n.push([x0, a]); if (b < x1) n.push([b, x1]); }
          });
          ex = n;
        });
        ex.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]));
        let placed = false;
        for (const [a, b] of ex) {
          if (b - a >= 18) { html += `<div class="lesson-namechip" style="top:${a - DAY_START + 1}px;left:5px;right:5px">${nameOf(l)}</div>`; placed = true; break; }
        }
        if (!placed) html += `<div class="lesson-namechip solid" style="top:${s - DAY_START + 1}px;left:5px;right:5px">${nameOf(l)}</div>`;
      });
    });
    return html;
  }

  function bindWeek(box) {
    let dragId = null;
    box.querySelectorAll('.lesson').forEach(el => {
      el.addEventListener('click', () => editLesson(el.dataset.lid));
      el.addEventListener('dragstart', e => {
        dragId = el.dataset.lid; el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { }
      });
      el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragId = null; });
    });
    box.querySelectorAll('.slot').forEach(sl => {
      sl.addEventListener('dragover', e => { e.preventDefault(); sl.classList.add('drop'); });
      sl.addEventListener('dragleave', () => sl.classList.remove('drop'));
      sl.addEventListener('drop', e => {
        e.preventDefault(); sl.classList.remove('drop');
        const id = dragId || e.dataTransfer.getData('text/plain');
        const l = DB.data.lessons.find(x => x.id === id); if (!l) return;
        l.date = sl.dataset.date; l.start = U.m2t(+sl.dataset.min); l.seriesId = null;
        DB.save(); render();
        const c = overlaps(l);
        U.toast(c.length ? `已移动到 ${U.cnDate(l.date)} ${l.start}，与 ${c.length} 节课时间重叠` : `已移动到 ${U.cnDate(l.date)} ${l.start}`, c.length ? 'warn' : 'ok');
      });
      sl.addEventListener('dblclick', () => book(null, { date: sl.dataset.date, start: U.m2t(+sl.dataset.min) }));
    });
  }

  function overlaps(l) {
    return DB.data.lessons.filter(x => x.id !== l.id && x.date === l.date && x.status !== 'cancelled'
      && safeT2m(x) < endMin(l) && endMin(x) > safeT2m(l));
  }

  /* ---------- 月视图 ---------- */
  function renderMonth(box) {
    const first = U.monthFirst(anchor), last = U.monthLast(anchor);
    const start = U.mondayOf(first);
    const cells = [];
    let d = start;
    while (d <= last || cells.length % 7 !== 0) { cells.push(d); d = U.addDays(d, 1); if (cells.length > 41) break; }
    const t = U.today(), mm = anchor.slice(0, 7);
    const pub = App.isPublic();

    box.innerHTML = `<div class="month-grid">
      ${U.WD.slice(1).concat(U.WD[0]).map(w => `<div class="mg-head">${w}</div>`).join('')}
      ${cells.map(day => {
      const ls = DB.data.lessons.filter(l => l.date === day && includeLesson(l))
        .sort((a, b) => safeT2m(a) - safeT2m(b));
      const profit = ls.reduce((s, l) => s + DB.lessonBreakdown(l).takeHome, 0);
      const gross = ls.reduce((s, l) => s + (+l.tuition || 0), 0);
      return `<div class="mg-cell ${day.slice(0, 7) !== mm ? 'out' : ''} ${day === t ? 'today' : ''}" data-day="${day}">
          <div class="mg-date">${+day.slice(8)}</div>
          ${ls.slice(0, U.isMobile() ? 2 : 3).map(l => {
        const s = DB.student(l.studentId) || { parentName: '?' };
        const isImp = !!l.importedCommission;
        const sub = currentSub(l);
        const c = isImp ? '#b0b0b0' : U.subColor(sub.subject);
        const bd = DB.lessonBreakdown(l);
        const tip = `实际到手 ${U.money(bd.takeHome)} · ${U.esc(bd.note)}`;
        return `<div class="mg-item ${isImp ? 'imported' : ''}" data-lid="${l.id}" title="${tip}" style="border-left-color:${c};background:${isImp ? '#f5f5f5' : rgba(c, .12)}">
            ${isImp ? '· ' : l.start + ' '}${U.esc(s.parentName)}</div>`;
      }).join('')}
          ${ls.length > (U.isMobile() ? 2 : 3) ? `<div class="mg-item" style="border-left-color:#ccc;background:#f6f2f4">+${ls.length - (U.isMobile() ? 2 : 3)} 节</div>` : ''}
          ${ls.length ? `<div class="mg-sum ${pub ? '' : 'secret'}">${pub ? U.money(gross) : U.money(profit)}</div>` : ''}
        </div>`;
    }).join('')}
    </div>
    <p class="muted" style="font-size:11.5px;margin-top:10px">
      右下角金额：${pub ? '当日课时费流水' : '当日实际到手'}；点击日期格进入该周视图，双击空白处快速排课。</p>`;

    box.querySelectorAll('.mg-cell').forEach(c => {
      c.addEventListener('click', e => {
        const it = e.target.closest('.mg-item');
        if (it && it.dataset.lid) { editLesson(it.dataset.lid); return; }
        anchor = c.dataset.day; mode = 'week'; render();
      });
      c.addEventListener('dblclick', () => book(null, { date: c.dataset.day }));
    });
  }

  /* ---------- 年视图 ---------- */
  function renderYear(box) {
    const y = anchor.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${U.pad(i + 1)}-01`);
      const data = months.map(m => {
      const a = m, b = U.monthLast(m);
      const ls = DB.lessonsIn(a, b).filter(l => includeLesson(l));
      const s = ls.filter(l => l.status === 'done');
      const gross = s.reduce((x, l) => x + (+l.tuition || 0), 0);
      const commission = s.reduce((x, l) => x + (+l.commission || 0), 0);
      const reimb = s.reduce((x, l) => x + DB.lessonBreakdown(l).reimb, 0);
      const profit = s.reduce((x, l) => x + DB.lessonBreakdown(l).takeHome, 0);
      return { m, label: +m.slice(5, 7) + '月', count: ls.length, gross, commission, reimb, profit, a, b };
    });
    const maxC = Math.max(...data.map(d => d.count), 1);
    const pub = App.isPublic();
    const totalC = data.reduce((s, d) => s + d.count, 0);
    const totalG = data.reduce((s, d) => s + d.gross, 0);
    const totalCommission = data.reduce((s, d) => s + d.commission, 0);
    const totalReimb = data.reduce((s, d) => s + d.reimb, 0);
    const totalP = data.reduce((s, d) => s + d.profit, 0);

    box.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">
      <div class="stat"><div class="lab">${y} 年总课时</div><div class="val">${totalC}</div><div class="sub">节</div></div>
      <div class="stat"><div class="lab">我的抽成</div><div class="val">${U.money(totalCommission)}</div></div>
      <div class="stat hl secret"><div class="lab">全年实际到手</div><div class="val">${U.money(totalP)}</div>
        <div class="sub">占流水 ${totalG ? Math.round(totalP / totalG * 100) : 0}%</div></div>
      <div class="stat secret"><div class="lab">全年报销支出</div><div class="val">${U.money(totalReimb)}</div></div>
    </div>
    <div class="year-grid">
      ${data.map(d => {
      const days = [];
      let cur = d.a;
      while (cur <= d.b) { days.push(DB.data.lessons.filter(l => l.date === cur && includeLesson(l)).length); cur = U.addDays(cur, 1); }
      const maxD = Math.max(...days, 1);
      return `<div class="ym-card" data-m="${d.m}">
          <h4>${d.label}<span class="muted" style="font-size:11px">${d.count} 节</span></h4>
          <div class="ym-bar"><i style="width:${d.count / maxC * 100}%"></i></div>
          <div style="display:flex;justify-content:space-between;font-size:11.5px">
            <span class="muted">流水 ${U.money(d.gross)}</span>
            <b class="money in secret">到手 ${U.money(d.profit)}</b>
          </div>
          <div class="ym-mini">${days.map(n => `<div class="ym-dot" title="${n} 节"
            style="background:${n ? `rgba(249,112,157,${0.22 + 0.78 * n / maxD})` : '#fff2f7'}"></div>`).join('')}</div>
        </div>`;
    }).join('')}
    </div>`;

    box.querySelectorAll('.ym-card').forEach(c => c.onclick = () => { anchor = c.dataset.m; mode = 'month'; render(); });
  }

  /* ---------- 排课 ---------- */
  const WD_SHORT = ['日', '一', '二', '三', '四', '五', '六'];
  function genDates(mode, wds, start, weeks) {
    if (mode === 'none') return [start];
    if (mode === 'contig') return Array.from({ length: weeks }, (_, i) => U.addDays(start, i * 7));
    const step = mode === 'biweek' ? 2 : 1;
    const base = U.mondayOf(start);
    const wdset = mode === 'contig' ? [U.dow(start)] : wds;
    const out = [];
    for (let w = 0; w < weeks; w += step) {
      wdset.forEach(wd => {
        const d = U.addDays(base, w * 7 + (wd + 6) % 7);
        if (d >= start) out.push(d);
      });
    }
    return out.sort();
  }

  function book(studentId, preset = {}, done) {
    const stus = DB.data.students.filter(s => s.status !== 'ended');
    if (!stus.length) { U.toast('请先创建学员档案', 'warn'); return; }
    const sid = studentId || stus[0].id;
    const cur = DB.student(sid);
    const subs = DB.studentSubjects(cur);
    const fixed0 = (subs[0] || {}).fixed || [];
    const presetWds = fixed0.map(f => f.wd);
    const initMode = fixed0.length ? 'week' : 'none';
    const initStart = preset.start || (fixed0.length ? fixed0[0].start : (lastStartFor(sid) || '19:00'));
    U.modal({
      title: '排课', okText: '确认排课',
      body: `
      <div class="field"><label>学员</label>
        <select class="input" id="f_s">${stus.map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${U.esc(s.parentName)}（${DB.studentSubjects(s).map(x => x.grade + x.subject).join('/')}）</option>`).join('')}</select></div>
      <div class="field"><label>学科</label>
        <select class="input" id="f_sub">${subs.map(sb => `<option value="${sb.id}" ${sb.id === (subs[0] || {}).id ? 'selected' : ''}>${U.esc(sb.grade + sb.subject)} · ${U.money(sb.tuition)}/${sb.duration}分</option>`).join('')}</select></div>
      <div class="row">
        <div class="field"><label>开始日期</label><input type="date" class="input" id="f_d" value="${preset.date || U.today()}"></div>
        <div class="field"><label>开始时间</label><input type="time" class="input" id="f_t" value="${initStart}" step="900"></div>
        <div class="field"><label>时长（分钟）</label><input type="number" class="input" id="f_len" value="${subs[0] ? subs[0].duration : 60}" min="15" step="15"></div>
      </div>
      <div class="field"><label>重复方式</label>
        <select class="input" id="f_rep">
          <option value="none">不重复（仅这一次）</option>
          <option value="week" ${fixed0.length ? 'selected' : ''}>每周（自选星期）</option>
          <option value="biweek">每两周（自选星期）</option>
          <option value="contig">连续 N 周（同一星期）</option>
        </select></div>
      <div class="field" id="wdWrap" style="display:${fixed0.length ? 'flex' : 'none'};flex-wrap:wrap;gap:10px;align-items:center">
        <span class="hint" style="width:100%">选择每周哪些天上课（可多选）：</span>
        ${[1, 2, 3, 4, 5, 6, 0].map(wd => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer">
          <input type="checkbox" class="wd-chk" value="${wd}" ${presetWds.includes(wd) ? 'checked' : ''}>周${WD_SHORT[wd]}</label>`).join('')}
      </div>
      <div class="field" id="weeksWrap" style="display:${fixed0.length ? 'flex' : 'none'}"><label>重复周数</label><input type="number" class="input" id="f_weeks" value="12" min="1" max="52" style="width:120px"></div>
      <div class="field"><label class="switch-row" style="margin:0;cursor:pointer">
        <input type="checkbox" id="f_fixed" ${fixed0.length ? 'checked' : ''}> 设为该学员该科「固定上课时间」（下次排课本科自动带出）</label></div>
      <div class="field secret"><label>批注（报销支出）</label><input class="input" id="f_inote" placeholder="如：买资料50、交通30（数字自动算作报销支出）"></div>
      <div class="row">
        <div class="field"><label>状态</label>
          <select class="input" id="f_st"><option value="scheduled">待上课</option><option value="done">已完成</option></select></div>
        <div class="field"><label>课堂备注 / 反馈</label><input class="input" id="f_n" placeholder="选填，如：本次讲解期中卷"></div>
      </div>
      <div id="conf"></div>`,
      onOk: b => {
        const stu = DB.student(U.$('#f_s', b).value);
        const sub = (stu.subjects || []).find(x => x.id === U.$('#f_sub', b).value) || DB.studentSubjects(stu)[0];
        if (!sub) { U.toast('请选择学科', 'warn'); return false; }
        const d0 = U.$('#f_d', b).value, t0 = U.$('#f_t', b).value;
        const len = +U.$('#f_len', b).value || sub.duration || 60;
        const mode = U.$('#f_rep', b).value;
        if (!d0 || !t0) { U.toast('请填写日期与时间', 'warn'); return false; }
        let wds = [], weeks = 1;
        if (mode === 'week' || mode === 'biweek') {
          wds = Array.from(b.querySelectorAll('.wd-chk')).filter(c => c.checked).map(c => +c.value);
          if (!wds.length) { U.toast('请至少勾选一个上课星期', 'warn'); return false; }
          weeks = +U.$('#f_weeks', b).value || 12;
        } else if (mode === 'contig') {
          weeks = +U.$('#f_weeks', b).value || 12;
        }
        const dates = genDates(mode, wds, d0, weeks);
        const seriesId = (mode !== 'none' && dates.length > 1) ? U.uid('ser') : null;
        const incomeNote = U.$('#f_inote', b).value.trim();
        let conf = 0;
        dates.forEach(date => {
          const l = {
            id: U.uid('les'), studentId: stu.id, subjectId: sub.id,
            grade: sub.grade, subject: sub.subject,
            date, start: t0, duration: len,
            tuition: sub.tuition, commission: sub.commission, teacherId: stu.teacherId,
            status: U.$('#f_st', b).value, note: U.$('#f_n', b).value.trim(), seriesId,
            incomeNote
          };
          if (overlaps(l).length) conf++;
          DB.data.lessons.push(l);
        });
        if (U.$('#f_fixed', b).checked && (mode === 'week' || mode === 'biweek')) {
          sub.fixed = wds.map(wd => ({ wd, start: t0, duration: len }));
        }
        DB.save(); DB.touch('lesson'); render(); if (done) done();
        U.toast(conf ? `已排 ${dates.length} 节课，其中 ${conf} 节与其它课时间重叠` : `已排 ${dates.length} 节课`, conf ? 'warn' : 'ok');
      }
    }).body.addEventListener('change', e => {
      const rep = U.$('#f_rep'), wdWrap = U.$('#wdWrap'), weeksWrap = U.$('#weeksWrap');
      if (e.target.id === 'f_s') {
        const stu = DB.student(e.target.value);
        const sb = DB.studentSubjects(stu)[0] || {};
        U.$('#f_sub').innerHTML = DB.studentSubjects(stu).map(x => `<option value="${x.id}">${U.esc(x.grade + x.subject)} · ${U.money(x.tuition)}/${x.duration}分</option>`).join('');
        const fx = sb.fixed || [];
        if (fx.length) {
          rep.value = 'week';
          U.$('#wdWrap').querySelectorAll('.wd-chk').forEach(c => c.checked = fx.some(f => +f.wd === +c.value));
          U.$('#f_fixed').checked = true;
          U.$('#f_t').value = fx[0].start; U.$('#f_len').value = fx[0].duration;
        } else {
          U.$('#f_fixed').checked = false;
          U.$('#f_len').value = sb.duration || 60;
          const ls0 = lastStartFor(stu.id);
          if (ls0) U.$('#f_t').value = ls0;
        }
      }
      if (rep) {
        const showWd = rep.value === 'week' || rep.value === 'biweek';
        if (wdWrap) wdWrap.style.display = showWd ? 'flex' : 'none';
        if (weeksWrap) weeksWrap.style.display = (rep.value === 'week' || rep.value === 'biweek' || rep.value === 'contig') ? 'flex' : 'none';
      }
    });
  }

  function bookFor(sid, cb) { book(sid, {}, cb); }

  /* ---------- 编辑单节课 ---------- */
  function editLesson(id) {
    const l = DB.data.lessons.find(x => x.id === id); if (!l) return;
    const s = DB.student(l.studentId) || { parentName: '已删除学员', id: '' };
    const sub = currentSub(l);
    const ov = overlaps(l);
    const future = l.seriesId ? DB.data.lessons.filter(x => x.seriesId === l.seriesId && x.date >= l.date && x.id !== l.id) : [];
    const mm = U.modal({
      title: `${sub.grade}${sub.subject} · ${s.parentName}`,
      body: `
      ${future.length ? `<div class="field" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
        <label style="font-size:13px">这是重复课程，本次修改范围：</label>
        <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer"><input type="radio" name="scope" value="once" checked> 仅此一次（调课 / 临时改，日期可改）</label>
        <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer"><input type="radio" name="scope" value="future"> 从此以后（含今天及之后，永久改时间/费用；日期不移动）</label>
      </div>` : ''}
      ${ov.length ? `<div class="tag alert" style="margin-bottom:11px">该时段与 ${ov.length} 节课重叠：${ov.map(x => {
        const y = DB.student(x.studentId) || {}; return U.esc((y.parentName || '?') + ' ' + x.start);
      }).join('、')}</div>` : ''}
      <div class="row">
        <div class="field"><label>日期</label><input type="date" class="input" id="f_d" value="${l.date}"></div>
        <div class="field"><label>开始时间</label><input type="time" class="input" id="f_t" value="${l.start}" step="900"></div>
        <div class="field"><label>时长</label><input type="number" class="input" id="f_len" value="${l.duration}" min="15" step="15"></div>
      </div>
      <div class="row">
        <div class="field"><label>课时费（家长端）</label><input type="number" class="input" id="f_fee" value="${l.tuition}"></div>
        <div class="field secret"><label>我的抽成</label><input type="number" class="input" id="f_com" value="${l.commission}"></div>
        <div class="field"><label>状态</label><select class="input" id="f_st">
          <option value="scheduled" ${l.status === 'scheduled' ? 'selected' : ''}>待上课</option>
          <option value="done" ${l.status === 'done' ? 'selected' : ''}>已完成</option>
          <option value="cancelled" ${l.status === 'cancelled' ? 'selected' : ''}>已取消 / 请假</option>
        </select></div>
      </div>
      <div class="field secret"><label>批注（报销支出）</label><input class="input" id="f_inote" placeholder="如：买资料50、交通30（数字自动算作报销支出）" value="${U.esc(l.incomeNote || '')}"></div>
      <div class="field"><label>授课老师</label><select class="input" id="f_tid">
        ${DB.data.teachers.map(t => `<option value="${t.id}" ${t.id === l.teacherId ? 'selected' : ''}>${U.esc(t.name)}</option>`).join('')}
        <option value="" ${!l.teacherId ? 'selected' : ''}>未指派</option></select></div>
      <div class="field"><label>课堂备注 / 反馈</label><textarea class="input" id="f_n">${U.esc(l.note || '')}</textarea></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="btnDone">标记完成</button>
        <button class="btn btn-danger btn-sm" id="btnDel">删除这节课</button>
      </div>`,
      onOk: b => {
        const scope = future.length ? (b.querySelector('input[name="scope"]:checked') || {}).value || 'once' : 'once';
        const set = scope === 'future' ? [l, ...future] : [l];
        const date = U.$('#f_d', b).value, start = U.$('#f_t', b).value;
        const dur = +U.$('#f_len', b).value || l.duration;
        const fee = +U.$('#f_fee', b).value || 0;
        const com = +U.$('#f_com', b).value || 0;
        const incomeNote = U.$('#f_inote', b).value.trim();
        const st = U.$('#f_st', b).value, tid = U.$('#f_tid', b).value, note = U.$('#f_n', b).value.trim();
        set.forEach(x => {
          x.start = start; x.duration = dur; x.tuition = fee; x.commission = com; x.status = st; x.teacherId = tid; x.note = note;
          x.incomeNote = incomeNote;
          if (scope === 'once') { x.date = date; x.seriesId = null; }  // 仅此一次：日期也改，并脱离系列
        });
        DB.save(); DB.touch('lesson'); render(); U.toast(scope === 'future' ? '已应用到此后所有同一重复课程' : '已保存');
      }
    });
    mm.body.addEventListener('click', e => {
      if (e.target.id === 'btnDone') { l.status = 'done'; DB.save(); DB.touch('lesson'); render(); U.toast('已标记完成'); e.target.closest('.mask').remove(); }
      if (e.target.id === 'btnDel') {
        DB.data.lessons = DB.data.lessons.filter(x => x.id !== l.id); DB.save(); DB.touch('lesson'); render();
        U.toast('已删除'); e.target.closest('.mask').remove();
      }
    });
    // 选「从此以后」时禁用日期（保持各节原日期），仅改时间/费用
    if (future.length) mm.body.addEventListener('change', e => {
      if (e.target.name === 'scope') { const d = U.$('#f_d', mm.body); if (d) d.disabled = (e.target.value === 'future'); }
    });
  }

  Views.schedule = {
    title: '可视化课表',
    sub: '年 / 月 / 周视图自由切换，重叠课程自动并排提示',
    render() {
      const saved = DB.data.settings.scheduleMode;
      if (saved && (saved === 'year' || saved === 'month' || saved === 'week')) mode = saved;
      showImported = DB.data.settings.scheduleShowImported !== false;
      anchor = U.today(); render();
    }
  };

  return { render, book, bookFor, editLesson, overlaps, layout, goto(d, m) { anchor = d; mode = m || 'week'; } };
})();
