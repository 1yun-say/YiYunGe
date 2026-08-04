/* ===== 学员档案 ===== */
window.Views = window.Views || {};

const Students = (() => {
  const STATUS = {
    trial: { name: '试课中', cls: 'gold' },
    active: { name: '在读', cls: 'leaf' },
    paused: { name: '暂停', cls: 'sky' },
    ended: { name: '已结课', cls: 'gray' }
  };
  // 上课频率：用于学员列表自动排序（高频学员排前面）
  const FREQ = [
    { v: '1w1', name: '每周 1 次' },
    { v: '1w2', name: '每周 2 次' },
    { v: '1w3', name: '每周 3 次' },
    { v: '1w4', name: '每周 4 次' },
    { v: '1w5', name: '每周 5 次' },
    { v: '1w6', name: '每周 6 次' },
    { v: '1d',  name: '每天' },
    { v: '2w1', name: '每两周 1 次' },
    { v: 'once', name: '一次性 / 不固定' }
  ];
  const FREQ_RANK = { '1d': 7, '1w6': 6, '1w5': 5, '1w4': 4, '1w3': 3, '1w2': 2, '1w1': 1, '2w1': 0.5, 'once': 0, '': 0 };
  const freqName = v => (FREQ.find(f => f.v === v) || {}).name || '未设置';
  const freqRank = v => FREQ_RANK[v] || 0;
  let kw = '', tab = 'all';

  function ensureOrder() {
    const sts = DB.data.students;
    if (sts.length && sts.every(s => typeof s.order === 'number')) return;
    const sorted = sts.slice().sort((a, b) => freqRank(b.freq) - freqRank(a.freq) || (b.signDate || '').localeCompare(a.signDate || ''));
    sorted.forEach((s, i) => { s.order = i; });
    DB.save();
  }
  function reorder(s, dir) {
    const sts = DB.data.students.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sts.findIndex(x => x.id === s.id);
    const j = idx + dir;
    if (j < 0 || j >= sts.length) return;
    [sts[idx], sts[j]] = [sts[j], sts[idx]];
    sts.forEach((x, i) => { x.order = i; });
    DB.save(); DB.touch('student'); render();
  }
  function sortByFreq() {
    const sts = DB.data.students.slice().sort((a, b) => freqRank(b.freq) - freqRank(a.freq) || (b.signDate || '').localeCompare(a.signDate || ''));
    sts.forEach((x, i) => { x.order = i; });
    DB.save(); DB.touch('student'); render();
    U.toast('已按上课频率重排', 'ok');
  }

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'students') return;
    const pub = App.isPublic();
    ensureOrder();
    let list = DB.data.students.slice().sort((a, b) => {
      const r = (a.order || 0) - (b.order || 0);
      if (r !== 0) return r;
      const f = freqRank(b.freq) - freqRank(a.freq);
      if (f !== 0) return f;
      return (b.signDate || '').localeCompare(a.signDate || '');
    });
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
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
        <input class="input" id="stuKw" style="width:220px" placeholder="搜索学员 / 年级 / 学科 / 老师" value="${U.esc(kw)}">
        <button class="btn btn-ghost btn-sm" data-act="importExcel">从Excel导入课时</button>
        <button class="btn btn-ghost btn-sm" data-act="sortFreq" title="按上课频率自动重排">按频率重排</button>
        <button class="btn btn-primary" data-act="new"><svg class="ico"><use href="#i-plus"/></svg>新建档案</button>
      </div>
    </div>

    ${list.length ? `<div class="stu-grid" id="stuGrid">${list.map(cardHTML).join('')}</div>`
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

    /* 桌面端：未筛选时可拖拽卡片排序（包 try，避免异常影响其他绑定） */
    if (!U.isMobile() && tab === 'all' && !kw) {
      try {
        U.draggableSortable(root.querySelector('#stuGrid'), '.stu-card', newOrder => {
          const byId = {}; DB.data.students.forEach(s => byId[s.id] = s);
          newOrder.forEach((id, i) => { if (byId[id]) byId[id].order = i; });
          DB.save(); DB.touch('student');
        });
      } catch (e) { console.warn('学员拖拽排序初始化失败', e); }
    }
  }

  function cardHTML(s) {
    const pub = App.isPublic();
    const st = STATUS[s.status] || STATUS.active;
    const subs = DB.studentSubjects(s);
    const c = U.subColor((subs[0] || {}).subject || '其它');
    const stat = statOf(s);
    return `<div class="stu-card ${s.status}" data-id="${s.id}" data-key="${s.id}">
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
          <span class="tag secret" style="background:var(--pink-100);color:var(--pink-600)">抽${U.money(sb.commission)}</span></div>`).join('')}
        <div class="kv"><span class="k">授课老师</span><b>${U.esc(DB.teacherName(s.teacherId))}</b></div>
        <div class="kv"><span class="k">上课频率</span><b>${U.esc(freqName(s.freq))}</b></div>
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
        <button class="btn btn-sm btn-ghost" data-act="moveUp" title="上移一位">↑</button>
        <button class="btn btn-sm btn-ghost" data-act="moveDown" title="下移一位">↓</button>
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
      commission: ls.reduce((a, l) => a + (+l.commission || 0), 0),
      reimb: ls.reduce((a, l) => a + DB.lessonBreakdown(l).reimb, 0),
      profit: ls.reduce((a, l) => a + DB.lessonBreakdown(l).takeHome, 0)
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
      case 'moveUp': reorder(s, -1); break;
      case 'moveDown': reorder(s, +1); break;
      case 'sortFreq': sortByFreq(); break;
      case 'importExcel': importExcelFlow(); break;
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
      <div class="field"><label>学生姓名 <span class="hint">必填，作为档案主名称</span></label><input class="input" id="f_sname" value="${U.esc(init.parentName || init.studentName || '')}" placeholder="如 李明"></div>
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
      <div class="field"><label>上课频率 <span class="hint">用于自动排序，高频学员排前面（不固定可留空）</span></label>
        <select class="input" id="f_freq">
          ${FREQ.map(f => `<option value="${f.v}" ${f.v === (init.freq || '') ? 'selected' : ''}>${f.name}</option>`).join('')}
        </select></div>
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
        const parentName = U.$('#f_sname', b).value.trim();
        if (!parentName) { U.toast('请填写学生姓名', 'warn'); return false; }
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
          signDate, parentName, studentName: '',
          teacherId, status: U.$('#f_st', b).value, freq: U.$('#f_freq', b).value || '',
          trialDate: U.$('#f_trial', b).value, note: U.$('#f_note', b).value.trim(),
          custom: customF,
          grade: subjects[0].grade, subject: subjects[0].subject,
          tuition: subjects[0].tuition, commission: subjects[0].commission, duration: subjects[0].duration,
          subjects
        };
        o.code = DB.studentCode(Object.assign({ signDate, parentName }, { subjects }));
        if (isNew) {
          const dup = DB.data.students.find(x => (x.parentName || '').trim().toLowerCase() === parentName.toLowerCase());
          if (dup && !window.confirm(`已存在同名学员「${dup.parentName}」，确定要再新建一个吗？\n若其实是同一人，建议直接编辑原档案即可。`)) {
            return false;
          }
          DB.data.students.push(Object.assign({ id: U.uid('stu'), createdAt: Date.now() }, o));
        }
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
        ${cell('学员名', p.parentName, !p.parentName)}
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
        <div class="stat"><div class="lab">我的抽成</div><div class="val">${U.money(st.commission)}</div></div>
        <div class="stat hl secret"><div class="lab">累计实际到手</div><div class="val">${U.money(st.profit)}</div>
          <div class="sub">单节 ${U.money(DB.primarySubject(s).commission)} · ${U.pct(DB.primarySubject(s).commission, DB.primarySubject(s).tuition)}%</div></div>
        <div class="stat secret"><div class="lab">报销支出</div><div class="val">${U.money(st.reimb)}</div>
          <div class="sub">${U.esc(DB.teacherName(s.teacherId))}</div></div>
      </div>
      ${s.note ? `<div class="stu-note" style="margin-bottom:14px">备注：${U.esc(s.note)}</div>` : ''}
      <div class="card-h"><h3 style="font-size:14px">课程记录（${ls.length}）</h3></div>
      <div style="max-height:320px;overflow:auto">
        <table class="tbl"><thead><tr>
          <th>日期</th><th>时间</th><th>时长</th><th>老师</th><th class="num">课时费</th>
          <th class="num secret">实际到手</th><th>状态</th></tr></thead><tbody>
          ${ls.length ? ls.map(l => `<tr>
            <td data-label="日期">${l.date} <span class="muted">${U.wdName(l.date)}</span></td>
            <td data-label="时间">${l.start}</td><td data-label="时长">${l.duration}分</td><td data-label="老师">${U.esc(DB.teacherName(l.teacherId))}</td>
            <td class="num money" data-label="课时费">${U.money(l.tuition)}</td>
            <td class="num money in secret" data-label="实际到手">${U.money(DB.lessonBreakdown(l).takeHome)}</td>
            <td data-label="状态"><span class="tag ${l.status === 'done' ? 'leaf' : l.status === 'cancelled' ? 'gray' : 'sky'}">
              ${l.status === 'done' ? '已完成' : l.status === 'cancelled' ? '已取消' : '待上课'}</span></td>
          </tr>`).join('') : `<tr><td colspan="7" class="muted" style="text-align:center;padding:22px">还没有排课</td></tr>`}
        </tbody></table>
      </div>`
    });
  }

  /* ---------- Excel / CSV 导入课时（含重复校验） ---------- */
  const numOr0 = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };

  function findStudentByName(name) {
    const n = (name || '').trim().toLowerCase();
    return DB.data.students.find(s => (s.parentName || '').trim().toLowerCase() === n);
  }
  function createStudentFromRow(r) {
    const grade = r.grade || '未分级', subject = r.subject || '其它';
    const sub = { id: U.uid('sbj'), grade, subject, tuition: r.tuition || r.commission || 0, commission: r.commission || 0, duration: r.duration || 60, fixed: [] };
    const st = {
      id: U.uid('stu'), code: '', signDate: r.date, parentName: r.name, studentName: '',
      teacherId: '', status: 'active', note: '', trialDate: '', createdAt: Date.now(),
      grade: sub.grade, subject: sub.subject, tuition: sub.tuition, commission: sub.commission, duration: sub.duration,
      subjects: [sub], freq: '', custom: [], order: DB.data.students.length
    };
    st.code = DB.studentCode(st);
    DB.data.students.push(st);
    return st;
  }
  function getSubject(stu, r) {
    const grade = r.grade || '未分级', subject = r.subject || '其它';
    let sub = (stu.subjects || []).find(s => s.grade === grade && s.subject === subject);
    if (!sub) { sub = { id: U.uid('sbj'), grade, subject, tuition: r.tuition || r.commission || 0, commission: r.commission || 0, duration: r.duration || 60, fixed: [] }; stu.subjects.push(sub); }
    else { if (r.tuition) sub.tuition = r.tuition; if (r.commission) sub.commission = r.commission; if (r.duration) sub.duration = r.duration; }
    return sub;
  }
  function lessonExists(stuId, date, commission, start) {
    return DB.data.lessons.some(l => l.studentId === stuId && l.date === date && (+l.commission || 0) === (+commission || 0) && (l.start || '') === (start || ''));
  }

  // 解析 CSV/TSV：识别 上课时间/孩子姓名/每次抽成（+ 可选 课时费/年级/学科/时长）
  function parseSheet(text) {
    text = (text || '').replace(/\r\n/g, '\n').trim();
    if (!text) return { rows: [], mapping: {} };
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return { rows: [], mapping: {} };
    const sample = lines[0];
    let delim = ',';
    if (sample.includes('\t')) delim = '\t';
    else if (sample.includes(';') && !sample.includes(',')) delim = ';';
    const splitCsv = line => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else { if (ch === '"') q = true; else if (ch === delim) { out.push(cur); cur = ''; } else cur += ch; }
      }
      out.push(cur); return out;
    };
    const cells = lines.map(splitCsv);
    const header = cells[0].map(h => (h || '').trim());
    const colMatch = kw => { const k = kw.toLowerCase(); const i = header.findIndex(h => (h || '').toLowerCase().includes(k)); return i; };
    let m = {
      date: pick(colMatch, ['上课时间', '日期', 'date', '时间']),
      name: pick(colMatch, ['孩子姓名', '姓名', '学生', '学员', 'name']),
      commission: pick(colMatch, ['每次抽成', '抽成', '提成', '金额', '收入', 'commission']),
      tuition: pick(colMatch, ['课时费', '学费', '课酬', 'tuition']),
      grade: colMatch('年级'),
      subject: pick(colMatch, ['学科', '科目', 'subject']),
      duration: pick(colMatch, ['时长', '分钟', 'duration'])
    };
    // 表头无法识别时，按位置假设前三列 = 上课时间 / 孩子姓名 / 每次抽成
    if (m.date < 0 && m.name < 0 && m.commission < 0) m = { date: 0, name: 1, commission: 2, tuition: -1, grade: -1, subject: -1, duration: -1 };
    function pick(fn, keys) { for (const k of keys) { const i = fn(k); if (i >= 0) return i; } return -1; }

    const rows = [];
    for (let i = 1; i < cells.length; i++) {
      const c = cells[i];
      let dateRaw = (m.date >= 0 ? (c[m.date] || '') : '').trim();
      let timeRaw = '';
      const sp = dateRaw.indexOf(' ');
      if (sp >= 0) { timeRaw = dateRaw.slice(sp + 1).trim(); dateRaw = dateRaw.slice(0, sp).trim(); }
      const date = DB.normDateFlexible(dateRaw);
      const name = (m.name >= 0 ? (c[m.name] || '') : '').trim();
      const commission = numOr0(m.commission >= 0 ? c[m.commission] : '');
      const tuition = m.tuition >= 0 ? numOr0(c[m.tuition]) : 0;
      const grade = m.grade >= 0 ? (c[m.grade] || '').trim() : '';
      const subject = m.subject >= 0 ? (c[m.subject] || '').trim() : '';
      const duration = m.duration >= 0 ? numOr0(c[m.duration]) : 0;
      const row = { date, name, commission, tuition, grade, subject, duration, time: timeRaw, ok: false, reason: '' };
      if (!date) row.reason = '日期无法识别';
      else if (!name) row.reason = '缺少孩子姓名';
      else if (!commission) row.reason = '缺少抽成金额';
      else row.ok = true;
      rows.push(row);
    }
    return { rows, mapping: m };
  }

  function renderImportPreview(text) {
    const box = U.$('#excelPreview'); if (!box) return;
    const parsed = parseSheet(text);
    if (!text.trim()) { box.innerHTML = ''; return; }
    if (!parsed.rows.length) { box.innerHTML = '<p class="muted">无数据</p>'; return; }
    box.innerHTML = `<table class="tbl"><thead><tr><th>上课时间</th><th>孩子姓名</th><th>每次抽成</th><th>归入学员</th><th>状态</th></tr></thead><tbody>
      ${parsed.rows.map(r => {
        let st = '', cls = '';
        if (!r.ok) { st = r.reason; cls = 'alert'; }
        else { const ex = findStudentByName(r.name); st = ex ? '归入：' + ex.parentName : '新建：' + r.name; cls = ex ? 'leaf' : 'sky'; }
        return `<tr><td data-label="上课时间">${r.date || '—'}</td><td data-label="孩子姓名">${U.esc(r.name)}</td>
          <td class="num money in" data-label="每次抽成">${U.money(r.commission)}</td><td data-label="归入学员">${U.esc(st)}</td>
          <td data-label="状态"><span class="tag ${cls}">${r.ok ? '待导入' : '跳过'}</span></td></tr>`;
      }).join('')}
    </tbody></table>`;
  }

  function applyImport(rows) {
    let created = 0, added = 0;
    rows.filter(r => r.ok).forEach(r => {
      let stu = findStudentByName(r.name);
      if (!stu) { stu = createStudentFromRow(r); created++; }
      const sub = getSubject(stu, r);
      const start = (r.time && /^\d{1,2}:\d{2}$/.test(r.time)) ? r.time : '';
      if (lessonExists(stu.id, r.date, r.commission, start)) return; // 跳过完全重复的课程
      DB.data.lessons.push({
        id: U.uid('les'), studentId: stu.id, subjectId: sub.id,
        grade: sub.grade, subject: sub.subject, date: r.date, start,
        duration: sub.duration, tuition: sub.tuition, commission: sub.commission,
        teacherId: stu.teacherId, status: 'done', note: 'Excel导入'
      });
      added++;
    });
    DB.save(); DB.touch('lesson'); DB.touch('student');
    return { created, added };
  }

  function importExcelFlow() {
    U.modal({
      title: '从 Excel / CSV 导入课时',
      wide: true,
      okText: '确认导入',
      body: `
      <p class="muted" style="font-size:12px;margin:0 0 8px">把 Excel 另存为 <b>CSV（逗号分隔）</b> 后选择文件，或直接把表格内容粘贴到下方。需要包含列：<b>上课时间</b>、<b>孩子姓名</b>、<b>每次抽成</b>（课时费 / 年级 / 学科 / 时长 可选）。系统按姓名归入已有学员，没有的自动新建，并跳过完全重复的课程。</p>
      <input type="file" id="excelFile" accept=".csv,text/csv" style="margin:8px 0 4px;display:block">
      <textarea class="input" id="excelText" rows="6" placeholder="在此粘贴 CSV 内容（第一行写表头，例如：上课时间,孩子姓名,每次抽成）"></textarea>
      <div id="excelPreview" style="margin-top:10px"></div>`,
      onOk: b => {
        const txt = (U.$('#excelText', b).value || '').trim();
        const parsed = parseSheet(txt);
        if (!parsed.rows.length) { U.toast('没有可导入的数据，请检查内容', 'warn'); return false; }
        const okRows = parsed.rows.filter(r => r.ok);
        if (!okRows.length) { U.toast('没有有效的行（需含 上课时间 + 孩子姓名 + 每次抽成）', 'warn'); return false; }
        const res = applyImport(parsed.rows);
        ensureOrder(); render();
        U.toast(`已导入 ${res.added} 条课时${res.created ? '，新建 ' + res.created + ' 位学员' : ''}`, 'ok');
      }
    });
    const fi = U.$('#excelFile'), ta = U.$('#excelText');
    if (fi) fi.onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { if (ta) { ta.value = r.result; renderImportPreview(ta.value); } };
      r.readAsText(f, 'UTF-8');
    };
    if (ta) ta.oninput = () => renderImportPreview(ta.value);
  }

  Views.students = {
    title: '学员档案',
    sub: '标准编码自动拆解为结构化字段，按学员姓名管理档案',
    render() { render(); }
  };

  return { render, edit, STATUS, statOf, previewHTML };
})();
