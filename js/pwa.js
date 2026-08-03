/* ===== PWA：安装到桌面 / 添加到主屏幕 =====
   纯网页能力，不生成原生 App、不打包 APK。
   生效前提：① 站点以 https 提供；② 根目录有 manifest.json（含 icons）。
   - 支持 beforeinstallprompt 的浏览器（Android Chrome/Edge、Windows/Mac Chrome/Edge）：
     捕获事件后由「安装到桌面」按钮触发原生安装对话框；并弹出顶部引导条。
   - iOS / iPadOS Safari、微信等 App 内浏览器：不会触发该事件，按钮改为「操作指引」，
     按设备给出「分享 → 添加到主屏幕」等手动步骤。
   注意：桌面快捷方式 / 主屏幕图标本质仍是网页入口，不是原生应用。 */
window.PWA = (function () {
  let deferred = null;
  let bannerShown = false;

  function onPrompt(e) {
    e.preventDefault();          // 用我们自己的按钮/引导条代替浏览器默认迷你条
    deferred = e;
    showBanner();
  }

  function showBanner() {
    if (bannerShown) return;
    if (document.getElementById('pwaBanner')) { bannerShown = true; return; }
    const bar = document.createElement('div');
    bar.id = 'pwaBanner';
    bar.className = 'pwa-banner';
    bar.innerHTML =
      '<div class="pwa-banner-txt"><svg class="ico"><use href="#i-download"/></svg>' +
      '<span>把「逸云阁」放到桌面，下次一点就开</span></div>' +
      '<div class="pwa-banner-actions">' +
      '<button class="btn btn-primary btn-sm" id="pwaInstallBtn2">安装到桌面</button>' +
      '<button class="btn btn-ghost btn-sm" id="pwaDismiss">暂不</button>' +
      '</div>';
    document.body.appendChild(bar);
    bannerShown = true;
    const inst = bar.querySelector('#pwaInstallBtn2');
    if (inst) inst.onclick = function () { promptInstall(); dismiss(); };
    const dis = bar.querySelector('#pwaDismiss');
    if (dis) dis.onclick = dismiss;
  }

  function dismiss() {
    const b = document.getElementById('pwaBanner');
    if (b) b.remove();
    bannerShown = false;
  }

  function promptInstall() {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; dismiss(); }).catch(function () { deferred = null; });
      return true;
    }
    return false;
  }

  // 按 UA 推断设备，给出「手动添加到主屏幕」步骤
  function platformSteps() {
    const ua = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
    const isIOS = /iP(ad|hone|od)/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    const isWin = /Win/.test(ua);
    const isMac = /Mac/.test(ua) && !isIOS;
    if (isIOS) {
      return { title: 'iPhone / iPad（用 Safari 打开）', steps: [
        '用系统 Safari 打开本网页（微信里请先点「… → 在浏览器打开」）',
        '点底部「分享」按钮（方框带向上箭头）',
        '向上滑找到并点「添加到主屏幕」',
        '改个名字（如「逸云阁」）→ 点右上角「添加」'
      ]};
    }
    if (isAndroid) {
      return { title: 'Android（用 Chrome / Edge 打开）', steps: [
        '用 Chrome 或 Edge 打开本网页',
        '点右上角「⋮」菜单',
        '选「安装应用」（或「添加到主屏幕」）',
        '确认名称 → 图标即进入桌面 / 应用抽屉'
      ]};
    }
    if (isWin) {
      return { title: 'Windows（Chrome / Edge）', steps: [
        '用 Chrome 或 Edge 打开本网页',
        '点右上角「⋮」→「安装应用」（或「更多工具 → 创建快捷方式」，可勾选「打开为窗口」）',
        '确认后会出现独立窗口与开始菜单 / 桌面图标'
      ]};
    }
    if (isMac) {
      return { title: 'macOS（Safari / Chrome）', steps: [
        'Safari：顶部菜单「文件 → 添加到个人收藏栏」，或「分享 → 添加到程序坞」',
        'Chrome：点「⋮」→「安装应用」/「更多工具 → 创建快捷方式」'
      ]};
    }
    return { title: '桌面浏览器', steps: [
      '用 Chrome / Edge 等打开本网页',
      '点右上角菜单「⋮」→「安装应用」或「创建快捷方式」',
      '或在地址栏左侧图标上点右键 →「创建快捷方式」'
    ]};
  }

  function init() {
    if (typeof window === 'undefined') return;
    if ('onbeforeinstallprompt' in window) {
      window.addEventListener('beforeinstallprompt', onPrompt);
    }
    window.addEventListener('appinstalled', function () { deferred = null; dismiss(); });
  }

  init();

  return {
    isInstallable: function () { return !!deferred; },
    prompt: promptInstall,
    platformSteps: platformSteps,
    dismiss: dismiss
  };
})();
