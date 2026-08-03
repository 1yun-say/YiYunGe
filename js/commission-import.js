/* 抽成表导入（v1.7.3）
 * 读取本地 .xlsx：表头取纯中文名（忽略前缀数字/时薪/括号后缀），日期去星期，
 * 跳过"上课安排"行与空列，批注搬入备注（去 iPad: 前缀、过滤 Excel 系统批注）。
 * 每个非空单元格 -> 一条课时记录（抽成=单元格值，备注=批注原文），状态 done。
 * 先弹预览，用户确认后才写入 localStorage。导入记录标记 importedCommission，课表不渲染。
 */
(function () {
  const C = {
    pick() {
      if (typeof XLSX === 'undefined') { U.toast('解析库未加载，请刷新页面', 'err'); return; }
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.xlsx,.xls';
      inp.onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            const res = C.parse(wb, f.name);
            if (!res.records.length) { U.toast('没有解析到任何抽成记录，请检查表格格式', 'err'); return; }
            C.preview(res);
          } catch (err) {
            console.error(err);
            U.toast('解析失败：' + (err && err.message ? err.message : err), 'err');
          }
        };
        reader.readAsArrayBuffer(f);
      };
      inp.click();
    },

    colName(c) {
      let s = ''; c++;
      while (c) { s = String.fromCharCode(64 + (c % 26 || 26)) + s; c = Math.floor((c - 1) / 26); }
      return s;
    },
    parseName(h) {
      if (!h) return null;
      const m = String(h).match(/[一-龥]+/);
      return m ? m[0] : null;
    },
    parseDate(s) {
      if (!s) return null;
      const m = String(s).match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (!m) return null;
      const y = +m[1], M = +m[2], D = +m[3];
      if (M < 1 || M > 12 || D < 1 || D > 31) return null;
      return `${y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
    },
    cleanNote(t) {
      if (!t) return '';
      t = String(t).replace(/\s+/g, ' ').trim();
      if (t.includes('线程批注') || t.includes('Excel版本可读取') || t.includes('对批注所作的任何改动')) return '';
      t = t.replace(/^\s*iPad\s*:\s*/i, '');
      return t;
    },

    parse(wb, fileName) {
      const ws = wb.Sheets[wb.SheetNames[0]];
      const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
      const maxRow = range ? range.e.r + 1 : 200;
      const maxCol = range ? range.e.c + 1 : 20;
      const cellAt = (r, c) => ws[`${C.colName(c)}${r}`];
      const getComment = c => (c && c.c && c.c[0] && c.c[0].t) ? String(c.c[0].t).trim() : '';

      const headers = [];
      for (let c = 1; c < maxCol; c++) {
        const h = cellAt(1, c);
        if (!h || h.v == null) continue;
        const name = C.parseName(h.v);
        if (name) headers.push({ col: c, raw: String(h.v), name });
      }

      const records = [];
      for (let r = 2; r <= maxRow; r++) {
        const dc = cellAt(r, 0);
        const date = C.parseDate(dc && dc.v != null ? String(dc.v) : '');
        if (!date) continue;
        for (const h of headers) {
          const c = cellAt(r, h.col);
          if (!c || c.v == null) continue;
          const v = Number(c.v);
          if (!isFinite(v) || v === 0) continue;
          const note = C.cleanNote(getComment(c));
          records.push({ date, name: h.name, commission: v, note });
        }
      }

      const totalCommission = records.reduce((a, x) => a + x.commission, 0);
      return { headers, records, totalCommission, fileName };
    },

    preview(res) {
      const data = DB.data;
      res.records.forEach(rec => {
        const s = data.students.find(x => x.parentName === rec.name);
        rec.matched = s ? s.id : null;
        rec.action = s ? '匹配' : '新建';
      });
      const newNames = [...new Set(res.records.filter(r => !r.matched).map(r => r.name))];
      const matchedNames = [...new Set(res.records.filter(r => r.matched).map(r => r.name))];
      const rowsHTML = res.records.map(r => `<tr>
        <td data-label="日期" style="white-space:nowrap">${r.date}</td>
        <td data-label="学员" style="white-space:nowrap;font-weight:600">${U.esc(r.name)}</td>
        <td data-label="动作" style="white-space:nowrap;color:${r.matched ? 'var(--green,#2e9e5b)' : 'var(--pink,#e85686)'}">${r.matched ? '✔ 匹配' : '➕ 新建'}</td>
        <td class="num money in" data-label="抽成">${U.money(r.commission)}</td>
        <td data-label="备注" style="color:var(--ink-2);font-size:12px">${r.note ? U.esc(r.note) : '<span class=\"muted\">—</span>'}</td>
      </tr>`).join('');

      U.modal({
        title: '抽成表导入预览',
        wide: true,
        okText: '确认导入',
        cancelText: '取消',
        body: `<div style="margin:0 0 12px;font-size:13px;line-height:1.7">
          来源文件：<b>${U.esc(res.fileName)}</b><br>
          共解析到 <b>${res.records.length}</b> 条抽成记录，合计 <b class="money in">${U.money(res.totalCommission)}</b> 元。<br>
          将 <b style="color:var(--green,#2e9e5b)">匹配 ${matchedNames.length}</b> 个现有学员、<b style="color:var(--pink,#e85686)">新建 ${newNames.length}</b> 个学员（${newNames.length ? U.esc(newNames.join('、')) : '无'}）。<br>
          <span class="muted">导入后按日期记入财务"实际到手"（导入抽成直接作为实际到手，不拆分课酬）；为避免打扰课表，这些记录不会显示在日历周视图（已标记）。请核对下方明细，确认无误再导入。</span>
        </div>
        <div style="overflow:auto;max-height:56vh">
          <table class="tbl" style="font-size:12.5px;min-width:max-content">
            <thead><tr><th>日期</th><th>学员</th><th>动作</th><th class="num">抽成</th><th>备注</th></tr></thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>`,
        onOk: () => C.commit(res)
      });
    },

    makeStudent(name) {
      return {
        id: U.uid('stu'), code: '', signDate: U.today(), parentName: name, studentName: '',
        teacherId: 'tc_me', status: 'active', note: '由抽成表导入',
        trialDate: '', createdAt: Date.now(),
        grade: '', subject: '其它', tuition: 0, commission: 0, duration: 60,
        subjects: [{ id: U.uid('sbj'), grade: '', subject: '其它', tuition: 0, commission: 0, duration: 60, fixed: [] }]
      };
    },

    commit(res) {
      const data = DB.data;
      const cache = {};
      let created = 0;
      res.records.forEach(rec => {
        let sid = rec.matched;
        if (!sid) {
          if (cache[rec.name]) sid = cache[rec.name];
          else {
            const stu = C.makeStudent(rec.name);
            data.students.push(stu);
            cache[rec.name] = stu.id;
            sid = stu.id;
            created++;
          }
        }
        const stu = DB.student(sid);
        const sub = (stu.subjects && stu.subjects[0]) || null;
        data.lessons.push({
          id: U.uid('les'),
          studentId: sid,
          subjectId: sub ? sub.id : '',
          grade: sub ? sub.grade : '',
          subject: sub ? sub.subject : '其它',
          date: rec.date,
          start: '08:00',
          duration: 60,
          tuition: 0,
          commission: rec.commission,
          actualTakeHome: rec.commission,
          teacherId: stu.teacherId || 'tc_me',
          status: 'done',
          note: rec.note ? ('[抽成表] ' + rec.note) : '[抽成表导入]',
          importedCommission: true
        });
      });
      DB.save();
      U.toast(`已导入 ${res.records.length} 条抽成记录（新建 ${created} 个学员）`, 'ok');
      if (window.App && App.go) App.go('finance');
    }
  };
  window.CommissionImport = C;
})();
