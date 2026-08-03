/* ===== 老师名册（独立模块） ===== */
window.Views = window.Views || {};

const Teachers = (() => {
  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'teachers') return;
    const d = DB.data;

    root.innerHTML = `
    <div class="card">
      <div class="card-h"><h3>老师名册</h3>
        <button class="btn btn-sm btn-primary" data-act="addT"><svg class="ico"><use href="#i-plus"/></svg>添加老师</button></div>
      <table class="tbl"><thead><tr><th>姓名</th><th>联系方式</th><th class="num">在带学员</th><th class="num">累计课时</th><th></th></tr></thead>
      <tbody>
      ${d.teachers.map(t => {
        const stu = d.students.filter(s => s.teacherId === t.id && s.status !== 'ended').length;
        const les = d.lessons.filter(l => {
          const lt = l.teacherId || (DB.student(l.studentId) || {}).teacherId || '';
          return lt === t.id && l.status === 'done' && !l.importedCommission;
        }).length;
        return `<tr data-tid="${t.id}">
          <td data-label="姓名"><b>${U.esc(t.name)}</b>${t.note ? `<div class="muted" style="font-size:11px">${U.esc(t.note)}</div>` : ''}</td>
          <td class="muted" data-label="联系方式">${U.esc(t.phone || '-')}</td>
          <td class="num" data-label="在带学员">${stu}</td><td class="num" data-label="累计课时">${les}</td>
          <td style="text-align:right;white-space:nowrap" data-label="操作">
            <button class="btn btn-icon" data-act="editT"><svg class="ico"><use href="#i-edit"/></svg></button>
            <button class="btn btn-icon" data-act="delT"><svg class="ico"><use href="#i-trash"/></svg></button></td>
        </tr>`;
      }).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">还没有老师，先添加一位</td></tr>`}
      </tbody></table>
    </div>`;

    U.rebind(root, 'teachers', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const tr = b.closest('[data-tid]');
      const t = tr && DB.data.teachers.find(x => x.id === tr.dataset.tid);
      switch (b.dataset.act) {
        case 'addT': editTeacher(null); break;
        case 'editT': editTeacher(t); break;
        case 'delT':
          U.confirm(`删除老师「${t.name}」？其名下学员会变为「未指派」。`, () => {
            DB.data.teachers = DB.data.teachers.filter(x => x.id !== t.id);
            DB.data.students.forEach(s => { if (s.teacherId === t.id) s.teacherId = ''; });
            DB.save(); render();
          }, '删除');
          break;
      }
    });
  }

  function editTeacher(t) {
    const isNew = !t;
    t = t || { name: '', phone: '', note: '' };
    U.modal({
      title: isNew ? '添加老师' : '编辑老师',
      body: `<div class="row">
          <div class="field"><label>姓名 / 称呼</label><input class="input" id="f_n" value="${U.esc(t.name)}" placeholder="王老师"></div>
          <div class="field"><label>联系方式</label><input class="input" id="f_p" value="${U.esc(t.phone || '')}" placeholder="微信 / 手机"></div>
        </div>
        <div class="field"><label>备注</label><textarea class="input" id="f_r" placeholder="擅长科目、可上课时间、结算方式">${U.esc(t.note || '')}</textarea></div>`,
      onOk: b => {
        const name = U.$('#f_n', b).value.trim();
        if (!name) { U.toast('请填写姓名', 'warn'); return false; }
        const o = { name, phone: U.$('#f_p', b).value.trim(), note: U.$('#f_r', b).value.trim() };
        if (isNew) DB.data.teachers.push(Object.assign({ id: U.uid('tc') }, o));
        else Object.assign(t, o);
        DB.save(); render();
      }
    });
  }

  Views.teachers = { title: '老师名册', sub: '管理授课老师、联系方式与备注', render() { render(); } };
  return { render, editTeacher };
})();