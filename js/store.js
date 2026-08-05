/* ===== 数据层：localStorage 持久化 ===== */
const DB = (() => {
  const KEY = 'sakura-desk-v1';

  /* ---------- 学员编码 ----------
   * 早期版本曾支持「档案编码格式自定义 + 粘贴式一键拆解录入」（parseCode / buildCode 等），
   * 该能力已移除；现学员编码仅由 studentCode() 依据档案结构化字段自动生成，不再支持粘贴拆解。
   */
  const GRADES = ['高三', '高二', '高一', '初三', '初二', '初一',
    '六年级', '五年级', '四年级', '三年级', '二年级', '一年级',
    '小六', '小五', '小四', '小三', '小二', '小一',
    '大学', '高中', '初中', '小学', '幼小衔接', '成人'];
  const SUBJECTS = Object.keys(U.SUBJECT_COLORS);

  function numOr0(v) { const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; }

  function normDate(raw) {
    const s = String(raw).replace(/[^\d]/g, '');
    if (s.length === 6) {
      const y = 2000 + +s.slice(0, 2), m = +s.slice(2, 4), d = +s.slice(4, 6);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return `${y}-${U.pad(m)}-${U.pad(d)}`;
    }
    if (s.length === 8) {
      const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return `${y}-${U.pad(m)}-${U.pad(d)}`;
    }
    return null;
  }

  // 灵活日期规整：接受 260420 / 20260420 / 2026.4.20 / 2026-04-20 / 2026/4/20 等，统一成 ISO
  // 同时对外给出「YYMMDD」短码（用于档案编码显示）
  function normDateFlexible(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const digits = s.replace(/[^\d]/g, '');
    if (/^\d{6}$/.test(digits)) {
      const y = 2000 + +digits.slice(0, 2), m = +digits.slice(2, 4), d = +digits.slice(4, 6);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${U.pad(m)}-${U.pad(d)}`;
    }
    if (/^\d{8}$/.test(digits)) {
      const y = +digits.slice(0, 4), m = +digits.slice(4, 6), d = +digits.slice(6, 8);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${U.pad(m)}-${U.pad(d)}`;
    }
    const parts = s.split(/[^\d]+/).filter(Boolean).map(Number);
    if (parts.length === 3) {
      let [y, m, d] = parts;
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${U.pad(m)}-${U.pad(d)}`;
    }
    return null;
  }
  function codeDate(iso) { return iso ? iso.replace(/-/g, '').slice(2) : ''; }

  // 多科目支持：一个学员档案下可挂多个学科
  function studentSubjects(s) {
    if (s && Array.isArray(s.subjects) && s.subjects.length) {
      return s.subjects.map(sb => Object.assign({ id: sb.id || U.uid('sbj'), grade: '', subject: '其它', tuition: 0, commission: 0, duration: 60, fixed: [] }, sb));
    }
    if (s && (s.grade || s.subject)) {
      return [{ id: (s.id || 'stu') + '_legacy', grade: s.grade || '', subject: s.subject || '其它', tuition: s.tuition || 0, commission: s.commission || 0, duration: s.duration || 60, fixed: [] }];
    }
    return [];
  }
  function primarySubject(s) { return studentSubjects(s)[0] || { grade: '', subject: '未分级', tuition: 0, commission: 0, duration: 60, fixed: [] }; }
  function studentCode(s) {
    const subs = studentSubjects(s);
    const subsStr = subs.map(x => (x.grade || '') + (x.subject || '')).filter(Boolean).join('/');
    return [codeDate(s.signDate), subsStr, s.parentName].filter(Boolean).join('-');
  }
  function lessonSub(l) {
    if (l.grade || l.subject) return { grade: l.grade || '', subject: l.subject || '其它', subjectId: l.subjectId };
    const s = student(l.studentId);
    const ps = s ? primarySubject(s) : { grade: '', subject: '其它' };
    return { grade: ps.grade, subject: ps.subject, subjectId: ps.id };
  }

  function splitGradeSubject(str) {
    const s = str.trim();
    for (const g of GRADES) {
      if (s.startsWith(g)) {
        const rest = s.slice(g.length).trim() || '综合';
        return { grade: g, subject: normSubject(rest) };
      }
    }
    // 未匹配到年级：整体当学科
    const sub = SUBJECTS.find(x => s.includes(x));
    return { grade: sub ? s.replace(sub, '').trim() || '未分级' : '未分级', subject: sub || s || '其它' };
  }
  function normSubject(s) {
    const hit = SUBJECTS.find(x => s.includes(x));
    return hit || s;
  }

  /* ---------- 默认数据 ---------- */
  function defaultTemplates() {
    return [
      { id: U.uid('tpl'), title: '早间：查看今日课表 & 确认无冲突', priority: 1, tag: '日常' },
      { id: U.uid('tpl'), title: '晨报：给今天上课的家长发上课提醒', priority: 0, tag: '家长沟通' },
      { id: U.uid('tpl'), title: '课后：收集老师的课堂反馈并转述家长', priority: 0, tag: '家长沟通' },
      { id: U.uid('tpl'), title: '核对昨日课时费到账情况', priority: 1, tag: '财务' },
      { id: U.uid('tpl'), title: '跟进意向家长（未成单名单）', priority: 2, tag: '拓客' },
      { id: U.uid('tpl'), title: '朋友圈 / 社群发一条招生内容', priority: 3, tag: '拓客' },
      { id: U.uid('tpl'), title: '整理今日流水，记录抽成', priority: 1, tag: '财务' }
    ];
  }

  function defaultPhrases() {
    return [
      { id: U.uid('ph'), cat: 'parent', title: '为什么要换老师', content: '这边和您同步一下：原老师近期的时间和孩子的固定上课时段冲突了，为了不打乱孩子的节奏，我从团队里挑了一位同科目、带过同年级的老师接上。\n新老师会先看之前的授课记录和错题本，第一次课以衔接为主，不会重头讲。上完这节课我再单独听一下孩子的感受，如果不合适，我这边继续给您调，直到匹配为止。', hits: 0 },
      { id: U.uid('ph'), cat: 'parent', title: '课时费为什么是这个价', content: '我们的定价是按老师的实际授课水平和年级难度来的。这个价位包含：课前备课（针对孩子的薄弱点定制）、课中一对一讲解、课后反馈总结，以及我这边全程的进度跟进和答疑协调。\n如果预算有一定范围，我可以帮您匹配性价比更合适的老师，或者调整为每周一次+周中答疑的形式。', hits: 0 },
      { id: U.uid('ph'), cat: 'parent', title: '试课后跟进回访', content: '您好，昨天孩子的试课我这边看了老师的反馈：整体状态不错，老师提到孩子在【具体知识点】上还需要再巩固。\n想听听您和孩子的感受，老师的讲课节奏和风格还合适吗？如果觉得可以，我这边帮您把固定时间排上；如果哪里不太满意，也请直说，我再给您换一位试试。', hits: 0 },
      { id: U.uid('ph'), cat: 'parent', title: '请假 / 调课处理', content: '收到，孩子这次的课我先帮您标记为调课，课时不会扣。\n您看下这周还有哪个时间段方便？我这边和老师协调一下，尽量安排在原来的时间附近，保证学习节奏不断。（临时调课请尽量提前 4 小时告知，方便老师安排备课时间，谢谢配合）', hits: 0 },
      { id: U.uid('ph'), cat: 'parent', title: '催缴课时费', content: '您好，孩子的课时包还剩 X 次，为了不影响下周的排课，麻烦您方便时续一下课时~\n续费还是原价，如果一次续 20 次课，我这边可以再帮您争取赠送一次答疑课。', hits: 0 },
      { id: U.uid('ph'), cat: 'teacher', title: '为什么课时费是这个标准', content: '这个价格是按现在的年级和课程难度定的，也是家长端能接受的稳定区间。我这边承担的是获客、沟通、排课、家长维护和后续续费，老师只需要专注上好课。\n如果后面孩子续费、或者家长追加课时，我可以帮你把课时费往上调一档。带得好，我这边会优先给你派单。', hits: 0 },
      { id: U.uid('ph'), cat: 'teacher', title: '派单邀约', content: '有一个新单子：X年级X科，每周X次，每次X分钟，课时费 X 元/节，上课时间 X。\n家长的要求是【具体要求】。你时间上能接吗？能接的话我今晚把家长那边定下来，明天你先和我对一下第一次课的内容。', hits: 0 },
      { id: U.uid('ph'), cat: 'teacher', title: '要求提交课后反馈', content: '每节课结束后麻烦在 2 小时内发我一段反馈，包含三部分：①今天讲了什么 ②孩子掌握得怎么样（哪里卡壳）③下节课计划 + 建议家长配合的事。\n这个我要转给家长，是续费的关键，麻烦写具体一点，不要只写“表现不错”。', hits: 0 },
      { id: U.uid('ph'), cat: 'teacher', title: '老师临时有事请假', content: '这次我先和家长解释，帮你把课调到本周其他时间，不会影响你的课时结算。\n不过请假请尽量提前一天告知，临时取消对家长信任影响比较大。如果连续两次临时请假，这个单子我可能需要换人，请理解。', hits: 0 },
      { id: U.uid('ph'), cat: 'common', title: '首次接触家长开场', content: '您好，我是负责X区域一对一辅导的老师/顾问。方便简单说一下孩子的情况吗——现在几年级、哪一科比较吃力、最近一次考试大概什么水平、每周希望上几次课？\n我根据这些先给您匹配 1-2 位合适的老师，可以先安排一次试课，孩子觉得合适再定。', hits: 0 }
    ];
  }

  function demoData() {
    const t = U.today();
    const mon = U.mondayOf(t);
    const teachers = [
      { id: 'tc_wang', name: '王老师', phone: '', note: '985 数学系，擅长高中理科提分' },
      { id: 'tc_chen', name: '陈老师', phone: '', note: '英语专八，初中英语语法体系强' },
      { id: 'tc_me', name: '我自己上', phone: '', note: '自己带课时抽成 = 全额课时费' }
    ];
    const mk = (signDate, parentName, studentName, teacherId, note, status, subjects, extra = {}) => {
      return Object.assign({
        id: U.uid('stu'), code: '', signDate, parentName, studentName: studentName || '',
        teacherId, status, note, trialDate: '', createdAt: Date.now(),
        grade: subjects[0].grade, subject: subjects[0].subject,
        tuition: subjects[0].tuition, commission: subjects[0].commission, duration: subjects[0].duration,
        subjects: subjects.map(s => ({ id: U.uid('sbj'), grade: s.grade, subject: s.subject, tuition: s.tuition, commission: s.commission, duration: s.duration, teacherId: s.teacherId || '', freq: s.freq || '', fixed: s.fixed || [] }))
      }, extra);
    };
    const students = [
      mk(normDateFlexible('240815') || U.addDays(t, -30), '李明', '', 'tc_wang', '妈妈很关注细节，每节课后一定要文字反馈；孩子基础中等偏上，函数薄弱。', 'active',
        [{ grade: '高二', subject: '数学', tuition: 300, commission: 50, duration: 90 }], { freq: '1w3' }),
      mk(normDateFlexible('250302') || U.addDays(t, -20), '张昊', '', 'tc_chen', '爸爸做生意比较忙，微信回复慢；中考目标 110+。', 'active',
        [{ grade: '初三', subject: '英语', tuition: 240, commission: 60, duration: 120, teacherId: 'tc_chen', freq: '1w1' },
         { grade: '初三', subject: '数学', tuition: 260, commission: 55, duration: 120, teacherId: 'tc_wang', freq: '1w1' }], { freq: '1w2' }),
      mk(normDateFlexible('250520') || U.addDays(t, -10), '王思', '', 'tc_wang', '冲刺阶段，要求老师准时；一个孩子在这上语数英三科。', 'active',
        [{ grade: '高三', subject: '物理', tuition: 380, commission: 80, duration: 120, teacherId: 'tc_wang', freq: '1w2' },
         { grade: '高三', subject: '数学', tuition: 350, commission: 70, duration: 120, teacherId: 'tc_wang', freq: '1w1' },
         { grade: '高三', subject: '英语', tuition: 300, commission: 60, duration: 120, teacherId: 'tc_chen', freq: '1w1' }], { freq: '1w4' }),
      mk(normDateFlexible('250610') || U.addDays(t, -5), '刘洋', '', 'tc_me', '孩子注意力短，建议 60 分钟一节；家长在意性价比。', 'trial',
        [{ grade: '五年级', subject: '数学', tuition: 200, commission: 40, duration: 60 }], { trialDate: U.addDays(t, -1), freq: '1w1' })
    ];
    students.forEach(s => s.code = studentCode(s));
    const lessons = [];
    const plan = [
      { s: 0, sub: 0, d: 1, start: '19:00' }, { s: 0, sub: 0, d: 4, start: '19:00' },
      { s: 1, sub: 0, d: 2, start: '18:30' }, { s: 1, sub: 1, d: 2, start: '19:30' },
      { s: 2, sub: 0, d: 3, start: '20:00' }, { s: 2, sub: 1, d: 6, start: '14:00' }, { s: 2, sub: 2, d: 0, start: '10:00' },
      { s: 3, sub: 0, d: 5, start: '17:00' }, { s: 3, sub: 0, d: 0, start: '19:00' }
    ];
    for (let w = -2; w <= 2; w++) {
      plan.forEach(p => {
        const stu = students[p.s];
        const sub = stu.subjects[p.sub];
        const date = U.addDays(mon, w * 7 + p.d);
        if (date < stu.signDate) return;
        if (stu.status === 'trial' && w !== 0) return;
        lessons.push({
          id: U.uid('les'), studentId: stu.id, subjectId: sub.id,
          grade: sub.grade, subject: sub.subject,
          date, start: p.start, duration: sub.duration,
          tuition: sub.tuition, commission: sub.commission, teacherId: stu.teacherId,
          status: date < t ? 'done' : 'scheduled', note: ''
        });
      });
    }
    // 制造一个时间冲突示例（同一时间两节课，系统允许但会提示）
    const cs = students[1].subjects[0];
    lessons.push({
      id: U.uid('les'), studentId: students[1].id, subjectId: cs.id,
      grade: cs.grade, subject: cs.subject,
      date: U.addDays(mon, 3), start: '20:00',
      duration: cs.duration, tuition: cs.tuition, commission: cs.commission,
      teacherId: students[1].teacherId, status: 'scheduled', note: '与高三物理时间重叠，注意确认'
    });
    return { teachers, students, lessons, histIncome: { '2026-05': 9600, '2026-06': 11100, '2026-07': 12200 } };
  }

  function defaultFinanceSections() {
    return [
      { key: 'trend', name: '月度抽成走势', visible: true },
      { key: 'grade', name: '年级贡献', visible: true },
      { key: 'detail', name: '明细统计', visible: true },
      { key: 'daily', name: '账单明细', visible: true }
    ];
  }

  // 主页模块默认顺序（key 用于持久化定位 + 默认标题查询）
  // 三端统一：今日提醒事项在今日课程之上；每日模板库紧跟今日提醒事项；不再含走势/年级/话术
  const DASH_MODULES = [
    { key: 'greet',        name: '今日问候' },
    { key: 'kpi',          name: '关键指标' },
    { key: 'todayTodo',    name: '今日提醒事项' },
    { key: 'templates',    name: '每日模板库' },
    { key: 'todayLessons', name: '今日课程' }
  ];
  function defaultDashboardLayout() {
    return {
      order: DASH_MODULES.map(m => m.key),
      hidden: [],
      customTitle: {}
    };
  }

  // 墓碑（tombstone）覆盖的集合，与 sync.js 的 SYNC_ARRAYS 保持一致
  const TOMB_COLS = ['students', 'teachers', 'lessons', 'todos', 'events', 'templates', 'phrases'];
  // 墓碑（tombstone）结构：各同步集合独立登记 { id: 删除时间戳 }，
  // 用于让「删除」也能跨端传播——A 端删的记录，B/C 端合并时按墓碑剔除。
  function blankDeleted() {
    const o = {}; for (const c of TOMB_COLS) o[c] = {}; return o;
  }

  function blank() {
    return {
      version: 1,
      settings: { route: 'dashboard', ownerName: '我', night: false, financeSections: defaultFinanceSections(), dashboardLayout: defaultDashboardLayout(), customSub: {}, brandLogo: '' },
      teachers: [], students: [], lessons: [], todos: [], events: [],
      deleted: blankDeleted(),       // 墓碑：各集合已删除记录的 id→删除时间戳（跨端删除同步用）
      histIncome: {},                // 历史收入：按月总额 { 'YYYY-MM': 金额 }
      histIncomeMt: {},              // 历史收入按月「最后写入时间」(LWW 合并用，避免改小的值被云端旧大值顶掉)
      histIncomeDel: {},             // 历史收入按月「删除墓碑」(删除也能跨端传播)
      templates: defaultTemplates(), phrases: defaultPhrases(),
      meta: { lastLessonEdit: null, lastStudentEdit: null }
    };
  }

  /* ---------- 读写 ---------- */
  // 先初始化为 blank()，避免首次访问尚未赋值的 data 触发 TDZ 报错（演示数据在 load() 成功后按需填充）。
  let data = blank();
  data = load();

  // 数据损坏兜底：尝试从内嵌备份（离线版自带）恢复真实数据；否则返回 null 由调用方回退演示。
  // 绝不直接用示例数据静默覆盖真实数据。
  function salvageCorrupt() {
    try {
      const emb = (typeof window !== 'undefined') && window.__EMBEDDED_BACKUP__;
      if (emb && Array.isArray(emb.students)) {
        const d = JSON.parse(JSON.stringify(emb));
        if (Array.isArray(d.students) && d.students.length) return d;
      }
    } catch (e) { console.warn('损坏恢复-内嵌备份失败', e); }
    return null;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const b = blank();
        for (const k in b) {
          if (d[k] === undefined) d[k] = b[k];
          // 类型损坏兜底：数组字段被写成 null/对象时补空数组，避免首屏 render 时 .length/.filter 抛错白屏
          else if (Array.isArray(b[k]) && !Array.isArray(d[k])) d[k] = [];
        }
        d.settings = Object.assign(b.settings, d.settings || {});
        migrateSubjects(d);
        migrateHistIncome(d);
        migrateLessonTeacher(d);
        migrateRecurrence(d);
        return d;
      }
    } catch (e) {
      // 本地数据损坏：暂存原串以便恢复，绝不直接用示例数据覆盖真实数据。
      console.warn('本地数据解析失败，已保留原串并尝试恢复', e);
      try { localStorage.setItem(KEY + '__corrupt', localStorage.getItem(KEY)); } catch (_) {}
      const recovered = salvageCorrupt();
      if (recovered) {
        const d = adoptData(recovered);
        d.__corruptRecovered = true;
        return d;
      }
      const d = blank();
      Object.assign(d, demoData());
      d.__demo = true;
      d.__corrupt = true;   // 标记：本次是损坏回退的示例数据，UI 需提示
      return d;
    }
    // 本机尚无任何数据时：若当前打开的是「内含数据的离线版」文件，优先用它自带的备份开局。
    // 这样即便原网页彻底失效，双击这个文件就能直接看到全部数据，无需再手动导入。
    try {
      const emb = (typeof window !== 'undefined') && window.__EMBEDDED_BACKUP__;
      if (emb && Array.isArray(emb.students)) {
        const d = adoptData(JSON.parse(JSON.stringify(emb)));
        d.__fromEmbedded = true;
        return d;
      }
    } catch (e) { console.warn('内嵌备份读取失败', e); }
    const d = blank();
    Object.assign(d, demoData());   // 首次进入载入演示数据
    d.__demo = true;
    return d;
  }

  // opts.silent: true 时不触发云同步排队上传（用于同步模块内部拉取后落盘，避免循环上传）
  // opts.preserveSavedAt: true 时不刷新 __savedAt（用于云端下载后保留远端时间戳，避免 baseSavedAt 对不上）
  function save(opts) {
    opts = opts || {};
    // 本地复活：若某集合的记录仍存在于数组里（说明删除后又被重新录入/改回），
    // 清掉其墓碑，使该记录在本机恢复为「存活」且不会把删除传播出去——
    // 这正是「误删后、同步前复活」的实现：在真正上传前把墓碑抹掉，删除便不会扩散。
    if (data.deleted) {
      for (const col of TOMB_COLS) {
        const arr = Array.isArray(data[col]) ? data[col] : null;
        const dm = data.deleted[col];
        if (arr && dm) {
          for (const it of arr) { if (it && it.id != null && dm[String(it.id)] != null) delete dm[String(it.id)]; }
        }
      }
    }
    try {
      if (!opts.preserveSavedAt) data.__savedAt = Date.now();
      localStorage.setItem(KEY, JSON.stringify(data));
    }
    catch (e) { U.toast('保存失败：本地存储空间不足', 'warn'); }
    // 已连接云同步且开启自动同步时，改动后自动排队上传（去抖在 Sync 内处理）
    if (!opts.silent && window.Sync) window.Sync.schedulePush();
  }

  /* 记录各模块最近一次编辑时间（用于课表/财务页展示） */
  function touch(kind) {
    const t = Date.now();
    if (kind === 'lesson' || kind === 'student') data.meta['last' + (kind === 'lesson' ? 'Lesson' : 'Student') + 'Edit'] = t;
    save();
  }

  /* ---------- 墓碑删除同步（tombstone） ----------
     删除一条记录时，不真正从数组移除「远程副本」（本地立即移除，但云端合并需靠墓碑），
     而是在 data.deleted[集合] 里登记 { id: 删除时间戳 }。合并时两端 deleted 取较大 delAt，
     再剔除被标记的记录（除非该记录比删除时间更新=误删后、同步前又改动→复活）。
     这样 A 端删的记录，B/C 端下一次同步也会消失，且本地误删后改动能复活。
  */
  function markDeleted(collection, id, delAt) {
    if (!data.deleted) data.deleted = blankDeleted();
    if (!data.deleted[collection]) data.deleted[collection] = {};
    const k = String(id);
    const t = delAt || Date.now();
    data.deleted[collection][k] = Math.max(data.deleted[collection][k] || 0, t);
  }
  // 取消删除标记（复活）：记录重新出现且比墓碑更新时由合并逻辑调用，本地恢复也用得到
  function unmarkDeleted(collection, id) {
    if (data.deleted && data.deleted[collection]) delete data.deleted[collection][String(id)];
  }
  function isDeleted(collection, id) {
    return !!(data.deleted && data.deleted[collection] && data.deleted[collection][String(id)]);
  }
  // 物理删除某集合某 id 并登记墓碑（供各删除入口统一调用，避免漏写墓碑）
  function removeRecord(collection, id, delAt) {
    if (Array.isArray(data[collection])) data[collection] = data[collection].filter(x => String(x.id) !== String(id));
    markDeleted(collection, id, delAt);
  }

  /* ---------- 查询辅助 ---------- */
  const student = id => data.students.find(s => s.id === id);
  const teacher = id => data.teachers.find(t => t.id === id) || { name: '未指派' };
  const teacherName = id => (data.teachers.find(t => t.id === id) || {}).name || '未指派';
  const studentLabel = s => `${primarySubject(s).grade}${primarySubject(s).subject}·${s.parentName}`;

  // 按姓名解析授课老师：已存在（忽略大小写/空格）则复用其 id；否则新建一条老师名册记录。
  // 这样在学员档案里直接手填老师名字，保存后老师名册会自动出现，且同名老师不会重复建。
  function resolveTeacher(name) {
    const nm = (name || '').trim();
    if (!nm) return '';                       // 未指派
    const hit = data.teachers.find(t => (t.name || '').trim().toLowerCase() === nm.toLowerCase());
    if (hit) return hit.id;
    const t = { id: U.uid('tc'), name: nm, phone: '', note: '' };
    data.teachers.push(t);
    return t.id;
  }
  // 自定义学科/年级：把用户手填的新值追加进建议库（settings），下次 datalist 自动出现
  function rememberGradesSubjects(grade, subject) {
    const c = (data.settings.customGradesSubjects = data.settings.customGradesSubjects || { grades: [], subjects: [] });
    const add = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };
    add(c.grades, (grade || '').trim());
    add(c.subjects, (subject || '').trim());
    if (c.grades.length > 60) c.grades = c.grades.slice(-60);
    if (c.subjects.length > 60) c.subjects = c.subjects.slice(-60);
  }

  // 数据迁移：旧的单科目学员 → subjects 数组；旧课节补 grade/subject/subjectId 快照
  function migrateSubjects(d) {
    if (!d || !Array.isArray(d.students)) return d;
    d.students.forEach(s => {
      if (!Array.isArray(s.subjects) || !s.subjects.length) {
        s.subjects = [{ id: (s.id || 'stu') + '_legacy', grade: s.grade || '', subject: s.subject || '其它', tuition: s.tuition || 0, commission: s.commission || 0, duration: s.duration || 60, fixed: [] }];
      }
      s.subjects.forEach(sb => { if (!sb.id) sb.id = U.uid('sbj'); if (!Array.isArray(sb.fixed)) sb.fixed = []; if (sb.teacherId === undefined) sb.teacherId = ''; if (sb.freq === undefined) sb.freq = ''; });
      if (!s.parentName && s.subjects[0]) s.parentName = s.subjects[0].parentName || s.parentName;
      if (!s.code) s.code = studentCode(s);
      if (s.freq === undefined) s.freq = '';
    });
    if (Array.isArray(d.lessons)) d.lessons.forEach(l => {
      if (!l.subjectId && !l.grade && !l.subject) {
        const s = d.students.find(x => x.id === l.studentId);
        const ps = s && s.subjects ? s.subjects[0] : null;
        if (ps) { l.grade = ps.grade; l.subject = ps.subject; l.subjectId = ps.id; }
      }
    });
    return d;
  }

  // 数据迁移：把旧版「按学员拆分」的历史收入合并成「按月总额」全局对象 data.histIncome；
  // 同时丢弃 v1.6 初版误用的单个累计数。幂等：若 data.histIncome 已存在则跳过学员侧合并。
  function migrateHistIncome(d) {
    if (!d || !Array.isArray(d.students)) return d;
    if (!d.histIncome) {
      const total = {};
      let any = false;
      d.students.forEach(s => {
        if (s.histIncome && typeof s.histIncome === 'object') {
          any = true;
          Object.keys(s.histIncome).forEach(m => { total[m] = (total[m] || 0) + (+s.histIncome[m] || 0); });
          delete s.histIncome;
        } else if (typeof s.histIncome === 'number') {
          any = true; delete s.histIncome;   // legacy 累计数，作废
        }
      });
      d.histIncome = any ? total : {};
    } else if (typeof d.histIncome === 'number') {
      d.histIncome = {};
    }
    // 回填写入时间戳：老数据没有 histIncomeMt，给每个已填月份打一个「足够新」的时间戳，
    // 使升级后第一轮同步时本机当前值被视为权威（不会被云端旧副本覆盖）。
    if (d.histIncome && typeof d.histIncome === 'object' && !d.histIncomeMt) {
      const seed = d.__savedAt || Date.now();
      d.histIncomeMt = {};
      Object.keys(d.histIncome).forEach(m => { if (d.histIncome[m]) d.histIncomeMt[m] = seed; });
    }
    if (!d.histIncomeDel) d.histIncomeDel = {};
    return d;
  }

  // 数据迁移：课节缺 teacherId 时，按所属学员当前老师补上（历史排课 / Excel 导入的课可能没带老师）
  function migrateLessonTeacher(d) {
    if (!d || !Array.isArray(d.lessons) || !Array.isArray(d.students)) return d;
    const map = {};
    d.students.forEach(s => { map[s.id] = s.teacherId || ''; });
    d.lessons.forEach(l => { if (!l.teacherId && l.studentId && map[l.studentId]) l.teacherId = map[l.studentId]; });
    return d;
  }

  // 数据迁移：提醒事项 / 日程补「重复规则 + 已完成实例 + 标记(flag)」字段；
  // 旧版 repeat 可能是字符串('daily'等)或缺失，统一兜底为 'never'（引擎兼容字符串/对象）。
  function migrateRecurrence(d) {
    if (!d) return d;
    if (Array.isArray(d.todos)) d.todos.forEach(t => {
      if (t.repeat === undefined || t.repeat === null) t.repeat = 'never';
      if (!Array.isArray(t.completedDates)) t.completedDates = [];
      if (typeof t.flag !== 'boolean') t.flag = false;
    });
    if (Array.isArray(d.events)) d.events.forEach(e => {
      if (e.repeat === undefined || e.repeat === null) e.repeat = 'never';
      if (!Array.isArray(e.completedDates)) e.completedDates = [];
    });
    return d;
  }

  function lessonsIn(a, b, opt = {}) {
    return data.lessons.filter(l => l.date >= a && l.date <= b && (opt.withCancelled || l.status !== 'cancelled'));
  }
  // 报销支出：从批注(incomeNote)提取所有数字求和（如「买资料50、交通30」→ 80）
  function reimburseOf(l) {
    const note = (l.incomeNote || '').toString();
    if (!note.trim()) return 0;
    const matches = note.match(/\d+(\.\d+)?/g);
    if (!matches) return 0;
    return matches.reduce((s, m) => {
      const v = parseFloat(m);
      // 排除形如年份的四位整数（如「2026.3」里取到的 2026 不应计报销），避免误增报销、虚低到手
      if (/^\d{4}$/.test(m) && v >= 1900 && v <= 2099) return s;
      return s + v;
    }, 0);
  }
  // 收入口径：实际到手收入 = 我的抽成 − 报销支出。
  // 兼容 v1.7.7/1.7.8 手动录入的 actualTakeHome（若显式填写则以它为准）；
  // Excel 导入的「实际到手」数据：actualTakeHome 为显式值，报销支出从 incomeNote 提取。
  function takeHomeOf(l) {
    const hasExplicit = l.actualTakeHome !== undefined && l.actualTakeHome !== null && l.actualTakeHome !== '';
    if (hasExplicit) return +l.actualTakeHome || 0;
    const imported = !!l.importedCommission;
    const commission = +l.commission || 0;
    if (imported) return commission;
    return Math.max(0, commission - reimburseOf(l));
  }
  function takeHomeNote(l) {
    const note = (l.incomeNote || '').trim();
    if (note) return note;
    if (l.importedCommission) return '导入抽成（无课时费明细）';
    return '';
  }

  // 抽成口径：默认只统计已完成课程
  function statIn(a, b, opt = {}) {
    let ls = lessonsIn(a, b).filter(l => opt.includeScheduled ? true : l.status === 'done');
    // 财务页「含导入数据」未勾选时，导入的抽成表记录(importedCommission)不计入任何合计，
    // 与明细行、抽成率的口径保持一致（默认 true = 计入，仪表盘/日历不受影响）。
    if (opt.includeImported === false) ls = ls.filter(l => !l.importedCommission);
    const gross = ls.reduce((s, l) => s + (+l.tuition || 0), 0);
    const commission = ls.reduce((s, l) => s + (+l.commission || 0), 0);
    const reimb = ls.reduce((s, l) => s + reimburseOf(l), 0);
    const profit = ls.reduce((s, l) => s + takeHomeOf(l), 0);
    return { lessons: ls, count: ls.length, gross, commission, reimb, profit, cost: gross - profit, minutes: ls.reduce((s, l) => s + (+l.duration || 0), 0) };
  }

  // 单节课收入拆分
  function lessonBreakdown(l) {
    const gross = +l.tuition || 0;                 // 家长流水
    const commission = +l.commission || 0;         // 我的抽成
    const imported = !!l.importedCommission;
    const reimb = reimburseOf(l);                  // 报销支出（批注提取，导入数据也生效）
    const takeHome = takeHomeOf(l);                // 实际到手
    const teacherPay = imported ? 0 : Math.max(0, gross - commission); // 老师课酬
    return { gross, commission, reimb, takeHome, teacherPay, imported, note: takeHomeNote(l) };
  }

  function reset(withDemo) {
    data = blank();
    if (withDemo) Object.assign(data, demoData());
    save();
  }

  // 跨端清空：清空用户数据集合，但为每条被清记录打墓碑，使删除能随「立即上传」传播到云端 / 其他端。
  // 模板与话术保留工厂初始版本（与 reset(false) 一致），不清除、不打墓碑（各端一致，无需墓碑）。
  // 关键：必须打墓碑，而不能直接 data=blank()——
  // 否则 push 时 mergeDocs 按「本机 ∪ 云端」会把云端满数据补回来，
  // 造成「清空 + 上传」后一点连接数据又全回来（v2.1.1 修复此 bug）。
  function wipeSynced() {
    const wipeCols = ['students', 'teachers', 'lessons', 'todos', 'events'];
    const t = Date.now();
    if (!data.deleted) data.deleted = blankDeleted();
    for (const col of wipeCols) {
      if (!Array.isArray(data[col])) data[col] = [];
      if (!data.deleted[col]) data.deleted[col] = {};
      for (const it of data[col]) {
        if (it && it.id != null) {
          const k = String(it.id);
          data.deleted[col][k] = Math.max(data.deleted[col][k] || 0, t);
        }
      }
      data[col] = [];                 // 清空数组，但墓碑已登记，删除会随上传传播
    }
    data.histIncome = {};             // 聚合统计一并清空（非按记录、无墓碑；三端都清空则合并后自然为空）
    data.histIncomeMt = {}; data.histIncomeDel = {};   // 时间戳/删除墓碑一同清空
    data.meta = { lastLessonEdit: null, lastStudentEdit: null };
    save();
  }

  /* ---------- 备份：导出 / 预览 / 导入 / 撤销导入 ---------- */
  const PRE_IMPORT_KEY = KEY + '__preimport';   // 导入前的自动快照（用于一键撤销）

  // 生成一份可脱离本站独立存在的数据快照（纯数据，不含任何域名/站点信息）
  function buildSnapshot() {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
    const snap = JSON.parse(JSON.stringify(data));
    delete snap.__locked; delete snap.__demo; delete snap.__fromEmbedded;
    snap.__backup = {
      app: 'sakura-desk',
      name: '逸云阁工作台',
      schema: snap.version || 1,
      exportedAt: now.toISOString(),
      counts: backupCounts(snap),
      // 给未来的自己/任何重建版本看的说明：只要按此结构读取即可完整还原
      readme: '本文件是「逸云阁工作台」的完整数据备份，纯 JSON、不绑定任何网址。' +
              '在任意一份本工作台（含离线单文件版）中打开「数据管理 → 导入备份」选择本文件即可完整恢复。'
    };
    return { obj: snap, stamp, name: `樱花工作台备份_${stamp}.json` };
  }

  // 导出当前全部数据为 JSON 文件。返回文件名。
  function exportJSON() {
    const built = buildSnapshot();
    const now = new Date();
    const snap = built.obj;
    const name = built.name;
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    data.settings.lastBackupAt = now.getTime();
    save();
    return name;
  }

  function backupCounts(d) {
    return {
      students: (d.students || []).length,
      lessons: (d.lessons || []).length,
      todos: (d.todos || []).length,
      events: (d.events || []).length,
      teachers: (d.teachers || []).length
    };
  }

  // 只解析、不写入：用于导入前给用户看清「将要覆盖成什么」
  function parseBackup(text) {
    const d = JSON.parse(text);
    if (!d || typeof d !== 'object' || !Array.isArray(d.students)) throw new Error('文件格式不正确，不像是本工作台导出的备份');
    const bk = d.__backup || {};
    return { data: d, counts: backupCounts(d), exportedAt: bk.exportedAt || null };
  }

  // 归一化一份外来数据到当前结构（补默认字段 + 迁移旧结构）
  function adoptData(d) {
    const b = blank();
    for (const k in b) {
      if (d[k] === undefined) d[k] = b[k];
      else if (Array.isArray(b[k]) && !Array.isArray(d[k])) d[k] = [];  // 外来备份数组字段写成 null/对象时兜底，防后续 .filter 崩溃
    }
    d.settings = Object.assign(blank().settings, d.settings || {});
    delete d.__locked;
    migrateSubjects(d);
    migrateHistIncome(d);
    migrateLessonTeacher(d);
    migrateRecurrence(d);
    return d;
  }

  // 导入备份。解析失败会在写入前抛错（原数据分毫不动）；
  // 写入前自动把当前数据存一份快照，可用 restorePreImport() 一键撤销。
  // opts 透传给 save()：preserveSavedAt 用于云端下载后保留远端时间戳；silent 用于抑制自动上传。
  function importJSON(text, opts) {
    const info = parseBackup(text);          // 失败即抛错，此时尚未触碰现有数据
    try { localStorage.setItem(PRE_IMPORT_KEY, JSON.stringify({ at: Date.now(), counts: backupCounts(data), raw: JSON.stringify(data) })); }
    catch (e) { /* 空间不足则跳过快照，不阻断导入 */ }
    data = adoptData(info.data);
    save(opts);
    return info;
  }

  // 是否存在「导入前快照」（供设置页显示撤销按钮）
  function preImportInfo() {
    try {
      const o = JSON.parse(localStorage.getItem(PRE_IMPORT_KEY) || 'null');
      return o && o.raw ? { at: o.at, counts: o.counts || null } : null;
    } catch (e) { return null; }
  }

  // 撤销上一次导入，恢复到导入前的数据
  function restorePreImport() {
    const o = JSON.parse(localStorage.getItem(PRE_IMPORT_KEY) || 'null');
    if (!o || !o.raw) throw new Error('没有可撤销的导入记录');
    data = adoptData(JSON.parse(o.raw));
    save();
    localStorage.removeItem(PRE_IMPORT_KEY);
    return true;
  }

  /* ---------- 跨窗口 / 跨标签页实时同步 ---------- */
  // 同源的其他标签页改了 localStorage，本页自动读取并刷新当前视图
  let remoteHandler = null;
  function setRemoteHandler(fn) { remoteHandler = fn; }
  function applyRemote(raw) {
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      const b = blank();
      for (const k in b) if (d[k] === undefined) d[k] = b[k];
      // 关键修复：跨标签页同步直接拿到的「其他标签页当前数据」，必须复用 adoptData 跑迁移
      // （migrateRecurrence 等），否则旧结构数据会绕过 repeat/completedDates/flag 等字段补齐，
      // 导致重复/完成逻辑在本页错乱。
      data = adoptData(d);
      if (remoteHandler) remoteHandler();
    } catch (e) { /* 忽略损坏数据 */ }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => {
      if (e.key === KEY) applyRemote(e.newValue);
    });
    // 关页兜底：极端情况下最后再落盘一次
    window.addEventListener('beforeunload', () => save());
  }

  return {
    get data() { return data; },
    // 允许外部整体替换数据（云同步合并后回写）；与 importJSON 内部 data= 行为一致
    set data(v) { data = v; },
    save, reset, exportJSON, importJSON, parseBackup, preImportInfo, restorePreImport, buildSnapshot,
    touch, setRemoteHandler,
    markDeleted, isDeleted, unmarkDeleted, removeRecord, blankDeleted, wipeSynced,
    GRADES, SUBJECTS, normDate, defaultFinanceSections,
    student, teacher, teacherName, studentLabel, lessonsIn, statIn, lessonBreakdown, defaultTemplates, defaultPhrases,
    DASH_MODULES, studentSubjects, primarySubject, studentCode, normDateFlexible, lessonSub, migrateSubjects,
    resolveTeacher, rememberGradesSubjects,
    reimburseOf, takeHomeOf
  };
})();
