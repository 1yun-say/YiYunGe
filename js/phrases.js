/* ===== 常用话术库 ===== */
window.Views = window.Views || {};

const Phrases = (() => {
  const CATS = { parent: { name: '对家长', cls: 'sky' }, teacher: { name: '对老师', cls: 'leaf' }, common: { name: '通用', cls: 'gold' } };
  let cat = 'all', kw = '';

  function render() {
    const root = U.$('#view');
    if (!root || App.route !== 'scripts') return;
    let list = DB.data.phrases.slice();
    if (cat !== 'all') list = list.filter(p => p.cat === cat);
    if (kw) { const k = kw.toLowerCase(); list = list.filter(p => (p.title + p.content).toLowerCase().includes(k)); }
    list.sort((a, b) => (b.hits || 0) - (a.hits || 0));
    const cnt = c => DB.data.phrases.filter(p => p.cat === c).length;

    root.innerHTML = `
    <div class="sch-toolbar">
      <div class="tabs">
        <button class="tab ${cat === 'all' ? 'active' : ''}" data-c="all">全部 ${DB.data.phrases.length}</button>
        ${Object.entries(CATS).map(([k, v]) => `<button class="tab ${cat === k ? 'active' : ''}" data-c="${k}">${v.name} ${cnt(k)}</button>`).join('')}
      </div>
      <div style="display:flex;gap:9px">
        <input class="input" id="phKw" style="width:220px" placeholder="搜索话术内容" value="${U.esc(kw)}">
        <button class="btn btn-primary" data-act="new"><svg class="ico"><use href="#i-plus"/></svg>新增话术</button>
      </div>
    </div>

    ${list.length ? `<div class="phrase-grid">${list.map(cardHTML).join('')}</div>` : `
      <div class="card"><div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><use href="#i-chat"/></svg>
        <p>没有匹配的话术</p></div></div>`}

    <div class="card" style="margin-top:16px">
      <div class="card-h"><h3>使用建议</h3></div>
      <p class="muted" style="font-size:12.5px;line-height:1.9">
        话术里用【方括号】标出需要替换的变量（如【具体知识点】），复制后先改再发，避免明显的模板腔。<br>
        对家长强调「结果与责任心」，对老师强调「稳定派单与配合要求」——两套口径分开存，避免发错对象。<br>
        点击卡片右下角复制按钮，系统会记录使用次数，常用的会自动排到前面。</p>
    </div>`;

    const kwIn = U.$('#phKw', root);
    let composing = false;
    kwIn.addEventListener('compositionstart', () => composing = true);
    kwIn.addEventListener('compositionend', () => { composing = false; kwIn.dispatchEvent(new Event('input')); });
    kwIn.addEventListener('input', () => {
      if (composing) return;
      kw = kwIn.value;
      const pos = kwIn.selectionStart; render();
      const i = U.$('#phKw'); if (i) { i.focus(); i.setSelectionRange(pos, pos); }
    });
    root.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; render(); });
    U.rebind(root, 'phrases', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const card = btn.closest('[data-id]');
      const p = card && DB.data.phrases.find(x => x.id === card.dataset.id);
      switch (btn.dataset.act) {
        case 'new': edit(null); break;
        case 'edit': edit(p); break;
        case 'copy': U.copy(p.content); p.hits = (p.hits || 0) + 1; DB.save(); break;
        case 'del': U.confirm(`删除话术「${p.title}」？`, () => {
          DB.removeRecord('phrases', p.id); DB.save(); render();
        }, '删除'); break;
      }
    });
  }

  function cardHTML(p) {
    const c = CATS[p.cat] || CATS.common;
    return `<div class="phrase" data-id="${p.id}">
      <h4><span>${U.esc(p.title)}</span><span class="tag ${c.cls}">${c.name}</span></h4>
      <p>${U.esc(p.content)}</p>
      <div class="phrase-foot">
        <span class="muted" style="font-size:11px">已用 ${p.hits || 0} 次</span>
        <button class="btn btn-icon" data-act="edit" style="margin-left:auto"><svg class="ico"><use href="#i-edit"/></svg></button>
        <button class="btn btn-icon" data-act="del"><svg class="ico"><use href="#i-trash"/></svg></button>
        <button class="btn btn-sm" data-act="copy"><svg class="ico"><use href="#i-copy"/></svg>复制</button>
      </div>
    </div>`;
  }

  function edit(p) {
    const isNew = !p;
    p = p || { title: '', cat: 'parent', content: '', hits: 0 };
    U.modal({
      title: isNew ? '新增话术' : '编辑话术', wide: true,
      body: `<div class="row">
          <div class="field" style="flex:2"><label>场景标题</label>
            <input class="input" id="f_t" value="${U.esc(p.title)}" placeholder="例如：家长问为什么换老师"></div>
          <div class="field"><label>对象</label><select class="input" id="f_c">
            ${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === p.cat ? 'selected' : ''}>${v.name}</option>`).join('')}
          </select></div>
        </div>
        <div class="field"><label>话术内容 <span class="hint">用【】标出需替换的变量</span></label>
          <textarea class="input" id="f_x" style="min-height:170px">${U.esc(p.content)}</textarea></div>`,
      onOk: b => {
        const title = U.$('#f_t', b).value.trim(), content = U.$('#f_x', b).value.trim();
        if (!title || !content) { U.toast('标题和内容都要填', 'warn'); return false; }
        const o = { title, content, cat: U.$('#f_c', b).value };
        if (isNew) DB.data.phrases.push(Object.assign({ id: U.uid('ph'), hits: 0 }, o));
        else Object.assign(p, o);
        DB.save(); render();
      }
    });
  }

  Views.scripts = {
    title: '常用话术',
    sub: '对家长 / 对老师两套口径，点开即复制',
    render() { render(); }
  };

  return { render, edit, CATS };
})();
