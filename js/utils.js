/* ===== 工具库 ===== */
const U = (() => {
  const pad = n => String(n).padStart(2, '0');

  /* --- 日期 --- */
  const today = () => fmt(new Date());
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
  const addMonths = (s, n) => { const d = parse(s); d.setMonth(d.getMonth() + n); return fmt(d); };
  const dow = s => parse(s).getDay();                    // 0=周日
  const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));  // 本周一
  const weekDays = s => { const m = mondayOf(s); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); };
  const monthFirst = s => s.slice(0, 8) + '01';
  const monthLast = s => { const d = parse(s); return fmt(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  const yearFirst = s => s.slice(0, 4) + '-01-01';
  const yearLast = s => s.slice(0, 4) + '-12-31';
  const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const wdName = s => WD[dow(s)];
  const cnDate = s => { const d = parse(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const between = (s, a, b) => s >= a && s <= b;
  const daysDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  /* --- 时间(分钟) --- */
  const t2m = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const m2t = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  /* --- 通用 --- */
  const uid = p => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const money = n => '¥' + (Math.round(n * 100) / 100).toLocaleString('zh-CN');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* 学科配色 */
  const SUBJECT_COLORS = {
    '数学': '#f9709d', '语文': '#7fc8a9', '英语': '#8fb8f0', '物理': '#f2b544',
    '化学': '#b48ce0', '生物': '#65c7c0', '历史': '#e2a06a', '地理': '#79b36b',
    '政治': '#ef8ea4', '科学': '#6fb7d8', '编程': '#7c8cf0', '其它': '#c0a3b2'
  };
  /* 周视图课块用的淡色映射（固定莫兰迪淡色，不随主题切换），让周视图更轻盈通透 */
  const WEEK_MUTED = {
    '数学': '#c98b94', '语文': '#9fb39a', '英语': '#9fabc4', '物理': '#c9b083',
    '化学': '#b3a0c4', '生物': '#94bdb6', '历史': '#c4a585', '地理': '#a3b290',
    '政治': '#c79aa6', '科学': '#9bb6c4', '编程': '#a3a9c4', '其它': '#b6a8ac'
  };
  const subColor = s => SUBJECT_COLORS[s] || SUBJECT_COLORS['其它'];

  /* 重复渲染时避免事件监听器堆叠 */
  function rebind(node, key, fn, type = 'click') {
    const k = '__h_' + key;
    if (node[k]) node.removeEventListener(type, node[k]);
    node[k] = fn;
    node.addEventListener(type, fn);
  }

  /* 移除某节点上由 rebind 注册的全部委托监听器（切换视图时调用，避免多视图监听器串台） */
  function unbindNode(node) {
    if (!node) return;
    Object.keys(node).forEach(k => {
      if (k.indexOf('__h_') === 0 && typeof node[k] === 'function') {
        node.removeEventListener('click', node[k]);
        delete node[k];
      }
    });
  }

  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  /* 时间戳 -> 友好显示 */
  const fmtTime = ts => {
    if (!ts) return '暂无记录';
    const d = new Date(ts), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const p2 = n => String(n).padStart(2, '0');
    const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
    if (sameDay) return `今天 ${hm}`;
    const y = new Date(now - 86400000);
    if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${hm}`;
  };

  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

  /* --- Toast --- */
  function toast(msg, type = 'ok') {
    const t = el(`<div class="toast ${type}">${esc(msg)}</div>`);
    $('#toastRoot').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-8px)'; t.style.transition = '.3s'; }, 1900);
    setTimeout(() => t.remove(), 2300);
  }

  /* --- Modal --- */
  function modal({ title, body, okText = '保存', cancelText = '取消', wide = false, onOk, hideFoot = false }) {
    const mask = el(`<div class="mask">
      <div class="modal ${wide ? 'wide' : ''}">
        <div class="modal-h"><h3>${esc(title)}</h3>
          <button class="btn btn-icon" data-x><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal-b"></div>
        ${hideFoot ? '' : `<div class="modal-f">
          <button class="btn btn-ghost" data-cancel>${esc(cancelText)}</button>
          <button class="btn btn-primary" data-ok>${esc(okText)}</button></div>`}
      </div></div>`);
    const bodyEl = $('.modal-b', mask);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const close = () => mask.remove();
    $('[data-x]', mask).onclick = close;
    if (!hideFoot) {
      $('[data-cancel]', mask).onclick = close;
      $('[data-ok]', mask).onclick = () => { if (!onOk || onOk(bodyEl, close) !== false) close(); };
    }
    mask.addEventListener('mousedown', e => { if (e.target === mask) close(); });
    document.getElementById('modalRoot').appendChild(mask);
    setTimeout(() => { const f = bodyEl.querySelector('input,textarea,select'); if (f) f.focus(); }, 60);
    return { mask, body: bodyEl, close };
  }

  function confirm(msg, onOk, okText = '确定') {
    modal({ title: '请确认', body: `<p style="font-size:13.5px;line-height:1.8">${esc(msg)}</p>`, okText, onOk });
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch (e) { toast('复制失败，请手动选择', 'warn'); }
      ta.remove();
    }
  }

  /* --- SVG 图表 --- */
  function pie(data, size = 190) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) return `<div class="empty" style="padding:26px"><p>暂无数据</p></div>`;
    const R = size / 2, r = R * 0.56;
    let a = -Math.PI / 2, paths = '';
    data.forEach(d => {
      const ang = d.value / total * Math.PI * 2, b = a + ang;
      const big = ang > Math.PI ? 1 : 0;
      const p = (rad, ang2) => [R + rad * Math.cos(ang2), R + rad * Math.sin(ang2)];
      if (ang > 6.28) {
        paths += `<circle cx="${R}" cy="${R}" r="${(R + r) / 2}" fill="none" stroke="${d.color}" stroke-width="${R - r}"/>`;
      } else {
        const [x1, y1] = p(R - 2, a), [x2, y2] = p(R - 2, b), [x3, y3] = p(r, b), [x4, y4] = p(r, a);
        paths += `<path d="M${x1} ${y1} A${R - 2} ${R - 2} 0 ${big} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${big} 0 ${x4} ${y4} Z" fill="${d.color}" stroke="#fff" stroke-width="1.5"/>`;
      }
      a = b;
    });
    const top = data[0];
    return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;max-width:100%">
      ${paths}
      <text x="${R}" y="${R - 4}" text-anchor="middle" font-size="11" fill="#a8899a">${esc(top.label)}</text>
      <text x="${R}" y="${R + 15}" text-anchor="middle" font-size="17" font-weight="700" fill="#4a2c3c">${Math.round(top.value / total * 100)}%</text>
    </svg>`;
  }

  function bars(data, opt = {}) {
    if (!data.length || !data.some(d => d.value)) return `<div class="empty" style="padding:26px"><p>暂无数据</p></div>`;
    const max = Math.max(...data.map(d => d.value)) || 1;
    return data.map(d => `<div class="bar-row">
      <div class="bl" title="${esc(d.label)}">${esc(d.label)}</div>
      <div class="bt"><i style="width:${(d.value / max * 100).toFixed(1)}%;background:${d.color || 'linear-gradient(90deg,#ffb6ce,#f9709d)'}"></i></div>
      <div class="bv">${opt.money ? money(d.value) : d.value + (opt.unit || '')}</div>
    </div>`).join('');
  }

  function columns(data, opt = {}) {
    if (!data || !data.length || !data.some(d => d.value))
      return `<div class="empty" style="padding:26px"><p>暂无数据</p></div>`;
    const max = Math.max(...data.map(d => d.value)) || 1;
    const H = 138;
    return `<div style="display:flex;align-items:flex-end;gap:6px;height:${H + 34}px;padding-top:6px">
      ${data.map(d => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0">
        <div style="font-size:10px;color:var(--pink-600);font-weight:700;white-space:nowrap">${d.value ? (opt.money ? money(d.value) : d.value) : ''}</div>
        <div title="${esc(d.label)}: ${opt.money ? money(d.value) : d.value}"
          style="width:100%;max-width:34px;height:${Math.max(2, d.value / max * H)}px;border-radius:6px 6px 3px 3px;
          background:${d.hl ? 'linear-gradient(180deg,var(--pink-400),var(--pink-600))' : 'linear-gradient(180deg,var(--pink-200),var(--pink-300))'};transition:height .5s"></div>
        <div style="font-size:10px;color:#a8899a;white-space:nowrap">${esc(d.label)}</div>
      </div>`).join('')}
    </div>`;
  }

  /* 可编辑副标题：每个页面顶部那行字都可以自己改 */
function editableSub(node, viewKey, fallback) {
    const getCustom = () => ((DB.data.settings.customSub || {})[viewKey] || '').trim();
    const renderText = () => {
      const v = getCustom() || fallback || '';
      node.classList.toggle('placeholder', !v);
      node.textContent = v || '点击编辑副标题…';
    };
    renderText();
    node.title = '点击编辑这行说明';
    let saved = false;
    const save = () => {
      if (saved) return; saved = true;
      const txt = node.textContent.trim();
      DB.data.settings.customSub = DB.data.settings.customSub || {};
      if (txt === (fallback || '')) delete DB.data.settings.customSub[viewKey];
      else DB.data.settings.customSub[viewKey] = txt;
      DB.save();
      renderText();
    };
    node.addEventListener('click', () => {
      if (node.contentEditable === 'true') return;
      saved = false;
      node.contentEditable = 'true';
      node.classList.remove('placeholder');
      node.focus();
      const sel = window.getSelection(), r = document.createRange();
      r.selectNodeContents(node); sel.removeAllRanges(); sel.addRange(r);
    });
    node.addEventListener('blur', save);
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
      if (e.key === 'Escape') { node.textContent = getCustom() || fallback || ''; node.blur(); }
    });
  }

  /* 拖动排序：给容器下直接子项启用 HTML5 drag&drop；onChange(newOrder) */
  function draggableSortable(container, itemSelector, onChange) {
    if (!container) return;
    const items = () => Array.from(container.querySelectorAll(itemSelector));
    let dragEl = null, afterEl = null;

    items().forEach(el => {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', e => {
        dragEl = el;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', el.dataset.key || ''); } catch (_) {}
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        items().forEach(n => n.classList.remove('drop-before', 'drop-after'));
        dragEl = afterEl = null;
      });
      el.addEventListener('dragover', e => {
        if (!dragEl || dragEl === el) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        items().forEach(n => n.classList.remove('drop-before', 'drop-after'));
        const r = el.getBoundingClientRect();
        const before = (e.clientY - r.top) < r.height / 2;
        el.classList.add(before ? 'drop-before' : 'drop-after');
        afterEl = el;
        afterEl._before = before;
      });
    });
    container.addEventListener('drop', e => {
      if (!dragEl || !afterEl) return;
      e.preventDefault();
      const before = afterEl._before;
      container.insertBefore(dragEl, before ? afterEl : afterEl.nextSibling);
      items().forEach(n => n.classList.remove('drop-before', 'drop-after'));
      const order = items().map(n => n.dataset.key || n.dataset.mod || n.dataset.sec).filter(Boolean);
      onChange && onChange(order);
    });
  }

  return {
    pad, today, fmt, parse, addDays, addMonths, dow, mondayOf, weekDays, monthFirst, monthLast,
    yearFirst, yearLast, wdName, cnDate, between, daysDiff, t2m, m2t, uid, money, esc, el, $, $$,
    toast, modal, confirm, copy, pie, bars, columns, subColor, SUBJECT_COLORS, WEEK_MUTED, WD, rebind, unbindNode, pct, fmtTime, isMobile,
    editableSub, draggableSortable
  };
})();
