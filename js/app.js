/* ===== 应用主控 ===== */
const App = (() => {
  let route = 'dashboard';

  /* 逸云阁图标：默认花瓣 SVG，用户可在「数据管理」上传自定义图片 */
  const Brand = {
    logoHTML() {
      const logo = DB.data.settings.brandLogo;
      if (logo) return `<img src="${logo}" alt="逸云阁" style="width:100%;height:100%;border-radius:10px;object-fit:cover;display:block">`;
      return `<svg viewBox="0 0 40 40"><g fill="currentColor">
        <ellipse cx="20" cy="9" rx="5" ry="7.5"/><ellipse cx="30.4" cy="16.6" rx="5" ry="7.5" transform="rotate(72 30.4 16.6)"/>
        <ellipse cx="26.5" cy="28.8" rx="5" ry="7.5" transform="rotate(144 26.5 28.8)"/><ellipse cx="13.5" cy="28.8" rx="5" ry="7.5" transform="rotate(216 13.5 28.8)"/>
        <ellipse cx="9.6" cy="16.6" rx="5" ry="7.5" transform="rotate(288 9.6 16.6)"/><circle cx="20" cy="20" r="3.4" fill="#fff7fa"/></g></svg>`;
    },
    apply() {
      const m = U.$('.brand-mark'); if (m) m.innerHTML = Brand.logoHTML();
    }
  };
  window.Brand = Brand;

  const isPublic = () => false;   // 已移除家长视角，内部数据始终可见

  function go(r) {
    if (!Views[r]) r = 'dashboard';
    route = r;
    DB.data.settings.route = r; DB.save();
    U.$$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === r));
    U.$$('.bn-item').forEach(n => n.classList.toggle('active', n.dataset.route === r));
    U.$('#pageTitle').textContent = Views[r].title;
    const v = U.$('#view'); v.innerHTML = ''; v.scrollTop = 0;
    U.unbindNode(v);   // 清掉上一个视图遗留的委托监听器，避免点击串台
    Views[r].render(v);
    // 移动端切换路由后回到顶部
    if (U.isMobile()) window.scrollTo(0, 0);
  }

  function refreshBadge() {
    const n = Todo.pendingCount();
    const b = U.$('#navTodoBadge'), bb = U.$('#bnTodoBadge');
    if (b) b.textContent = n ? n : '';
    if (bb) bb.textContent = n ? n : '';
  }

  function quickAddMenu() {
    U.modal({
      title: '快速新建', hideFoot: true,
      body: `<div class="grid g2" style="gap:10px">
        ${[['todo', '待办任务', '记一件今天要做的事'], ['student', '学员档案', '按你的编码格式新建'],
        ['lesson', '排课', '给学员安排上课时间'], ['phrase', '常用话术', '存一条标准回复']]
          .map(([k, n, d]) => `<button class="btn btn-ghost" data-q="${k}"
            style="flex-direction:column;align-items:flex-start;padding:14px;height:auto;text-align:left">
            <b style="font-size:13.5px">${n}</b><span class="muted" style="font-size:11.5px">${d}</span></button>`).join('')}
      </div>`
    }).body.addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      e.target.closest('.mask').remove();
      switch (b.dataset.q) {
        case 'todo':
          U.modal({
            title: '新建待办',
            body: `<div class="field"><label>任务内容</label><input class="input" id="q_t" placeholder="例如：给李妈妈发本周课表"></div>
              <div class="row"><div class="field"><label>优先级</label><select class="input" id="q_p">
                ${Todo.P.map(p => `<option value="${p.v}" ${p.v === 1 ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
              <div class="field"><label>日期</label><input type="date" class="input" id="q_d" value="${U.today()}"></div></div>`,
            onOk: bd => {
              const t = U.$('#q_t', bd).value.trim(); if (!t) { U.toast('请填写内容', 'warn'); return false; }
              Todo.add({ title: t, priority: +U.$('#q_p', bd).value, date: U.$('#q_d', bd).value, status: 'pending' });
              refreshBadge(); go(route); U.toast('已添加');
            }
          });
          break;
        case 'student': Students.edit(null); break;
        case 'lesson': Schedule.book(null, {}, () => go(route)); break;
        case 'phrase': Phrases.edit ? Phrases.edit(null) : go('scripts'); break;
      }
    });
  }

  /* ---------- 樱花飘落 ---------- */
  const PETAL = c => `<svg width="100%" height="100%" viewBox="0 0 20 20">
    <path d="M10 1c3 2.5 5 5.5 5 8.5S12.8 15 10 19C7.2 15 5 12.5 5 9.5S7 3.5 10 1z"
      fill="${c}" opacity=".85"/></svg>`;

  function sakura(n = 22) {
    const layer = U.$('#sakuraLayer');
    const colors = ['#ffc2d6', '#ffd6e4', '#ffb0c9', '#ffe3ec', '#ffa8c4'];
    for (let i = 0; i < n; i++) {
      const size = 8 + Math.random() * 12;
      const dur = 12 + Math.random() * 16;
      const p = U.el(`<div class="petal" style="
        left:${Math.random() * 100}%;width:${size}px;height:${size}px;
        --drift:${(Math.random() * 200 - 60).toFixed(0)}px;
        --spin:${(Math.random() * 720 - 360).toFixed(0)}deg;
        opacity:${(0.35 + Math.random() * 0.45).toFixed(2)};
        animation:fall ${dur}s linear ${(-Math.random() * dur).toFixed(1)}s infinite, sway ${(3 + Math.random() * 4).toFixed(1)}s ease-in-out infinite;
      ">${PETAL(colors[i % colors.length])}</div>`);
      layer.appendChild(p);
    }
  }

  /* ---------- 夜览模式 ---------- */
  function applyNight() {
    const on = !!(DB.data && DB.data.settings && DB.data.settings.night);
    document.body.classList.toggle('night', on);
  }

  /* ---------- 启动 ---------- */
  function boot() {
    Brand.apply();
    Todo.checkAuto();
    refreshBadge();
    const r = DB.data.settings.route || 'dashboard';
    go(Views[r] ? r : 'dashboard');
  }

  function init() {
    applyNight();
    sakura();
    // 跨窗口实时同步：其他同源标签页改了数据，本页自动重渲染当前视图
    DB.setRemoteHandler(() => {
      const r = App.route;
      const v = U.$('#view');
      if (v && Views[r]) { v.innerHTML = ''; Views[r].render(v); }
      App.refreshBadge();
    });
    U.$('#todayChip').textContent = `${U.today()} ${U.wdName(U.today())}`;
    U.$$('.nav-item').forEach(n => n.onclick = () => go(n.dataset.route));
    U.$$('.bn-item').forEach(n => n.onclick = () => go(n.dataset.route));
    U.$('#quickAdd').onclick = quickAddMenu;
    const sb = U.$('#searchBtn'); if (sb) sb.onclick = () => Search.open();
    const fab = U.$('#fab'); if (fab) fab.onclick = () => App.route === 'todo' ? Todo.addNew() : quickAddMenu();
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { const m = U.$$('.mask').pop(); if (m) m.remove(); }
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); quickAddMenu(); }
    });
    bootAndDemo();
  }

  function backupGuard() {
    const last = DB.data.settings.lastBackupAt || 0;
    const days = (Date.now() - last) / 86400000;
    // 每周自动静默备份一次（浏览器可能拦截自动下载，失败不打扰）
    if (days >= 7) {
      try {
        DB.exportJSON();
        // 若上面成功更新了 lastBackupAt，则无需提醒
        return;
      } catch (e) { /* 自动下载被拦截，继续走提醒 */ }
    }
    // 超过 7 天未备份：强提醒；超过 14 天：弹窗阻断式提醒
    if (days >= 14) {
      setTimeout(() => U.modal({
        title: '⚠️ 很久没有备份了',
        okText: '立即备份',
        cancelText: '稍后再说',
        body: `<p style="font-size:13.5px;line-height:1.8">你已经有 <b>${Math.floor(days)} 天</b> 没有导出备份了。数据只存在本机浏览器里，一旦清缓存或换设备就会丢失。</p>
          <p class="muted" style="font-size:12.5px;margin-top:8px">点「立即备份」会把全部数据下载成一个 JSON 文件，请妥善保存。</p>`,
        onOk: () => {
          const name = DB.exportJSON();
          U.toast(name ? `已备份「${name}」` : '备份失败', name ? 'ok' : 'warn');
        }
      }), 800);
    } else if (days >= 7) {
      setTimeout(() => U.toast(`你已经 ${Math.floor(days)} 天没有备份了，建议到「数据管理」点「立即备份」`, 'warn', 6000), 1000);
    }
  }

  function bootAndDemo() {
    boot();
    backupGuard();
    if (DB.data.__demo) {
      setTimeout(() => U.toast('已载入演示数据，可在「设置」中清空'), 600);
      delete DB.data.__demo; DB.save();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    get route() { return route; },
    go, boot, isPublic, refreshBadge, quickAddMenu, applyNight
  };
})();
