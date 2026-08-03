/* ===== 学员档案 ===== */
window.Views = window.Views || {};

const Students = (() => {
  const STATUS = {
    trial: { name: '试课中', cls: 'gold' },
    active: { name: '在读', cls: 'leaf' },
    paused: { name: '暂停', cls: 'sky' },
    ended: { name: '已结课', cls: 'gray' }
  };
  let kw = '', tab = 'all';

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'students') return;
    const pub = App.isPublic();
    let list = DB.data.students.slice().sort((a, b) => (b.signDate || '').localeCompare(a.signDate || ''));
    if (tab !== 'all') list = list.filter(s => s.status === tab);
    if (kw) {
      const k = kw.toLowerCase();
      const kwFields = s => {
        const subs = DB.studentSubjects(s);
        return (s.code + s.parentName + s.studentName + s.note + DB.teacherName(s.teacherId) + subs.map(x => x.grade + x.subject).join('')).toLowerCase();
      };
      list = list.filter(s => kwFields(s).includes(k));
    }
    const all = DB.data.students;
    const cnt = st => all.filter(s => s.status === st).length;

    root.innerHTML = `
    <div class="sch-toolbar">
      <div class="tabs">
        <button class="tab ${tab === 'all' ? 'active' : ''}" data-tab="all">全部 ${all.length}</button>
        <button class="tab ${tab === 'active' ? 'active' : ''}" data-tab="active">在读 ${cnt('active')}</button>
        <button class="tab ${tab === 'trial' ? 'active' : ''}" data-tab="trial">试课中 ${cnt('trial')}</button>
        <button class="tab ${tab === 'paused' ? 'active' : ''}" data-tab="paused">暂停 ${cnt('paused')}</button>
        <button class="tab ${tab === 'ended' ? 'active' : ''}" data-tab="ended">结课 ${cnt('ended')}</button>
      </div>
      <div style="display:flex;gap:9px;align-items:center">
        <input class="input" id="stuKw" style="width:220px" placeholder="搜索家长 / 年级 / 学科 / 老师" value="${U.esc(kw)}">
        <button class="btn btn-primary" data-act="new"><svg class="ico"><use href="#i-plus"/></svg>新建档案</button>
      </div>
    </div>

    ${list.length ? `<div class="stu-grid">${list.map(cardHTML).join('')}</div>`
        : `<div class="card"><div class="empty">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><use href="#i-user"/></svg>
             <p>没有匹配的学员档案</p>
             <button class="btn btn-primary" style="margin-top:12px" data-act="new">按格式新建一个</button></div></div>`}`;

    const kwIn = U.$('#stuKw', root);
    let composing = false;
    kwIn.addEventListener('compositionstart', () => composing = true);
    kwIn.addEventListener('compositionend', () => { composing = false; kwIn.dispatchEvent(new Event('input')); });
    kwIn.addEventListener('input', () => {
      if (composing) return;
      kw = kwIn.value;
      const pos = kwIn.selectionStart; render();
      const i = U.$('#stuKw'); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
    });
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    U.rebind(root, 'students', onClick);
  }

  function cardHTML(s) {
    const pub = App.isPublic();
    const st = STATUS[s.status] || STATUS.active;
    const subs = DB.studentSubjects(s);
    const c = U.subColor((subs[0] || {}).subject || '其它');
    const stat = statOf(s);
    return `<div class="stu-card ${s.status}" data-id="${s.id}">
      <div class="stu-top">
        <div class="stu-name">
          <span style="width:9px;height:9px;border-radius:50%;background:${c};flex:none"></span>
          ${U.esc(s.parentName)}
          <span class="tag ${st.cls}">${st.name}</span>
        </div>
        <div class="stu-code mono">${U.esc(s.code)}</div>
      </div>
      <div class="stu-body">
        ${subs.map(sb => `<div class="kv"><span class="k">${U.esc(sb.grade)}${U.esc(sb.subject)}</span>
          <b class="money">${U.money(sb.tuition)} / ${sb.duration}分</b>
          <span class="tag secret" style="background:#ffe9f1;color:#e85686">抽${U.money(sb.commission)}</span></div>`).join('')}
        <div class="kv"><span class="k">授课老师</span><b>${U.esc(DB.teacherName(s.teacherId))}</b></div>
        <div class="kv"><span class="k">签约 / 已上</span><b>${U.esc(s.signDate || '-')} · ${stat.done}节</b></div>
        ${s.status === 'trial' && s.trialDate ? `<div class="kv"><span class="k">试课日期</span><b class="tag gold">${U.cnDate(s.trialDate)}（次日回访）</b></div>` : ''}
        <div class="kv secret"><span class="k">累计抽成</span><b class="money in">${U.money(stat.profit)}</b></div>
        ${s.note ? `<div class="stu-note">${U.esc(s.note)}</div>` : ''}
        ${(s.custom && s.custom.length) ? `<div class="stu-custom">${s.custom.filter(c => c.label || c.value).map(c => `<span class="tag gray"><b>${U.esc(c.label)}</b>${c.value ? '：' + U.esc(c.value) : ''}</span>`).join('')}</div>` : ''}
      </div>
      <div class="stu-foot">
        <button class="btn btn-sm" data-act="book">排课</button>
        <button class="btn btn-sm btn-ghost" data-act="detail">档案详情</button>
        <button class="btn btn-sm btn-ghost" data-act="edit">编辑</button>
        ${s.status === 'trial' ? `<button class="btn btn-sm btn-ghost" data-act="toActive">转正式</button>` : ''}
        <button class="btn btn-icon" data-act="del" style="margin-left:auto"><svg class="ico"><use href="#i-trash"/></svg></button>
      </div>
    </div>`;
  }

  function statOf(s) {
    const ls = DB.data.lessons.filter(l => l.studentId === s.id && l.status === 'done');
    return {
      done: ls.length,
      gross: ls.reduce((a, l) => a + (+l.tuition || 0), 0),
      profit: ls.reduce((a, l) => a + (+l.commission || 0), 0)
    };
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = btn.closest('[data-id]');
    const s = card && DB.student(card.dataset.id);
    switch (btn.dataset.act) {
      case 'new': edit(null); break;
      case 'edit': edit(s); break;
      case 'book': Schedule.bookFor(s.id, () => render()); break;
      case 'detail': detail(s); break;
      case 'toActive': s.status = 'active'; DB.save(); DB.touch('student'); render(); U.toast(`${s.parentName} 已转为正式学员`); break;
      case 'del':
        U.confirm(`删除「${s.parentName}」的档案？其名下 ${DB.data.lessons.filter(l => l.studentId === s.id).length} 节课记录也会一并删除。`, () => {
          DB.data.students = DB.data.students.filter(x => x.id !== s.id);
          DB.data.lessons = DB.data.lessons.filter(l => l.studentId !== s.id);
          DB.save(); DB.touch('student'); render(); U.toast('已删除');
        }, '确认删除');
        break;
    }
  }

  /* ---------- 新建 / 编辑 ---------- */
  function subjRowHTML(sb) {
    // 年级 / 学科：下拉建议 + 允许手填自定义（datalist 由弹窗内 <datalist> 提供）
    return `<div class="subj-row" data-sid="${sb.id}">
      <input class="input sg" list="dl-grades" placeholder="年级（可自填）" value="${U.esc(sb.grade || '')}">
      <input class="input sj" list="dl-subjects" placeholder="学科（可自填）" value="${U.esc(sb.subject || '')}">
      <input class="input fee" type="number" min="0" placeholder="课时费" value="${sb.tuition || ''}">
      <input class="input com" type="number" min="0" placeholder="抽成" value="${sb.commission || ''}">
      <input class="input dur" type="number" min="15" step="15" placeholder="时长分" value="${sb.duration || ''}">
      <button class="btn btn-icon delSubj" title="删除该学科"><svg class="ico"><use href="#i-trash"/></svg></button>
    </div>`;
  }

  function edit(s) {
    const isNew = !s;
    const init = s || { status: 'active', teacherId: '', note: '', studentName: '', trialDate: U.today(), signDate: U.today(), custom: [] };
    const subs = (s && Array.isArray(s.subjects) && s.subjects.length) ? s.subjects : [{ id: U.uid('sbj'), grade: '', subject: '', tuition: '', commission: '', duration: '' }];
    const custom = (s && Array.isArray(s.custom)) ? s.custom.slice() : [];
    const cg = DB.data.settings.customGradesSubjects || { grades: [], subjects: [] };
    const teacherName0 = (s && s.teacherId) ? DB.teacherName(s.teacherId) : '';
    const teachers = DB.data.teachers;
    const m = U.modal({
      title: isNew ? '新建学员档案' : '编辑档案',
      wide: true,
      okText: isNew ? '创建档案' : '保存修改',
      body: `
      <div class="field">
        <label>签约日期 <span class="hint">自动规整：2026.4.20 / 26.4.20 / 260420 都行</span></label>
        <input class="input mono" id="f_date" value="${U.esc(init.signDate || '')}" placeholder="如 260820 或 2026.8.20">
        <span class="fmt-hint" id="dateHint"></span>
      </div>
      <div class="row">
        <div class="field"><label>家长称呼 <span class="hint">必填</span></label><input class="input" id="f_parent" value="${U.esc(init.parentName || '')}" placeholder="如 李妈妈"></div>
        <div class="field"><label>学生姓名 <span class="hint">选填</span></label><input class="input" id="f_sname" value="${U.esc(init.studentName || '')}" placeholder="如 李明"></div>
      </div>
      <div class="row">
        <div class="field"><label>授课老师 <span class="hint">直接手填；新老师会自动进名册，同名不重复建</span></label>
          <input class="input" id="f_tname" list="dl-teachers" value="${U.esc(teacherName0)}" placeholder="如 王老师 / 李老师">
          <datalist id="dl-teachers">${teachers.map(t => `<option value="${U.esc(t.name)}">`).join('')}</datalist>
        </div>
        <div class="field"><label>状态</label>
          <select class="input" id="f_st">
            ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === init.status ? 'selected' : ''}>${v.name}</option>`).join('')}
          </select></div>
      </div>
      <div class="field" id="trialWrap" style="display:${init.status === 'trial' ? 'flex' : 'none'}">
        <label>试课日期 <span class="hint">次日自动生成回访待办</span></label>
        <input type="date" class="input" id="f_trial" value="${init.trialDate || U.today()}">
      </div>
      <div class="divider"></div>
      <div class="field" style="margin-bottom:0">
        <label>学科与课时 <span class="hint">一个学生可上多科（语数英等）；每行一个学科，回车加一行；年级/学科可下拉选，也可直接手填自定义</span></label>
        <datalist id="dl-grades">${DB.GRADES.concat(cg.grades).map(g => `<option value="${U.esc(g)}">`).join('')}</datalist>
        <datalist id="dl-subjects">${DB.SUBJECTS.concat(cg.subjects).map(x => `<option value="${U.esc(x)}">`).join('')}</datalist>
        <div id="subjWrap" style="display:flex;flex-direction:column;gap:8px;margin-bottom:9px"></div>
        <button class="btn btn-sm btn-ghost" id="addSubj">＋ 添加学科</button>
      </div>
      <div class="divider"></div>
      <div class="field" style="margin-bottom:0">
        <label>自定义信息 <span class="hint">可自由添加「家长微信 / 校区 / 接送人」等字段，支持改名与删除</span></label>
        <div id="customWrap" style="display:flex;flex-direction:column;gap:8px;margin-bottom:9px"></div>
        <button class="btn btn-sm btn-ghost" id="addCustom">＋ 添加字段</button>
      </div>
      <div class="divider"></div>
      <div class="field"><label>备注 <span class="hint">家长性格、特殊要求、孩子情况</span></label>
        <textarea class="input" id="f_note" placeholder="例：妈妈很关注细节，每节课后一定要文字反馈；孩子函数薄弱。">${U.esc(init.note || '')}</textarea></div>`,
      onOk: b => {
        const dateStr = U.$('#f_date', b).value.trim();
        const signDate = DB.normDateFlexible(dateStr);
        if (!signDate) { U.toast('签约日期无法识别，请按 260820 或 2026.8.20 格式', 'warn'); return false; }
        const parentName = U.$('#f_parent', b).value.trim();
        if (!parentName) { U.toast('请填写家长称呼', 'warn'); return false; }
        const rows = Array.from(U.$('#subjWrap', b).querySelectorAll('.subj-row'));
        const subjects = [];
        for (const r of rows) {
          const grade = (r.querySelector('.sg') || {}).value || '';
          const subject = (r.querySelector('.sj') || {}).value || '';
          const tuition = +((r.querySelector('.fee') || {}).value || 0);
          const commission = +((r.querySelector('.com') || {}).value || 0);
          const duration = +((r.querySelector('.dur') || {}).value || 0);
          if (!grade && !subject && !tuition && !commission && !duration) continue; // 跳过空行
          if (!grade || !subject) { U.toast('学科行需填写年级与学科', 'warn'); return false; }
          if (commission > tuition) { U.toast(`${grade}${subject}：抽成不能大于课时费`, 'warn'); return false; }
          DB.rememberGradesSubjects(grade, subject);
          subjects.push({ id: r.dataset.sid || U.uid('sbj'), grade, subject, tuition, commission, duration: duration || 60, fixed: ((DB.student(s ? s.id : '') || {}).subjects || []).find(x => x.id === r.dataset.sid)?.fixed || [] });
        }
        if (!subjects.length) { U.toast('请至少填写一个学科', 'warn'); return false; }
        // 自定义字段：收集非空的 label+value
        const customRows = Array.from(U.$('#customWrap', b).querySelectorAll('.cust-row'));
        const customF = customRows.map(r => ({
          id: r.dataset.cid || U.uid('cf'),
          label: (r.querySelector('.cl') || {}).value.trim(),
          value: (r.querySelector('.cv') || {}).value.trim()
        })).filter(c => c.label || c.value);
        const teacherId = DB.resolveTeacher(U.$('#f_tname', b).value);
        const o = {
          signDate, parentName, studentName: U.$('#f_sname', b).value.trim(),
          teacherId, status: U.$('#f_st', b).value,
          trialDate: U.$('#f_trial', b).value, note: U.$('#f_note', b).value.trim(),
          custom: customF,
          grade: subjects[0].grade, subject: subjects[0].subject,
          tuition: subjects[0].tuition, commission: subjects[0].commission, duration: subjects[0].duration,
          subjects
        };
        o.code = DB.studentCode(Object.assign({ signDate, parentName }, { subjects }));
        if (isNew) DB.data.students.push(Object.assign({ id: U.uid('stu'), createdAt: Date.now() }, o));
        else Object.assign(s, o);
        DB.save(); DB.touch('student'); Todo.checkAuto(); App.refreshBadge(); render();
        U.toast(isNew ? '档案已创建' : '已保存');
      }
    });

    const wrap = U.$('#subjWrap', m.body);
    wrap.innerHTML = subs.map(subjRowHTML).join('');
    const refreshAddBtn = () => {
      const rows = wrap.querySelectorAll('.subj-row');
      U.$('#addSubj', m.body).onclick = () => { wrap.insertAdjacentHTML('beforeend', subjRowHTML({ id: U.uid('sbj'), grade: '', subject: '', tuition: '', commission: '', duration: '' })); bindRows(); };
    };
    function bindRows() {
      wrap.querySelectorAll('.subj-row').forEach(r => {
        r.querySelector('.delSubj').onclick = () => {
          if (wrap.querySelectorAll('.subj-row').length <= 1) { U.toast('至少保留一个学科', 'warn'); return; }
          r.remove();
        };
        // 在最后一个学科的「时长」框回车 → 新增一行
        const dur = r.querySelector('.dur');
        dur.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); U.$('#addSubj', m.body).click(); const last = wrap.querySelectorAll('.subj-row'); last[last.length - 1].querySelector('.sg').focus(); } };
      });
    }
    bindRows(); refreshAddBtn();

    /* 自定义字段：可增删、改名 */
    const cwrap = U.$('#customWrap', m.body);
    const custRowHTML = c => `<div class="cust-row" data-cid="${c.id || ''}">
      <input class="input cl" placeholder="字段名，如 家长微信" value="${U.esc(c.label || '')}">
      <input class="input cv" placeholder="字段内容" value="${U.esc(c.value || '')}">
      <button class="btn btn-icon delCust" title="删除字段"><svg class="ico"><use href="#i-trash"/></svg></button>
    </div>`;
    cwrap.innerHTML = custom.map(custRowHTML).join('');
    const bindCust = () => cwrap.querySelectorAll('.cust-row').forEach(r => {
      r.querySelector('.delCust').onclick = () => r.remove();
    });
    bindCust();
    U.$('#addCustom', m.body).onclick = () => { cwrap.insertAdjacentHTML('beforeend', custRowHTML({ id: U.uid('cf') })); bindCust(); };

    // 日期实时规整提示
    const dateIn = U.$('#f_date', m.body), hint = U.$('#dateHint', m.body);
    const upd = () => {
      const v = dateIn.value.trim();
      if (!v) { hint.textContent = ''; hint.className = 'fmt-hint'; return; }
      const iso = DB.normDateFlexible(v);
      if (iso) { hint.textContent = '规整为：' + iso.replace(/-/g, '').slice(2) + '（' + iso + '）'; hint.className = 'fmt-hint ok'; }
      else { hint.textContent = '无法识别，请按 260820 或 2026.8.20 格式'; hint.className = 'fmt-hint bad'; }
    };
    dateIn.oninput = upd; upd();
    const stSel = U.$('#f_st', m.body), trialWrap = U.$('#trialWrap', m.body);
    stSel.onchange = () => trialWrap.style.display = stSel.value === 'trial' ? 'flex' : 'none';
  }

  function previewHTML(p) {
    const cell = (k, v, bad) => `<div class="parse-cell ${bad ? 'bad' : ''}"><span class="pk">${k}</span><span class="pv">${U.esc(v || '—')}</span></div>`;
    return `<div class="parse-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
        <b style="font-size:12.5px">解析预览</b>
        <span class="tag ${p.ok ? 'leaf' : 'alert'}">${p.ok ? '格式正确' : '待完善'}</span>
      </div>
      <div class="parse-row">
        ${cell('签约日期', p.signDate, !p.signDate)}
        ${cell('年级', p.grade, !p.grade)}
        ${cell('学科', p.subject, !p.subject)}
        ${cell('家长称呼', p.parentName, !p.parentName)}
        ${cell('我的抽成', p.commission ? U.money(p.commission) : '', !p.commission)}
        ${cell('课时费', p.tuition ? U.money(p.tuition) : '', !p.tuition)}
        ${cell('课时长', p.duration ? p.duration + ' 分钟' : '', !p.duration)}
        ${cell('老师课酬', p.tuition ? U.money(p.tuition - p.commission) : '')}
        ${cell('抽成比例', p.tuition ? Math.round(p.commission / p.tuition * 100) + '%' : '')}
      </div>
      ${p.errors.length ? `<div style="margin-top:9px;font-size:11.5px;color:#cf5252">${p.errors.map(U.esc).join('<br>')}</div>` : ''}
    </div>`;
  }

  /* ---------- 档案详情 ---------- */
  function detail(s) {
    const ls = DB.data.lessons.filter(l => l.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date));
    const st = statOf(s);
    const up = ls.filter(l => l.status === 'scheduled').length;
    U.modal({
      title: `${s.parentName} · ${DB.primarySubject(s).grade}${DB.primarySubject(s).subject}${DB.studentSubjects(s).length > 1 ? ` 等${DB.studentSubjects(s).length}科` : ''}`, wide: true, hideFoot: true,
      body: `
      <div class="grid g4" style="gap:10px;margin-bottom:14px">
        <div class="stat"><div class="lab">已完成课时</div><div class="val">${st.done}</div><div class="sub">待上 ${up} 节</div></div>
        <div class="stat"><div class="lab">家长已付流水</div><div class="val">${U.money(st.gross)}</div></div>
        <div class="stat hl secret"><div class="lab">我的累计抽成</div><div class="val">${U.money(st.profit)}</div>
          <div class="sub">单节 ${U.money(DB.primarySubject(s).commission)} · ${U.pct(DB.primarySubject(s).commission, DB.primarySubject(s).tuition)}%</div></div>
        <div class="stat secret"><div class="lab">老师累计课酬</div><div class="val">${U.money(st.gross - st.profit)}</div>
          <div class="sub">${U.esc(DB.teacherName(s.teacherId))}</div></div>
      </div>
      ${s.note ? `<div class="stu-note" style="margin-bottom:14px">备注：${U.esc(s.note)}</div>` : ''}
      <div class="card-h"><h3 style="font-size:14px">课程记录（${ls.length}）</h3></div>
      <div style="max-height:320px;overflow:auto">
        <table class="tbl"><thead><tr>
          <th>日期</th><th>时间</th><th>时长</th><th>老师</th><th class="num">课时费</th>
          <th class="num secret">抽成</th><th>状态</th></tr></thead><tbody>
          ${ls.length ? ls.map(l => `<tr>
            <td data-label="日期">${l.date} <span class="muted">${U.wdName(l.date)}</span></td>
            <td data-label="时间">${l.start}</td><td data-label="时长">${l.duration}分</td><td data-label="老师">${U.esc(DB.teacherName(l.teacherId))}</td>
            <td class="num money" data-label="课时费">${U.money(l.tuition)}</td>
            <td class="num money in secret" data-label="抽成">${U.money(l.commission)}</td>
            <td data-label="状态"><span class="tag ${l.status === 'done' ? 'leaf' : l.status === 'cancelled' ? 'gray' : 'sky'}">
              ${l.status === 'done' ? '已完成' : l.status === 'cancelled' ? '已取消' : '待上课'}</span></td>
          </tr>`).join('') : `<tr><td colspan="7" class="muted" style="text-align:center;padding:22px">还没有排课</td></tr>`}
        </tbody></table>
      </div>`
    });
  }

  Views.students = {
    title: '学员档案',
    sub: '标准编码自动拆解为结构化字段，家长视角与内部视角分离',
    render() { render(); }
  };

  return { render, edit, STATUS, statOf, previewHTML };
})();
