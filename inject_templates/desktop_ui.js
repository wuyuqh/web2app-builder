(function() {
  const appName = __W2A_APP_NAME_JSON__;
  const launchUrl = __W2A_LAUNCH_URL_JSON__;
  const enableTitleBar = __W2A_ENABLE_TITLE_BAR__;
  const showToolbar = __W2A_SHOW_TOOLBAR__;
  const enableCinema = __W2A_ENABLE_CINEMA__;
  const enableDownloadManager = __W2A_ENABLE_DOWNLOAD_MANAGER__;
  const defaultAlwaysOnTop = __W2A_DEFAULT_ALWAYS_ON_TOP__;
  __W2A_SHARED_PLAYBACK_STORE__

  const rememberEnabledKey = '__w2a_remember_exit_page_enabled__:' + appName;
  const rememberUrlKey = '__w2a_remember_exit_page_url__:' + appName;
  const rememberSessionKey = '__w2a_remember_exit_page_restored__';

  function storageGet(storage, key) {
    try { return storage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function storageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) {}
  }

  function storageRemove(storage, key) {
    try { storage.removeItem(key); } catch (e) {}
  }

  function normalizeRememberUrl(rawUrl) {
    try {
      const u = new URL(rawUrl, window.location.href);
      if (!/^https?:$/.test(u.protocol)) return '';
      if (launchUrl) {
        const base = new URL(launchUrl);
        if (base.origin && u.origin !== base.origin) return '';
      }
      const host = String(u.hostname || '').toLowerCase();
      if (host === 'accounts.google.com' || host === 'accounts.youtube.com') return '';
      // 过滤需要认证的深链接路径：记住这些路径会导致下次启动时
      // 直接跳到未认证页面，触发 307 重定向循环 → 黑屏。
      // 改为记住站点根路径，让 SPA 自己在认证后导航。
      const path = u.pathname || '';
      if (host === 'suno.com' && /^\/(create|library|song|playlist|account|settings)/i.test(path)) {
        return u.origin + '/';
      }
      return u.toString();
    } catch (e) {
      return '';
    }
  }

  function isRememberPageEnabled() {
    return storageGet(localStorage, rememberEnabledKey) === '1';
  }

  function setRememberPageEnabled(enabled) {
    if (enabled) storageSet(localStorage, rememberEnabledKey, '1');
    else {
      storageRemove(localStorage, rememberEnabledKey);
      storageRemove(localStorage, rememberUrlKey);
    }
  }

  function rememberCurrentUrl(force) {
    if (!force && !isRememberPageEnabled()) return '';
    const normalized = normalizeRememberUrl(window.location.href);
    if (!normalized) return '';
    storageSet(localStorage, rememberUrlKey, normalized);
    return normalized;
  }

  function maybeRestoreRememberedPage() {
    if (storageGet(sessionStorage, rememberSessionKey) === '1') return false;
    storageSet(sessionStorage, rememberSessionKey, '1');
    if (!isRememberPageEnabled()) return false;
    const saved = normalizeRememberUrl(storageGet(localStorage, rememberUrlKey));
    const current = normalizeRememberUrl(window.location.href);
    if (!saved || !current || saved === current) {
      if (current) rememberCurrentUrl(true);
      return false;
    }
    window.location.replace(saved);
    return true;
  }

  function installRememberPageHooks() {
    const scheduleRemember = function() {
      window.setTimeout(function() { rememberCurrentUrl(false); }, 80);
    };
    window.addEventListener('beforeunload', function() { rememberCurrentUrl(false); });
    window.addEventListener('pagehide', function() { rememberCurrentUrl(false); });
    window.addEventListener('hashchange', scheduleRemember);
    window.addEventListener('popstate', scheduleRemember);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') rememberCurrentUrl(false);
    });
    try {
      const rawPushState = history.pushState;
      if (typeof rawPushState === 'function' && !history.__w2aRememberWrappedPush) {
        history.pushState = function() {
          const result = rawPushState.apply(this, arguments);
          scheduleRemember();
          return result;
        };
        history.__w2aRememberWrappedPush = true;
      }
      const rawReplaceState = history.replaceState;
      if (typeof rawReplaceState === 'function' && !history.__w2aRememberWrappedReplace) {
        history.replaceState = function() {
          const result = rawReplaceState.apply(this, arguments);
          scheduleRemember();
          return result;
        };
        history.__w2aRememberWrappedReplace = true;
      }
    } catch (e) {}
    rememberCurrentUrl(false);
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function installEarlyDesktopBootstrap() {
    if (window.__W2A_EARLY_BOOTSTRAP__) return window.__W2A_EARLY_BOOTSTRAP__;
    const host = document.body || document.documentElement;
    if (!host) return null;
    const state = {
      cleanupFns: [],
      cleanup: function() {
        while (state.cleanupFns.length) {
          try {
            const fn = state.cleanupFns.pop();
            if (typeof fn === 'function') fn();
          } catch (e) {}
        }
      }
    };

    function mountNode(node, parent) {
      (parent || host).appendChild(node);
      state.cleanupFns.push(function() {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
      return node;
    }

    function copyTextFallback(text) {
      const raw = String(text || '');
      if (!raw) return;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(raw).catch(function() {});
        return;
      }
      try {
        const textarea = document.createElement('textarea');
        textarea.value = raw;
        textarea.setAttribute('readonly', '');
        textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      } catch (e) {}
    }

    function execEditableCommand(command) {
      try { document.execCommand(command); } catch (e) {}
    }

    function getSelectionText() {
      try {
        return String(window.getSelection ? (window.getSelection().toString() || '') : '').trim();
      } catch (e) {
        return '';
      }
    }

    function getBestVideo() {
      try {
        const nodes = Array.prototype.slice.call(document.querySelectorAll('video'));
        let best = null;
        let bestArea = -1;
        nodes.forEach(function(video) {
          if (!video) return;
          const rect = typeof video.getBoundingClientRect === 'function' ? video.getBoundingClientRect() : null;
          const area = rect ? Math.max(0, rect.width || 0) * Math.max(0, rect.height || 0) : 0;
          if (area >= bestArea) {
            best = video;
            bestArea = area;
          }
        });
        return best || document.querySelector('video');
      } catch (e) {
        return document.querySelector('video');
      }
    }

    if (!document.getElementById('__w2a_boot_style') && !document.getElementById('__w2a_drag')) {
      const style = document.createElement('style');
      style.id = '__w2a_boot_style';
      style.textContent = [
        '#__w2a_boot_drag{position:fixed;top:0;left:0;right:0;height:34px;z-index:2147483645;pointer-events:auto;-webkit-app-region:drag;user-select:none;-webkit-user-select:none;background:linear-gradient(180deg,rgba(12,12,14,0.22),rgba(12,12,14,0));backdrop-filter:blur(8px)}',
        '#__w2a_boot_drag .__w2a_boot_actions{position:absolute;top:5px;right:12px;display:flex;gap:8px;align-items:center}',
        '#__w2a_boot_drag.mac-full{height:40px;background:linear-gradient(180deg,rgba(22,22,26,0.72),rgba(22,22,26,0.28));backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,0.08)}',
        '#__w2a_boot_drag.mac-full .__w2a_boot_actions{top:6px;right:12px;gap:8px}',
        // 禁止纯白圆形 boot 按钮（曾被识别为右上角无作用 ⚪️）
        '#__w2a_boot_drag .__w2a_boot_btn{width:28px;height:28px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.16);background:rgba(28,28,32,0.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;line-height:1;box-shadow:0 4px 12px rgba(0,0,0,0.18);-webkit-app-region:no-drag;padding:0;position:relative;opacity:1;transform:none}',
        '#__w2a_boot_drag .__w2a_boot_btn svg{width:15px;height:15px;display:block;stroke:currentColor;stroke-width:2.1;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;flex:none}',
        '#__w2a_boot_drag .__w2a_boot_btn:hover{background:rgba(36,36,42,0.72)}',
        '#__w2a_boot_drag .__w2a_boot_btn[data-tip]::after{content:attr(data-tip);position:absolute;top:36px;left:50%;transform:translate(-50%,-4px);padding:4px 8px;border-radius:8px;background:rgba(12,12,12,0.92);color:#fff;font-size:10px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .16s ease, transform .16s ease;box-shadow:0 6px 20px rgba(0,0,0,0.22)}',
        '#__w2a_boot_drag .__w2a_boot_btn:hover::after{opacity:1;transform:translate(-50%,0)}',
        '#__w2a_boot_refresh svg{width:16.5px;height:16.5px;stroke-width:2.35}',
        '#__w2a_boot_ctx_menu{position:fixed;z-index:2147483646;display:none;min-width:172px;padding:6px;background:rgba(24,24,28,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.34);backdrop-filter:blur(16px);color:#fff;font:13px/1.3 -apple-system,BlinkMacSystemFont,sans-serif}',
        '#__w2a_boot_ctx_menu.show{display:block}',
        '#__w2a_boot_ctx_menu .item{display:flex;align-items:center;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
        '#__w2a_boot_ctx_menu .item:hover{background:rgba(255,255,255,0.1)}',
        '#__w2a_boot_ctx_menu .divider{height:1px;margin:6px 2px;background:rgba(255,255,255,0.08)}',
        '#__w2a_boot_cinema_trigger{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:40px;height:40px;border-radius:20px;border:1px solid rgba(255,255,255,0.18);background:rgba(28,28,32,0.78);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:rgba(255,255,255,0.94);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.28);font:18px/1 -apple-system,BlinkMacSystemFont,sans-serif;transition:transform .2s,opacity .2s}',
        '#__w2a_boot_cinema_panel{position:fixed;right:18px;bottom:76px;z-index:2147483646;display:none;width:min(260px,calc(100vw - 24px));background:rgba(22,22,24,0.94);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:12px;color:#f2f2f2;font:12px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,0.3)}',
        '#__w2a_boot_cinema_panel.show{display:block}',
        '#__w2a_boot_cinema_panel .title{font-size:13px;font-weight:600;margin-bottom:10px}',
        '#__w2a_boot_cinema_panel .row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0}',
        '#__w2a_boot_cinema_panel .btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
        '#__w2a_boot_cinema_panel button{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:11px}',
        '#__w2a_boot_cinema_panel button.active{background:rgba(0,122,255,0.85);border-color:rgba(0,122,255,0.9)}',
        '#__w2a_boot_cinema_hint{font-size:10px;color:#8ec7ff;padding-top:2px}'
      ].join('\n');
      mountNode(style, document.head || document.documentElement);
    }

    // P3 终态：Mac 上彻底不再创建 boot 顶栏（白底圆形 __w2a_boot_btn 是右上角 ⚪️ 主因之一）
    // 完整 UI 会立刻接管；非 Mac 仍可短暂 boot 过渡
    const bootIsMac = /mac/i.test(String(navigator.platform || '') + ' ' + String(navigator.userAgent || ''));
    const allowBootChrome = !bootIsMac && (enableTitleBar || showToolbar);
    if (allowBootChrome && !document.getElementById('__w2a_drag') && !document.getElementById('__w2a_boot_drag')) {
      const drag = document.createElement('div');
      drag.id = '__w2a_boot_drag';
      drag.setAttribute('data-tauri-drag-region', '');
      const actions = document.createElement('div');
      actions.className = '__w2a_boot_actions';
      drag.appendChild(actions);
      const buttons = [
        { text: '←', tip: '后退', run: function() { history.back(); } },
        { text: '→', tip: '前进', run: function() { history.forward(); } },
        { html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3v6h-6"></path><path d="M20.49 15A9 9 0 1 1 17 5.13L21 9"></path></svg>', id: '__w2a_boot_refresh', tip: '刷新页面', run: function() { location.reload(); } },
        { text: '⌘', tip: '复制页面地址', run: function() { copyTextFallback(location.href); } }
      ];
      buttons.forEach(function(item) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = '__w2a_boot_btn';
        if (item.id) btn.id = item.id;
        if (item.html) btn.innerHTML = item.html;
        else btn.textContent = item.text;
        btn.title = item.tip;
        btn.dataset.tip = item.tip;
        btn.setAttribute('aria-label', item.tip);
        btn.addEventListener('click', function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          try { item.run(); } catch (e) {}
        });
        actions.appendChild(btn);
      });
      mountNode(drag);
    }

    if (!document.getElementById('__w2a_ctx_menu') && !document.getElementById('__w2a_boot_ctx_menu')) {
      const menu = document.createElement('div');
      menu.id = '__w2a_boot_ctx_menu';
      mountNode(menu);
      let menuOpen = false;

      function hideMenu() {
        menu.classList.remove('show');
        menuOpen = false;
      }

      function showMenu(x, y) {
        const width = 188;
        const height = Math.max(160, menu.offsetHeight || 180);
        const maxX = Math.max(8, window.innerWidth - width - 8);
        const maxY = Math.max(8, window.innerHeight - height - 8);
        menu.style.left = Math.min(Math.max(8, x), maxX) + 'px';
        menu.style.top = Math.min(Math.max(8, y), maxY) + 'px';
        menu.classList.add('show');
        menuOpen = true;
      }

      function buildMenuForEvent(ev) {
        const target = ev && ev.target;
        const selectionText = getSelectionText();
        const isEditable = !!(target && (target.isContentEditable || /^(INPUT|TEXTAREA)$/i.test(String(target.tagName || ''))));
        const items = [
          { label: '后退', action: function() { history.back(); } },
          { label: '前进', action: function() { history.forward(); } },
          { label: '刷新', action: function() { location.reload(); } },
          { divider: true },
          { label: '复制页面地址', action: function() { copyTextFallback(location.href); } }
        ];
        if (selectionText) {
          items.push({ label: '复制所选内容', action: function() { copyTextFallback(selectionText); } });
          items.push({ label: '搜索所选内容', action: function() { window.open('https://www.google.com/search?q=' + encodeURIComponent(selectionText), '_blank'); } });
        }
        if (isEditable) {
          items.push({ divider: true });
          items.push({ label: '剪切', action: function() { execEditableCommand('cut'); } });
          items.push({ label: '复制', action: function() { execEditableCommand('copy'); } });
          items.push({ label: '粘贴', action: function() { execEditableCommand('paste'); } });
          items.push({ label: '全选', action: function() { execEditableCommand('selectAll'); } });
        }
        menu.innerHTML = '';
        items.forEach(function(item) {
          if (item.divider) {
            const divider = document.createElement('div');
            divider.className = 'divider';
            menu.appendChild(divider);
            return;
          }
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'item';
          btn.textContent = item.label;
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            hideMenu();
            try { item.action(); } catch (err) {}
          });
          menu.appendChild(btn);
        });
      }

      const onContextMenu = function(ev) {
        if (window.__W2A_TAURI_UI_FULL__) return;
        if (menu.contains(ev.target)) return;
        buildMenuForEvent(ev);
        ev.preventDefault();
        ev.stopPropagation();
        showMenu(ev.clientX, ev.clientY);
      };
      const onPointerDown = function(ev) {
        if (!menuOpen) return;
        if (menu.contains(ev.target)) return;
        hideMenu();
      };
      const onViewportChange = function() {
        if (menuOpen) hideMenu();
      };

      document.addEventListener('contextmenu', onContextMenu, true);
      document.addEventListener('click', onPointerDown, true);
      document.addEventListener('scroll', onViewportChange, true);
      window.addEventListener('blur', onViewportChange);
      window.addEventListener('resize', onViewportChange);
      state.cleanupFns.push(function() { document.removeEventListener('contextmenu', onContextMenu, true); });
      state.cleanupFns.push(function() { document.removeEventListener('click', onPointerDown, true); });
      state.cleanupFns.push(function() { document.removeEventListener('scroll', onViewportChange, true); });
      state.cleanupFns.push(function() { window.removeEventListener('blur', onViewportChange); });
      state.cleanupFns.push(function() { window.removeEventListener('resize', onViewportChange); });
    }

    if (enableCinema && !document.getElementById('__w2a_cinema_trigger') && !document.getElementById('__w2a_boot_cinema_trigger')) {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = '__w2a_boot_cinema_trigger';
      trigger.textContent = '🎬';
      trigger.title = '打开视频增强';
      const panel = document.createElement('div');
      panel.id = '__w2a_boot_cinema_panel';
      panel.innerHTML = '<div class=\"title\">影视增强</div><div class=\"row\"><span>播放控制</span><div class=\"btns\" id=\"__w2a_boot_play_btns\"></div></div><div class=\"row\"><span>播放速度</span><div class=\"btns\" id=\"__w2a_boot_speed_btns\"></div></div><div class=\"row\"><span>显示模式</span><div class=\"btns\" id=\"__w2a_boot_mode_btns\"></div></div><div id=\"__w2a_boot_cinema_hint\">未检测到视频时会自动等待页面中的播放器出现</div>';
      mountNode(trigger);
      mountNode(panel);

      function findVideoOrHint() {
        const video = getBestVideo();
        const hint = document.getElementById('__w2a_boot_cinema_hint');
        if (hint) hint.textContent = video ? '已连接到当前页面中的视频元素' : '未检测到视频时会自动等待页面中的播放器出现';
        return video;
      }

      function bindActionButtons(containerId, specs) {
        const wrap = document.getElementById(containerId);
        if (!wrap) return;
        specs.forEach(function(spec) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = spec.label;
          btn.addEventListener('click', function() {
            const video = findVideoOrHint();
            if (!video) return;
            try { spec.run(video, btn, wrap); } catch (e) {}
          });
          wrap.appendChild(btn);
        });
      }

      bindActionButtons('__w2a_boot_play_btns', [
        { label: '播放/暂停', run: function(video) { if (video.paused) video.play().catch(function() {}); else video.pause(); } },
        { label: '全屏', run: function(video) { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function() {}); else if (video.requestFullscreen) video.requestFullscreen().catch(function() {}); } },
        { label: '画中画', run: function(video) { if (document.pictureInPictureElement && document.exitPictureInPicture) document.exitPictureInPicture().catch(function() {}); else if (document.pictureInPictureEnabled && video.requestPictureInPicture) video.requestPictureInPicture().catch(function() {}); } }
      ]);
      bindActionButtons('__w2a_boot_speed_btns', [
        { label: '1x', run: function(video, btn, wrap) { video.playbackRate = 1; wrap.querySelectorAll('button').forEach(function(node) { node.classList.remove('active'); }); btn.classList.add('active'); } },
        { label: '1.5x', run: function(video, btn, wrap) { video.playbackRate = 1.5; wrap.querySelectorAll('button').forEach(function(node) { node.classList.remove('active'); }); btn.classList.add('active'); } },
        { label: '2x', run: function(video, btn, wrap) { video.playbackRate = 2; wrap.querySelectorAll('button').forEach(function(node) { node.classList.remove('active'); }); btn.classList.add('active'); } }
      ]);
      bindActionButtons('__w2a_boot_mode_btns', [
        { label: '影院模式', run: function(video, btn) { btn.classList.toggle('active'); if (btn.classList.contains('active')) { video.style.background = '#000'; video.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.72)'; video.style.position = 'relative'; video.style.zIndex = '2147483644'; } else { video.style.background = ''; video.style.boxShadow = ''; video.style.position = ''; video.style.zIndex = ''; } } },
        { label: '恢复', run: function(video, btn, wrap) { video.playbackRate = 1; video.style.background = ''; video.style.boxShadow = ''; video.style.position = ''; video.style.zIndex = ''; const speedWrap = document.getElementById('__w2a_boot_speed_btns'); if (speedWrap) speedWrap.querySelectorAll('button').forEach(function(node) { node.classList.remove('active'); }); wrap.querySelectorAll('button').forEach(function(node) { if (node !== btn) node.classList.remove('active'); }); } }
      ]);

      trigger.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        panel.classList.toggle('show');
        findVideoOrHint();
      });
      const onPanelOutsideClick = function(ev) {
        if (!panel.classList.contains('show')) return;
        if (panel.contains(ev.target) || trigger.contains(ev.target)) return;
        panel.classList.remove('show');
      };
      document.addEventListener('click', onPanelOutsideClick, true);
      state.cleanupFns.push(function() { document.removeEventListener('click', onPanelOutsideClick, true); });
    }

    window.__W2A_EARLY_BOOTSTRAP__ = state;
    return state;
  }

  function getTauriInvoke() {
    if (typeof window.__W2A_TAURI_INVOKE_PROXY__ === 'function') return window.__W2A_TAURI_INVOKE_PROXY__;
    if (typeof window.__W2A_TAURI_RAW_INVOKE__ === 'function') return window.__W2A_TAURI_RAW_INVOKE__;
    const tauri = window.__TAURI__ || {};
    if (tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
    if (typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    return null;
  }

  async function maybePromptMacInstallerCleanup() {
    if (!/mac/i.test(String(navigator.platform || ''))) return;
    const invoke = getTauriInvoke();
    if (!invoke) return;
    let status = null;
    try {
      status = await invoke('get_mac_installer_cleanup_status');
    } catch (e) {
      return;
    }
    if (!status || !status.should_prompt) return;
    const lines = [
      '检测到安装磁盘仍在挂载。',
      '清理后会退出安装磁盘，并将本地安装包移到废纸篓。',
      '这不会影响 Applications 里的正式应用。'
    ];
    if (status.mounted_volume) lines.push('磁盘位置：' + status.mounted_volume);
    if (status.image_path) lines.push('镜像文件：' + status.image_path);
    const confirmed = window.confirm(lines.join('\\n\\n'));
    if (!confirmed) return;
    try {
      const result = await invoke('cleanup_mac_installer');
      window.alert(String(result || '已完成清理'));
    } catch (err) {
      window.alert(String((err && err.message) || err || '请稍后手动退出磁盘并删除安装镜像'));
    }
  }

  function runInitStage(label, fn, fallbackValue) {
    try {
      return fn();
    } catch (e) {
      console.error('[W2A] ' + label + ' 执行出错:', e && e.message ? e.message : e, e && e.stack ? e.stack : '');
      return fallbackValue;
    }
  }

  onReady(function() {
    try {
    // 守卫置于最前：防止认证重定向导致 onReady 二次执行时重复构建 UI
    if (window.__W2A_TAURI_UI__) return;
    window.__W2A_TAURI_UI__ = true;
    installEarlyDesktopBootstrap();
    // 下载拦截必须在 remember-page 之前就位，避免 location.replace 期间下载失效
    runInitStage('patchDownloadInvoke', function() { patchDownloadInvoke(); }, null);
    runInitStage('patchNativeDownloads', function() { patchNativeDownloads(); }, null);
    if (runInitStage('maybeRestoreRememberedPage', function() { return maybeRestoreRememberedPage(); }, false)) return;
    runInitStage('installRememberPageHooks', function() { installRememberPageHooks(); }, null);

    let tauriWinCache = null;
    function resolveTauriWindow() {
      if (tauriWinCache) return tauriWinCache;
      const tauri = window.__TAURI__;
      if (!tauri) return null;
      const factories = [
        tauri.window && tauri.window.getCurrentWindow,
        tauri.webviewWindow && tauri.webviewWindow.getCurrentWebviewWindow,
        tauri.window && tauri.window.getCurrent,
        tauri.webviewWindow && tauri.webviewWindow.getCurrent
      ];
      for (let i = 0; i < factories.length; i++) {
        const factory = factories[i];
        if (typeof factory !== 'function') continue;
        try {
          const win = factory();
          if (win) {
            tauriWinCache = win;
            return win;
          }
        } catch (e) {}
      }
      const fallback = (tauri.window && tauri.window.appWindow) || (tauri.webviewWindow && tauri.webviewWindow.appWindow) || null;
      if (fallback) tauriWinCache = fallback;
      return fallback;
    }

    function withTauriWindow(handler) {
      const win = resolveTauriWindow();
      if (!win) return Promise.resolve(null);
      try {
        return Promise.resolve(handler(win)).catch(function(err) {
          console.warn('[W2A] Tauri window API 调用失败:', err && err.message ? err.message : err);
          return null;
        });
      } catch (e) {
        console.warn('[W2A] Tauri window API 不可用:', e && e.message ? e.message : e);
        return Promise.resolve(null);
      }
    }

    function tauriInvoke(cmd, args) {
      try {
        const invoke = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
          || (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
        if (typeof invoke !== 'function') return Promise.reject(new Error('no invoke'));
        return Promise.resolve(invoke(cmd, args || {}));
      } catch (e) {
        return Promise.reject(e);
      }
    }

    function resolveWindowLabel() {
      try {
        const win = resolveTauriWindow();
        if (win && win.label) return String(win.label);
      } catch (e) {}
      return 'main';
    }

    function setWindowAlwaysOnTop(value) {
      const next = !!value;
      return withTauriWindow(function(win) {
        if (win && typeof win.setAlwaysOnTop === 'function') {
          return win.setAlwaysOnTop(next);
        }
        return null;
      }).then(function(result) {
        if (result !== null && result !== undefined) return result;
        // 方法不可用时走 plugin invoke 兜底（Pake 窗口 label 多为 main/pake）
        const labels = [resolveWindowLabel(), 'main', 'pake'];
        let chain = Promise.reject(new Error('start'));
        labels.forEach(function(label) {
          chain = chain.catch(function() {
            return tauriInvoke('plugin:window|set_always_on_top', { label: label, value: next });
          });
        });
        return chain;
      });
    }

    function getWindowAlwaysOnTop() {
      return withTauriWindow(function(win) {
        if (win && typeof win.isAlwaysOnTop === 'function') return win.isAlwaysOnTop();
        return null;
      }).then(function(result) {
        if (typeof result === 'boolean') return result;
        const labels = [resolveWindowLabel(), 'main', 'pake'];
        let chain = Promise.reject(new Error('start'));
        labels.forEach(function(label) {
          chain = chain.catch(function() {
            return tauriInvoke('plugin:window|is_always_on_top', { label: label });
          });
        });
        return chain.catch(function() { return null; });
      });
    }

    // WKWebView 上 platform 偶发为空；结合 UA / 系统特征综合判断
    const isMacDesktop = (function() {
      try {
        const plat = String(navigator.platform || '');
        const ua = String(navigator.userAgent || '');
        if (/mac|macintosh|mac os x/i.test(plat + ' ' + ua)) return true;
        if (navigator.userAgentData && /mac/i.test(String(navigator.userAgentData.platform || ''))) return true;
      } catch (e) {}
      // Tauri macOS 构建兜底：无 Android/Windows 痕迹时按 Mac 处理
      try {
        const ua = String(navigator.userAgent || '').toLowerCase();
        if (ua && !/android|windows|linux|cros/.test(ua)) return true;
      } catch (e2) {}
      return false;
    })();
    // 独立浮层根节点：挂到 <html>，避免站点 body transform / overflow 把 fixed 控件吸到页面底部
    let uiRoot = document.getElementById('__w2a_ui_root');
    if (!uiRoot) {
      uiRoot = document.createElement('div');
      uiRoot.id = '__w2a_ui_root';
      (document.documentElement || document.body).appendChild(uiRoot);
    }
    function mountUi(node) {
      uiRoot.appendChild(node);
      return node;
    }

    // P1：完整 UI 就绪后强制清除 early-bootstrap 残留（含旧白点热区）
    function purgeEarlyBootstrapDom() {
      try {
        const ids = [
          '__w2a_boot_drag', '__w2a_boot_ctx_menu',
          '__w2a_boot_cinema_trigger', '__w2a_boot_cinema_panel',
          '__w2a_boot_refresh',
          '__w2a_traffic_dots', '__w2a_traffic_hotedge'
        ];
        ids.forEach(function(id) {
          const el = document.getElementById(id);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        // 清除可能残留的 boot 样式节点（无 id 时按文本特征匹配）
        Array.from(document.querySelectorAll('style')).forEach(function(st) {
          const txt = String(st.textContent || '');
          if (txt.indexOf('#__w2a_boot_drag') >= 0 && st.id !== '__w2a_ui_style') {
            if (st.parentNode) st.parentNode.removeChild(st);
          }
        });
      } catch (e) {}
      try {
        if (window.__W2A_EARLY_BOOTSTRAP__ && typeof window.__W2A_EARLY_BOOTSTRAP__.cleanup === 'function') {
          window.__W2A_EARLY_BOOTSTRAP__.cleanup();
        }
        window.__W2A_EARLY_BOOTSTRAP__ = null;
      } catch (e2) {}
    }
    purgeEarlyBootstrapDom();

    // 始终覆盖写入样式，避免旧版/残缺 style 残留导致「只有 emoji、面板无样式」
    (function injectUiStyles() {
    let style = document.getElementById('__w2a_ui_style');
    if (!style) {
      style = document.createElement('style');
      style.id = '__w2a_ui_style';
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = [
      '#__w2a_ui_root{position:fixed !important;inset:0 !important;width:100% !important;height:100% !important;pointer-events:none !important;z-index:2147483646 !important;overflow:visible !important;transform:none !important;contain:none !important}',
      '#__w2a_ui_root > *{pointer-events:auto}',
      '#pake-top-dom{background:transparent !important;border:0 !important;border-radius:0 !important;box-shadow:none !important;outline:0 !important;color:transparent !important;opacity:1 !important;overflow:hidden !important}',
      '#pake-top-dom::before,#pake-top-dom::after{display:none !important;content:none !important;background:transparent !important;border:0 !important;box-shadow:none !important}',
      'html.__w2a_video_immersive #pake-top-dom,body.__w2a_video_immersive #pake-top-dom,body.pake-fullscreen-active #pake-top-dom{display:none !important;visibility:hidden !important;pointer-events:none !important}',
      '#__w2a_drag{position:fixed !important;top:0 !important;left:0 !important;right:0 !important;height:34px;z-index:2147483646;pointer-events:auto;-webkit-app-region:drag;user-select:none;-webkit-user-select:none}',
      '.__w2a_drag_buttons{position:absolute;top:6px;display:flex;gap:8px;align-items:center}',
      '.__w2a_drag_buttons.right{right:12px !important;left:auto !important}',
      '.__w2a_btn{width:28px;height:28px;border-radius:14px;border:1px solid rgba(255,255,255,0.18);background:rgba(18,18,18,0.42);backdrop-filter:blur(12px);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;line-height:1;box-shadow:0 2px 10px rgba(0,0,0,0.18);position:relative;-webkit-app-region:no-drag;padding:0}',
      '.__w2a_btn:hover{background:rgba(18,18,18,0.6)}',
      '.__w2a_btn.active{background:rgba(0,122,255,0.82);border-color:rgba(0,122,255,0.9)}',
      '.__w2a_btn svg{width:15px;height:15px;display:block;stroke:currentColor;stroke-width:2.1;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;flex:none}',
      '.__w2a_btn[data-tip]::after{content:attr(data-tip);position:absolute;top:36px;left:50%;transform:translate(-50%,-4px);padding:4px 8px;border-radius:8px;background:rgba(12,12,12,0.88);color:#fff;font-size:10px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .16s ease, transform .16s ease;box-shadow:0 6px 20px rgba(0,0,0,0.22)}',
      '.__w2a_btn[data-tip]:hover::after{opacity:1;transform:translate(-50%,0)}',
      // 禁用任何残留 boot/旧 drag 伪元素
      '#__w2a_drag::before,#__w2a_boot_drag::before{display:none !important;content:none !important}',
      // 废弃节点：永不显示（不碰正常工具栏）
      '#__w2a_traffic_dots,#__w2a_traffic_dots *,#__w2a_traffic_hotedge{display:none !important;visibility:hidden !important;pointer-events:none !important}',
      '#__w2a_boot_drag,#__w2a_boot_drag *,.__w2a_boot_btn{display:none !important;visibility:hidden !important;pointer-events:none !important}',
      // 工具栏：简洁可靠（恢复可呼出控制栏）
      '#__w2a_drag.mac-hover,#__w2a_drag.toolbar-right{height:0 !important;background:transparent !important;border:0 !important;pointer-events:none !important}',
      '#__w2a_toolbar{pointer-events:auto !important;-webkit-app-region:no-drag !important;transition:max-width .22s cubic-bezier(.2,.8,.2,1), opacity .18s ease !important}',
      // peek 样式全部 !important，防止站点 button{background:#fff} 把呼出钮盖成纯白 ⚪️
      '#__w2a_toolbar_peek{display:inline-flex !important;align-items:center !important;justify-content:center !important;width:30px !important;height:30px !important;min-width:30px !important;min-height:30px !important;border-radius:10px !important;background:rgba(28,28,32,0.72) !important;backdrop-filter:blur(28px) saturate(1.7) !important;-webkit-backdrop-filter:blur(28px) saturate(1.7) !important;border:0.5px solid rgba(255,255,255,0.2) !important;box-shadow:0 6px 18px rgba(0,0,0,0.22), inset 0 0.5px 0 rgba(255,255,255,0.18) !important;color:rgba(255,255,255,0.94) !important;padding:0 !important;margin:0 !important;cursor:pointer !important}',
      '#__w2a_toolbar_peek:hover{background:rgba(36,36,42,0.82) !important;border-color:rgba(255,255,255,0.28) !important}',
      '#__w2a_toolbar_peek svg{width:14px !important;height:14px !important;display:block !important;fill:currentColor !important;stroke:none !important;color:rgba(255,255,255,0.94) !important}',
      '#__w2a_toolbar.is-expanded #__w2a_toolbar_peek{display:none !important}',
      // 播放沉浸：收起态必须「真消失」（仅 opacity 会在深色视频上残留纯白圆点）
      // 展开态 / 热区呼出仍可用；不卸 DOM、不破坏控制栏结构
      '#__w2a_toolbar.is-immersive-hidden{opacity:0 !important;visibility:hidden !important;pointer-events:none !important}',
      '#__w2a_toolbar.is-immersive-hidden #__w2a_toolbar_peek{opacity:0 !important;visibility:hidden !important;background:transparent !important;box-shadow:none !important;border-color:transparent !important}',
      'html.__w2a_video_immersive #__w2a_toolbar:not(.is-expanded),body.__w2a_video_immersive #__w2a_toolbar:not(.is-expanded){opacity:0 !important;visibility:hidden !important;pointer-events:none !important}',
      'html.__w2a_video_immersive #__w2a_toolbar:not(.is-expanded) #__w2a_toolbar_peek,body.__w2a_video_immersive #__w2a_toolbar:not(.is-expanded) #__w2a_toolbar_peek{opacity:0 !important;visibility:hidden !important;background:transparent !important;box-shadow:none !important;border-color:transparent !important}',
      'html.__w2a_video_immersive #__w2a_toolbar.is-expanded,body.__w2a_video_immersive #__w2a_toolbar.is-expanded{opacity:1 !important;visibility:visible !important;pointer-events:auto !important}',
      '#__w2a_toolbar_hotedge{position:fixed !important;top:0 !important;right:0 !important;width:100px !important;height:28px !important;z-index:2147483645 !important;pointer-events:none !important;background:transparent !important}',
      '#__w2a_toolbar_hotedge.active{pointer-events:auto !important}',
      '#__w2a_drag_strip{-webkit-app-region:drag !important;pointer-events:auto !important}',
      '.__w2a_btn{width:28px !important;height:28px !important;min-width:28px !important;min-height:28px !important;font-size:13px !important;border-radius:8px !important;border:0 !important;background:transparent !important;color:rgba(255,255,255,0.92) !important;box-shadow:none !important;-webkit-app-region:no-drag !important;pointer-events:auto !important;transition:background .15s ease,color .15s ease,transform .12s ease}',
      '.__w2a_btn svg{width:15px !important;height:15px !important;display:block !important;stroke:currentColor !important;fill:none !important;stroke-width:1.9 !important;stroke-linecap:round !important;stroke-linejoin:round !important}',
      '.__w2a_btn:hover{background:rgba(255,255,255,0.14) !important;color:#fff !important}',
      '.__w2a_btn:active{transform:scale(0.94)}',
      '.__w2a_btn.active{background:rgba(10,132,255,0.28) !important;color:#6cb6ff !important}',
      '#__w2a_search_bar,#__w2a_download_panel,#__w2a_ctx_menu,#__w2a_cinema_trigger,#__w2a_cinema_panel,#__w2a_lock_trigger,#__w2a_lock_overlay{position:fixed !important}',
      '#__w2a_search_bar{position:fixed;top:46px;right:12px;z-index:2147483647;display:none;align-items:center;gap:6px;background:rgba(28,28,30,0.72);border:1px solid rgba(255,255,255,0.12);backdrop-filter:blur(28px) saturate(1.5);-webkit-backdrop-filter:blur(28px) saturate(1.5);border-radius:12px;padding:8px 10px;box-shadow:0 12px 32px rgba(0,0,0,0.28)}',
      '#__w2a_search_bar.show{display:flex}',
      '#__w2a_search_bar input{width:220px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.08);color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;outline:none}',
      '#__w2a_search_bar input::placeholder{color:rgba(255,255,255,0.45)}',
      '#__w2a_search_count{font-size:10px;color:rgba(255,255,255,0.7);min-width:42px;text-align:center}',
      '#__w2a_download_panel{position:fixed;top:52px;right:12px;z-index:2147483647;display:none;width:min(360px,calc(100vw - 24px));max-height:min(60vh,420px);overflow:auto;background:rgba(28,28,30,0.88);border:1px solid rgba(255,255,255,0.12);backdrop-filter:blur(28px) saturate(1.5);-webkit-backdrop-filter:blur(28px) saturate(1.5);border-radius:14px;padding:10px;color:#f5f5f7;box-shadow:0 16px 40px rgba(0,0,0,0.35)}',
      '#__w2a_download_panel.show{display:block !important}',
      '#__w2a_download_panel .dp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}',
      '#__w2a_download_panel .dp-title{font-size:13px;font-weight:600}',
      '#__w2a_download_panel .dp-actions{display:flex;gap:6px;align-items:center}',
      '#__w2a_download_panel .dp-close{width:28px;height:28px;border:0;border-radius:8px;background:rgba(120,120,128,0.24);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '#__w2a_download_panel .dp-close:hover{background:rgba(255,69,58,0.85)}',
      '#__w2a_download_panel .dp-list{display:flex;flex-direction:column;gap:8px}',
      '#__w2a_download_panel .dp-empty{font-size:11px;color:rgba(255,255,255,0.55);padding:10px 2px 6px}',
      '#__w2a_download_panel .dp-item{padding:8px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);transition:border-color .18s ease, background .18s ease, box-shadow .18s ease}',
      '#__w2a_download_panel .dp-item.is-progress{background:rgba(32,86,170,0.16);border-color:rgba(90,164,255,0.32);box-shadow:0 0 0 1px rgba(90,164,255,0.08) inset}',
      '#__w2a_download_panel .dp-item.is-success{background:rgba(18,88,170,0.12);border-color:rgba(76,150,255,0.28)}',
      '#__w2a_download_panel .dp-item.is-error{background:rgba(136,34,44,0.16);border-color:rgba(255,105,120,0.26)}',
      '#__w2a_download_panel .dp-row{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '#__w2a_download_panel .dp-name{font-size:12px;font-weight:500;line-height:1.35;word-break:break-all}',
      '#__w2a_download_panel .dp-status{font-size:10px;color:rgba(255,255,255,0.62);margin-top:4px}',
      '#__w2a_download_panel .dp-status-tag{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:0;flex:none}',
      '#__w2a_download_panel .dp-item.is-progress .dp-status-tag{background:rgba(64,145,255,0.2);color:#9fd0ff}',
      '#__w2a_download_panel .dp-item.is-success .dp-status-tag{background:rgba(56,132,255,0.18);color:#9fc8ff}',
      '#__w2a_download_panel .dp-item.is-error .dp-status-tag{background:rgba(255,95,110,0.18);color:#ffb6bf}',
      '#__w2a_download_panel .dp-path{font-size:10px;color:#8ec7ff;margin-top:4px;word-break:break-all}',
      '#__w2a_download_panel .dp-progress{height:5px;border-radius:999px;background:rgba(255,255,255,0.09);overflow:hidden;margin-top:7px}',
      '#__w2a_download_panel .dp-progress > span{display:block;height:100%;width:0;background:linear-gradient(90deg,#42a5ff,#0a84ff);border-radius:999px;transition:width .18s ease}',
      '#__w2a_download_panel .dp-item.is-progress .dp-progress > span{animation:w2aDownloadPulse 1.4s ease-in-out infinite alternate}',
      '#__w2a_download_panel .dp-actions-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}',
      '#__w2a_download_panel .dp-mini{height:26px;min-width:26px;padding:0 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.08);color:#fff;font-size:11px;cursor:pointer}',
      '#__w2a_download_panel .dp-mini:hover{background:rgba(255,255,255,0.14)}',
      '@keyframes w2aDownloadPulse{from{filter:saturate(1);opacity:.84}to{filter:saturate(1.2);opacity:1}}',
      '#__w2a_ctx_menu{position:fixed;z-index:2147483647;display:none;min-width:168px;padding:6px;background:rgba(24,24,28,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.34);backdrop-filter:blur(16px);color:#fff;font:13px/1.3 -apple-system,BlinkMacSystemFont,sans-serif}',
      '#__w2a_ctx_menu.show{display:block}',
      '.__w2a_ctx_item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.__w2a_ctx_item:hover{background:rgba(255,255,255,0.1)}',
      '.__w2a_ctx_item:disabled{opacity:0.4;cursor:default}',
      '.__w2a_ctx_divider{height:1px;margin:6px 2px;background:rgba(255,255,255,0.08)}',
      'mark[data-w2a-search="1"]{background:#f7d564;color:#111;padding:0}',
      '#__w2a_lock_trigger{position:fixed;left:calc(50% - 21px);top:calc(50% - 21px);z-index:2147483647;width:42px;height:42px;border-radius:21px;border:1px solid rgba(255,255,255,0.14);background:rgba(16,16,20,0.72);backdrop-filter:blur(14px);color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.24);opacity:0;pointer-events:none;transform:translateY(8px) scale(0.96);transition:opacity .18s ease,transform .18s ease,background .18s ease,border-color .18s ease}',
      '#__w2a_lock_trigger.visible{display:flex}',
      '#__w2a_lock_trigger.awake{opacity:1;pointer-events:auto;transform:translateY(0) scale(1)}',
      '#__w2a_lock_trigger:hover{border-color:rgba(255,255,255,0.28);background:rgba(26,26,30,0.9)}',
      '#__w2a_lock_trigger svg{width:17px;height:17px;display:block;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;flex:none}',
      '#__w2a_lock_overlay{position:fixed;inset:0;z-index:2147483648;display:none;background:transparent;pointer-events:auto}',
      '#__w2a_lock_overlay.show{display:block}',
      '#__w2a_unlock_chip{position:absolute;left:calc(50% - 21px);top:calc(50% - 21px);width:42px;height:42px;margin-top:0;border-radius:21px;border:1px solid rgba(255,255,255,0.18);background:rgba(18,18,24,0.84);backdrop-filter:blur(14px);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(0,0,0,0.28);opacity:0;pointer-events:none;transform:scale(0.94);transition:opacity .18s ease,transform .18s ease}',
      '#__w2a_unlock_chip.show{opacity:1;pointer-events:auto;transform:scale(1)}',
      '#__w2a_unlock_chip svg{width:17px;height:17px;display:block;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;flex:none}',
      'body.__w2a_playback_locked > *:not(#__w2a_lock_overlay){pointer-events:none !important}',
      'body.__w2a_playback_locked #__w2a_lock_overlay,body.__w2a_playback_locked #__w2a_lock_overlay *{pointer-events:auto !important}',
      'body.__w2a_playback_locked .videoOsd,body.__w2a_playback_locked .videoOsdBottom,body.__w2a_playback_locked .videoOsdHeader,body.__w2a_playback_locked .upNextContainer,body.__w2a_playback_locked .osdHeader,body.__w2a_playback_locked .osdFooter,body.__w2a_playback_locked [class*="videoOsd"],body.__w2a_playback_locked [class*="upNext"],body.__w2a_playback_locked [class*="osd"]{opacity:0 !important;visibility:hidden !important}',
      // 锁屏时字幕归底：覆盖 Emby JS inline bottom；去掉 .htmlVideoPlayer 前缀（Emby 类名不固定）
      'body.__w2a_playback_locked .videoOsdTextContainer,body.__w2a_playback_locked .textTrackContainer,body.__w2a_playback_locked .htmlVideoPlayerSubtitleText,body.__w2a_playback_locked [class*=OsdText],body.__w2a_playback_locked [class*=osdText],body.__w2a_playback_locked [class*=textTrack],body.__w2a_playback_locked [class*=TextTrack],body.__w2a_playback_locked [class*=subtitle],body.__w2a_playback_locked [class*=Subtitle],body.__w2a_playback_locked [class*=caption],body.__w2a_playback_locked [class*=Caption],body.__w2a_playback_locked [class*=textContainer],body.__w2a_playback_locked [class*=TextContainer]{padding-bottom:0!important;bottom:0!important;margin-bottom:0!important;transform:translateY(0)!important}',
      // 影视入口：深色毛玻璃（禁用纯白底，避免被识别为右上角无用 ⚪️）
      '#__w2a_cinema_trigger{position:fixed !important;right:20px !important;bottom:20px !important;left:auto !important;top:auto !important;z-index:2147483647 !important;width:40px;height:40px;border-radius:20px;border:1px solid rgba(255,255,255,0.18);background:rgba(28,28,32,0.78) !important;backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);color:rgba(255,255,255,0.94);font-size:18px;line-height:1;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.28);opacity:0;pointer-events:none;transform:scale(0.96);transition:opacity .2s ease,transform .2s ease,box-shadow .18s ease,background .18s ease}',
      '#__w2a_cinema_trigger.visible{display:flex !important;opacity:0.92;pointer-events:auto;transform:none}',
      // 播放沉浸淡出优先于 .awake/.visible，避免 !important 把入口「顶」成常亮白圆
      '#__w2a_cinema_trigger.is-immersive-faded{opacity:0 !important;pointer-events:none !important;transform:scale(0.96) !important}',
      '#__w2a_cinema_trigger.awake:not(.is-immersive-faded),#__w2a_cinema_trigger:hover:not(.is-immersive-faded),#__w2a_cinema_trigger.active:not(.is-immersive-faded){opacity:1 !important;pointer-events:auto !important}',
      '#__w2a_cinema_trigger:hover:not(.is-immersive-faded){transform:scale(1.08);box-shadow:0 8px 22px rgba(0,0,0,0.32)}',
      '#__w2a_cinema_trigger.active{background:rgba(36,36,42,0.9) !important;border-color:rgba(10,132,255,0.55);box-shadow:0 0 0 3px rgba(10,132,255,0.14),0 8px 22px rgba(0,0,0,0.3)}',
      '#__w2a_cinema_trigger svg{width:18px;height:18px;display:block;stroke:currentColor;stroke-width:1.9;fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;flex:none}',
      '#__w2a_cinema_trigger .__w2a_trigger_badge{position:absolute;right:-2px;top:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:rgba(10,132,255,0.95);color:#fff;font-size:9px;font-weight:700;line-height:16px;opacity:0}',
      '#__w2a_cinema_trigger.active .__w2a_trigger_badge{opacity:1}',
      '#__w2a_cinema_panel{position:fixed !important;right:16px !important;bottom:70px !important;left:auto !important;top:auto !important;z-index:2147483647 !important;display:none;width:min(300px,calc(100vw - 24px));max-height:min(72vh,620px);overflow:auto;background:rgba(28,28,30,0.92) !important;border:1px solid rgba(255,255,255,0.1) !important;border-radius:16px !important;padding:12px 12px 10px !important;color:#f5f5f7 !important;font:12px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif !important;box-shadow:0 16px 48px rgba(0,0,0,0.42),0 0 0 0.5px rgba(255,255,255,0.06) inset !important;box-sizing:border-box !important;backdrop-filter:blur(28px) saturate(1.4) !important;-webkit-backdrop-filter:blur(28px) saturate(1.4) !important}',
      '#__w2a_cinema_panel.show{display:block !important}',
      '#__w2a_cinema_panel .cp-title{font-size:13px !important;font-weight:600 !important;letter-spacing:-0.01em !important;margin:0 0 10px !important;color:#fff !important;display:block !important}',
      '#__w2a_cinema_panel .cp-sec{margin:0 0 10px !important}',
      '#__w2a_cinema_panel .cp-sec:last-child{margin-bottom:0 !important}',
      '#__w2a_cinema_panel .cp-sec-title{font-size:10px !important;font-weight:600 !important;color:rgba(235,235,245,0.55) !important;text-transform:none !important;letter-spacing:0.02em !important;margin:0 0 6px !important;padding:0 2px !important}',
      '#__w2a_cinema_panel .cp-row{display:grid !important;grid-template-columns:64px 1fr !important;align-items:center !important;gap:8px !important;padding:5px 0 !important;color:#f5f5f7 !important;min-width:0 !important}',
      '#__w2a_cinema_panel .cp-row.cp-stack{grid-template-columns:1fr !important;gap:6px !important}',
      '#__w2a_cinema_panel .cp-label{color:rgba(235,235,245,0.6) !important;white-space:nowrap !important;font-size:11px !important;flex:none !important}',
      '#__w2a_cinema_panel .cp-btns{display:flex !important;gap:4px !important;flex-wrap:nowrap !important;justify-content:flex-end !important;min-width:0 !important;overflow:hidden !important}',
      '#__w2a_cinema_panel .cp-btns.cp-grid{display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr)) !important;gap:4px !important;width:100% !important;justify-content:stretch !important;overflow:visible !important}',
      '#__w2a_cinema_panel .cp-btns.cp-grid-4{grid-template-columns:repeat(4,minmax(0,1fr)) !important}',
      '#__w2a_cinema_panel .cp-btns.cp-grid-5{grid-template-columns:repeat(5,minmax(0,1fr)) !important}',
      '#__w2a_cinema_panel button{background:rgba(120,120,128,0.22) !important;border:0 !important;color:rgba(255,255,255,0.92) !important;border-radius:8px !important;padding:5px 0 !important;cursor:pointer !important;font-size:11px !important;line-height:1.2 !important;min-width:0 !important;flex:1 1 0 !important;text-align:center !important;transition:background .12s ease,color .12s ease}',
      '#__w2a_cinema_panel button:hover{background:rgba(120,120,128,0.34) !important}',
      '#__w2a_cinema_panel button.active{background:rgba(10,132,255,0.95) !important;color:#fff !important;font-weight:600 !important}',
      '#__w2a_cinema_panel .cp-slider-row{display:flex !important;align-items:center !important;gap:8px !important;min-width:0 !important}',
      '#__w2a_cinema_panel input[type="range"]{flex:1 1 auto !important;width:auto !important;min-width:0 !important;accent-color:#0a84ff !important;height:18px !important}',
      '#__w2a_cinema_panel select{width:100% !important;max-width:none !important;background:rgba(120,120,128,0.22) !important;color:#fff !important;border:0 !important;border-radius:8px !important;padding:6px 8px !important;font-size:11px !important}',
      '#__w2a_cinema_panel .cp-divider{height:1px !important;background:rgba(84,84,88,0.45) !important;margin:4px 0 10px !important;border:0 !important}',
      '#__w2a_cinema_panel .cp-status{font-size:10px !important;color:rgba(10,132,255,0.95) !important;padding:2px 2px 0 !important;display:block !important}',
      '#__w2a_cinema_panel .cp-note{font-size:10px !important;color:rgba(235,235,245,0.5) !important;flex:none !important;min-width:36px !important;text-align:right !important}'
    ].join('\n');
    })();

    // 统一 15px 描边图标，避免 emoji/特殊字符视觉大小不一
    const BTN_BASE_STYLE = 'width:28px;height:28px;min-width:28px;min-height:28px;border-radius:8px;border:0;background:transparent;color:rgba(255,255,255,0.92);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;line-height:1;box-shadow:none;position:relative;-webkit-app-region:no-drag !important;app-region:no-drag;padding:0;margin:0;flex:none;opacity:1;transform:none;user-select:none;-webkit-user-select:none;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;';
    const ICON_SVG_STYLE = 'width:15px;height:15px;display:block;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none;';
    const TOOLBAR_ICONS = {
      back: '<path d="M14.5 6.5L9 12l5.5 5.5"></path>',
      forward: '<path d="M9.5 6.5L15 12l-5.5 5.5"></path>',
      refresh: '<path d="M19 12a7 7 0 1 1-2-4.9"></path><path d="M19 5v5h-5"></path>',
      search: '<circle cx="11" cy="11" r="5.5"></circle><path d="M15.5 15.5L20 20"></path>',
      remember: '<path d="M12 7v5l3 2"></path><circle cx="12" cy="12" r="8"></circle>',
      pin: '<path d="M12 17v4"></path><path d="M9 3h6l-1 7h3l-5 6-5-6h3L9 3z"></path>',
      download: '<path d="M12 4v10"></path><path d="M8 10l4 4 4-4"></path><path d="M5 19h14"></path>',
      minimize: '<path d="M6 12h12"></path>',
      maximize: '<rect x="6" y="6" width="12" height="12" rx="1.5"></rect>',
      close: '<path d="M7 7l10 10"></path><path d="M17 7L7 17"></path>'
    };

    function iconButton(iconKey, title) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = '__w2a_btn';
      btn.style.cssText = BTN_BASE_STYLE;
      const paths = TOOLBAR_ICONS[iconKey];
      if (paths) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' + paths + '</svg>';
        const svg = btn.querySelector('svg');
        if (svg) svg.style.cssText = ICON_SVG_STYLE;
      } else {
        btn.textContent = String(iconKey || '');
      }
      btn.title = title;
      btn.dataset.tip = title;
      btn.setAttribute('aria-label', title);
      try { btn.style.setProperty('-webkit-app-region', 'no-drag', 'important'); } catch (e) {}
      return btn;
    }

    function bindBtnAction(btn, action) {
      if (!btn || typeof action !== 'function') return;
      let lastRun = 0;
      const run = function(ev) {
        const now = Date.now();
        // 防抖：pointerup + click 可能连发，300ms 内只执行一次
        if (now - lastRun < 300) {
          try { if (ev) { ev.preventDefault(); ev.stopPropagation(); } } catch (e0) {}
          return;
        }
        lastRun = now;
        try {
          if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          }
        } catch (e) {}
        try { action(ev); } catch (err) {
          console.warn('[W2A] toolbar action failed:', err && err.message ? err.message : err);
        }
      };
      // 用 pointerup 保证在 WKWebView 上可点；click 作兼容
      btn.addEventListener('pointerup', function(ev) {
        if (ev && ev.button != null && ev.button !== 0) return;
        run(ev);
      }, true);
      btn.addEventListener('click', run, true);
    }

    if (enableTitleBar || showToolbar) {
      // 结构拆分：
      // 1) 顶部中间细拖拽条（仅拖窗口，不含按钮）
      // 2) 右上角悬停工具栏（默认收起，hover 展开；按钮绝不在 drag region 内）
      const chrome = document.createElement('div');
      chrome.id = '__w2a_drag';
      chrome.className = (isMacDesktop ? '__w2a_drag_root mac-hover' : '__w2a_drag_root toolbar-right');
      chrome.style.cssText = 'position:fixed;top:0;left:0;right:0;height:0;z-index:2147483646;pointer-events:none;background:transparent;border:0;';

      const dragStrip = document.createElement('div');
      dragStrip.id = '__w2a_drag_strip';
      dragStrip.setAttribute('data-tauri-drag-region', '');
      dragStrip.style.cssText = 'position:fixed;top:0;left:72px;right:56px;height:14px;z-index:2147483645;pointer-events:auto;-webkit-app-region:drag;background:transparent;';

      const toolbar = document.createElement('div');
      toolbar.id = '__w2a_toolbar';
      toolbar.className = '__w2a_drag_buttons right';
      // 收起：显示毛玻璃呼出按钮；展开：完整工具条。播放时仍保留呼出按钮。
      toolbar.style.cssText = [
        'position:fixed',
        'top:8px',
        'right:10px',
        'left:auto',
        'z-index:2147483647',
        'display:flex',
        'gap:2px',
        'align-items:center',
        'justify-content:flex-end',
        'pointer-events:auto',
        '-webkit-app-region:no-drag',
        'app-region:no-drag',
        'padding:3px',
        'border-radius:12px',
        'background:transparent',
        'backdrop-filter:none',
        '-webkit-backdrop-filter:none',
        'border:0.5px solid transparent',
        'box-shadow:none',
        'max-width:40px',
        'min-width:40px',
        'min-height:40px',
        'overflow:hidden',
        'transition:max-width .22s cubic-bezier(.2,.8,.2,1), background .18s ease, box-shadow .18s ease, padding .18s ease, border-color .18s ease'
      ].join(';');

      // 呼出按钮：苹果风毛玻璃胶囊 + 三点
      const peekBtn = document.createElement('button');
      peekBtn.type = 'button';
      peekBtn.id = '__w2a_toolbar_peek';
      peekBtn.title = '工具栏';
      peekBtn.setAttribute('aria-label', '打开工具栏');
      peekBtn.style.cssText = 'width:30px;height:30px;min-width:30px;min-height:30px;border:0.5px solid rgba(255,255,255,0.2);border-radius:10px;background:rgba(28,28,32,0.72);backdrop-filter:blur(28px) saturate(1.7);-webkit-backdrop-filter:blur(28px) saturate(1.7);box-shadow:0 6px 18px rgba(0,0,0,0.22), inset 0 0.5px 0 rgba(255,255,255,0.18);color:rgba(255,255,255,0.94);display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0;cursor:pointer;flex:none;-webkit-app-region:no-drag;';
      try {
        peekBtn.style.setProperty('background', 'rgba(28,28,32,0.72)', 'important');
        peekBtn.style.setProperty('color', 'rgba(255,255,255,0.94)', 'important');
      } catch (ePeekInit) {}
      peekBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="6" cy="12" r="1.55" fill="currentColor"></circle><circle cx="12" cy="12" r="1.55" fill="currentColor"></circle><circle cx="18" cy="12" r="1.55" fill="currentColor"></circle></svg>';

      const actions = document.createElement('div');
      actions.id = '__w2a_toolbar_actions';
      actions.style.cssText = 'display:none;gap:1px;align-items:center;';

      // 播放沉浸时顶边热区：移入可重新呼出工具栏
      const toolbarHotedge = document.createElement('div');
      toolbarHotedge.id = '__w2a_toolbar_hotedge';
      toolbarHotedge.className = 'active';
      toolbarHotedge.style.cssText = 'position:fixed;top:0;right:0;width:100px;height:28px;z-index:2147483645;pointer-events:auto;background:transparent;';

      let toolbarImmersive = false;
      function setToolbarExpanded(expanded) {
        if (expanded) {
          // 展开：完整工具栏；即使播放中也强制可见（热区/点击呼出）
          toolbar.classList.remove('is-immersive-hidden');
          toolbar.classList.add('is-expanded');
          toolbar.style.display = 'flex';
          toolbar.style.opacity = '1';
          toolbar.style.visibility = 'visible';
          toolbar.style.pointerEvents = 'auto';
          toolbar.style.maxWidth = '320px';
          toolbar.style.minWidth = '0';
          toolbar.style.background = 'rgba(36,36,40,0.52)';
          toolbar.style.backdropFilter = 'blur(40px) saturate(1.8)';
          toolbar.style.webkitBackdropFilter = 'blur(40px) saturate(1.8)';
          toolbar.style.border = '0.5px solid rgba(255,255,255,0.18)';
          toolbar.style.boxShadow = '0 10px 32px rgba(0,0,0,0.28), inset 0 0.5px 0 rgba(255,255,255,0.16)';
          toolbar.style.padding = '3px 4px';
          peekBtn.style.display = 'none';
          peekBtn.style.visibility = 'hidden';
          peekBtn.style.opacity = '0';
          actions.style.display = 'flex';
        } else {
          const keep = (document.getElementById('__w2a_search_bar') && document.getElementById('__w2a_search_bar').classList.contains('show'))
            || (document.getElementById('__w2a_download_panel') && document.getElementById('__w2a_download_panel').classList.contains('show'));
          if (keep) {
            toolbar.classList.remove('is-immersive-hidden');
            toolbar.classList.add('is-expanded');
            toolbar.style.display = 'flex';
            toolbar.style.opacity = '1';
            toolbar.style.visibility = 'visible';
            toolbar.style.pointerEvents = 'auto';
            toolbar.style.maxWidth = '320px';
            actions.style.display = 'flex';
            peekBtn.style.display = 'none';
            return;
          }
          toolbar.classList.remove('is-expanded');
          toolbar.style.maxWidth = '40px';
          toolbar.style.minWidth = '40px';
          toolbar.style.background = 'transparent';
          toolbar.style.backdropFilter = 'none';
          toolbar.style.webkitBackdropFilter = 'none';
          toolbar.style.border = '0.5px solid transparent';
          toolbar.style.boxShadow = 'none';
          toolbar.style.padding = '3px';
          toolbar.style.display = 'flex';
          actions.style.display = 'none';
          peekBtn.style.display = 'inline-flex';
          // 深色实底，避免站点 CSS 或半透明合成在视频上变成纯白圆
          try {
            peekBtn.style.setProperty('background', 'rgba(28,28,32,0.72)', 'important');
            peekBtn.style.setProperty('color', 'rgba(255,255,255,0.94)', 'important');
            peekBtn.style.setProperty('border-color', 'rgba(255,255,255,0.2)', 'important');
          } catch (ePeek) {}
          if (toolbarImmersive) {
            // 播放沉浸：visibility+opacity 双保险（单靠 opacity 会残留纯白圆）
            toolbar.classList.add('is-immersive-hidden');
            toolbar.style.opacity = '0';
            toolbar.style.visibility = 'hidden';
            toolbar.style.pointerEvents = 'none';
            peekBtn.style.opacity = '0';
            peekBtn.style.visibility = 'hidden';
          } else {
            toolbar.classList.remove('is-immersive-hidden');
            toolbar.style.opacity = '0';
            toolbar.style.pointerEvents = 'none';
            toolbar.style.visibility = 'hidden';
            peekBtn.style.opacity = '0';
            peekBtn.style.visibility = 'hidden';
          }
        }
      }

      let hideTimer = null;
      const scheduleHide = function() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(function() { setToolbarExpanded(false); }, 420);
      };
      const cancelHide = function() {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      };
      toolbar.addEventListener('mouseenter', function() {
        cancelHide();
        setToolbarExpanded(true);
      });
      toolbar.addEventListener('mouseleave', scheduleHide);
      toolbar.addEventListener('focusin', function() {
        cancelHide();
        setToolbarExpanded(true);
      });
      toolbar.addEventListener('focusout', function() {
        window.setTimeout(function() {
          if (!toolbar.contains(document.activeElement)) scheduleHide();
        }, 0);
      });
      peekBtn.addEventListener('click', function(ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        cancelHide();
        setToolbarExpanded(true);
      });
      // 顶部右缘热区：播放沉浸时也可呼出完整工具栏
      toolbarHotedge.addEventListener('mouseenter', function() {
        cancelHide();
        setToolbarExpanded(true);
      });

      chrome.appendChild(dragStrip);
      chrome.appendChild(toolbarHotedge);
      chrome.appendChild(toolbar);
      toolbar.appendChild(peekBtn);
      toolbar.appendChild(actions);
      mountUi(chrome);

      // 播放沉浸：收起态真隐藏；热区仍可呼出完整工具栏；不卸 DOM
      window.__W2A_SET_TOOLBAR_IMMERSIVE__ = function(immersive) {
        toolbarImmersive = !!immersive;
        toolbarHotedge.classList.add('active');
        toolbarHotedge.style.pointerEvents = 'auto';
        // 无论进入/退出沉浸，先回到收起态再按 immersive 应用显隐
        setToolbarExpanded(false);
      };

      const back = iconButton('back', '后退');
      bindBtnAction(back, function() { window.history.back(); });
      const forward = iconButton('forward', '前进');
      bindBtnAction(forward, function() { window.history.forward(); });
      const refresh = iconButton('refresh', '刷新页面');
      refresh.id = '__w2a_refresh_btn';
      bindBtnAction(refresh, function() { window.location.reload(); });
      const searchToggle = iconButton('search', '页面搜索');
      searchToggle.id = '__w2a_search_toggle';
      const rememberToggle = iconButton('remember', '开启退出记忆页面');
      rememberToggle.id = '__w2a_remember_toggle';
      function syncRememberToggle(enabled) {
        const active = !!enabled;
        rememberToggle.classList.toggle('active', active);
        rememberToggle.style.background = active ? 'rgba(10,132,255,0.28)' : 'transparent';
        rememberToggle.style.color = active ? '#6cb6ff' : 'rgba(255,255,255,0.92)';
        rememberToggle.title = active ? '关闭退出记忆页面' : '开启退出记忆页面';
        rememberToggle.dataset.tip = rememberToggle.title;
        rememberToggle.setAttribute('aria-label', rememberToggle.title);
      }
      syncRememberToggle(isRememberPageEnabled());
      bindBtnAction(rememberToggle, function() {
        const next = !isRememberPageEnabled();
        setRememberPageEnabled(next);
        syncRememberToggle(next);
        if (next) rememberCurrentUrl(true);
      });
      let pinState = !!defaultAlwaysOnTop;
      const pin = iconButton('pin', '窗口置顶');
      if (pinState) pin.classList.add('active');
      pin.title = pinState ? '取消置顶' : '窗口置顶';
      pin.dataset.tip = pin.title;
      pin.setAttribute('aria-label', pin.title);
      const downloadToggle = enableDownloadManager ? iconButton('download', '下载管理') : null;
      if (downloadToggle) downloadToggle.id = '__w2a_download_toggle';

      function syncPinState(isTop) {
        pinState = !!isTop;
        pin.classList.toggle('active', !!isTop);
        pin.style.background = isTop ? 'rgba(10,132,255,0.28)' : 'transparent';
        pin.style.color = isTop ? '#6cb6ff' : 'rgba(255,255,255,0.92)';
        pin.title = isTop ? '取消置顶' : '窗口置顶';
        pin.dataset.tip = pin.title;
        pin.setAttribute('aria-label', pin.title);
      }

      function refreshPinState() {
        return getWindowAlwaysOnTop().then(function(v) {
          if (typeof v === 'boolean') syncPinState(v);
          return v;
        }).catch(function() { return null; });
      }

      bindBtnAction(pin, function() {
        const next = !pinState;
        syncPinState(next);
        setWindowAlwaysOnTop(next).then(function() {
          window.setTimeout(refreshPinState, 120);
          window.setTimeout(refreshPinState, 420);
        }).catch(function(err) {
          console.warn('[W2A] 置顶失败:', err && err.message ? err.message : err);
          syncPinState(!next);
        });
      });

      if (defaultAlwaysOnTop) {
        setWindowAlwaysOnTop(true).catch(function() {});
      }
      refreshPinState();
      window.setTimeout(refreshPinState, 400);
      window.setTimeout(refreshPinState, 1400);

      actions.appendChild(back);
      actions.appendChild(forward);
      actions.appendChild(refresh);
      actions.appendChild(searchToggle);
      actions.appendChild(rememberToggle);
      actions.appendChild(pin);
      if (downloadToggle) actions.appendChild(downloadToggle);

      if (!isMacDesktop) {
        const minBtn = iconButton('minimize', '最小化');
        const maxBtn = iconButton('maximize', '最大化');
        const closeBtn = iconButton('close', '关闭');
        bindBtnAction(minBtn, function() {
          withTauriWindow(function(win) {
            return win && typeof win.minimize === 'function' ? win.minimize() : null;
          });
        });
        bindBtnAction(maxBtn, function() {
          withTauriWindow(function(win) {
            return win && typeof win.toggleMaximize === 'function' ? win.toggleMaximize() : null;
          });
        });
        bindBtnAction(closeBtn, function() {
          withTauriWindow(function(win) {
            return win && typeof win.close === 'function' ? win.close() : null;
          });
        });
        actions.appendChild(minBtn);
        actions.appendChild(maxBtn);
        actions.appendChild(closeBtn);
      }

      // 仅拖拽条负责拖窗口；双击最大化
      dragStrip.addEventListener('dblclick', function(ev) {
        ev.preventDefault();
        withTauriWindow(function(win) {
          return win && typeof win.toggleMaximize === 'function' ? win.toggleMaximize() : null;
        });
      });
      // 暴露给搜索/下载：打开时保持工具栏展开
      window.__W2A_EXPAND_TOOLBAR__ = function() {
        cancelHide();
        setToolbarExpanded(true);
      };

      // 仅清理 boot/traffic 残留白点；不拆正常工具栏（避免越改越差）
      (function purgeLegacyWhiteDots() {
        function killBoot() {
          document.querySelectorAll('#__w2a_boot_drag, #__w2a_traffic_dots, #__w2a_traffic_hotedge, .__w2a_boot_btn').forEach(function(el) {
            try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {}
          });
        }
        killBoot();
        setTimeout(killBoot, 800);
        setTimeout(killBoot, 2500);
        try {
          const mo = new MutationObserver(function(muts) {
            for (let i = 0; i < muts.length; i++) {
              const nodes = muts[i].addedNodes || [];
              for (let j = 0; j < nodes.length; j++) {
                const n = nodes[j];
                if (!n || n.nodeType !== 1) continue;
                const id = n.id || '';
                if (id === '__w2a_boot_drag' || id === '__w2a_traffic_dots' || id === '__w2a_traffic_hotedge'
                    || (n.classList && n.classList.contains('__w2a_boot_btn'))) {
                  try { if (n.parentNode) n.parentNode.removeChild(n); } catch (e) {}
                }
              }
            }
          });
          mo.observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) {}
      })();

      // 播放时仅淡出收起态工具栏（不卸 DOM、不破坏控制栏）
      (function installVideoToolbarFade() {
        function anyVideoPlaying() {
          try {
            const list = document.querySelectorAll('video');
            for (let i = 0; i < list.length; i++) {
              const v = list[i];
              if (v && !v.paused && !v.ended) return true;
            }
          } catch (e) {}
          return false;
        }
        let last = null;
        function tick() {
          const playing = anyVideoPlaying();
          if (playing === last) return;
          last = playing;
          try {
            document.documentElement.classList.toggle('__w2a_video_immersive', playing);
            if (document.body) document.body.classList.toggle('__w2a_video_immersive', playing);
          } catch (e) {}
          if (typeof window.__W2A_SET_TOOLBAR_IMMERSIVE__ === 'function') {
            window.__W2A_SET_TOOLBAR_IMMERSIVE__(playing);
          }
        }
        ['play', 'playing', 'pause', 'ended'].forEach(function(ev) {
          document.addEventListener(ev, function() { last = null; tick(); }, true);
        });
        setInterval(tick, 1000);
        tick();
      })();
    }

    const searchBar = document.createElement('div');
    searchBar.id = '__w2a_search_bar';
    searchBar.innerHTML = '<input id="__w2a_search_input" placeholder="搜索当前页面"><span id="__w2a_search_count"></span><button type="button" class="__w2a_btn" id="__w2a_search_prev"><</button><button type="button" class="__w2a_btn" id="__w2a_search_next">></button><button type="button" class="__w2a_btn" id="__w2a_search_close">x</button>';
    mountUi(searchBar);
    const contextMenu = document.createElement('div');
    contextMenu.id = '__w2a_ctx_menu';
    mountUi(contextMenu);
    const downloadPanel = document.createElement('div');
    downloadPanel.id = '__w2a_download_panel';
    downloadPanel.style.cssText = 'position:fixed;top:86px;right:12px;left:auto;bottom:auto;z-index:2147483647;display:none;';
    // × 关闭面板；清空已完成单独按钮（原先 × 误绑成清空全部，导致关不掉）
    downloadPanel.innerHTML = '<div class="dp-head"><div class="dp-title">下载管理</div><div class="dp-actions"><button type="button" class="dp-mini" id="__w2a_download_clear_done">清空已完成</button><button type="button" class="dp-close" id="__w2a_download_close" aria-label="关闭" title="关闭">×</button></div></div><div class="dp-list" id="__w2a_download_list"></div><div class="dp-empty" id="__w2a_download_empty">暂无下载记录</div>';
    mountUi(downloadPanel);

    let searchMarks = [];
    let activeSearchIndex = -1;
    let contextMenuOpen = false;
    let contextMenuTarget = null;
    let downloadItems = [];
    const searchInput = document.getElementById('__w2a_search_input');
    const searchCount = document.getElementById('__w2a_search_count');
    const downloadList = document.getElementById('__w2a_download_list');
    const downloadEmpty = document.getElementById('__w2a_download_empty');
    const downloadClearDoneBtn = document.getElementById('__w2a_download_clear_done');
    const contextTexts = {
      back: '后退',
      forward: '前进',
      reload: '刷新',
      searchPage: '页面搜索',
      copyPageUrl: '复制页面地址',
      copySelection: '复制所选内容',
      searchSelection: '查找所选内容',
      cut: '剪切',
      copy: '复制',
      paste: '粘贴',
      selectAll: '全选'
    };

    function classifyDownloadError(error) {
      const raw = String((error && error.message) || error || '').toLowerCase();
      if (!raw) return '未知错误';
      if (raw.indexOf('401') >= 0 || raw.indexOf('403') >= 0 || raw.indexOf('unauthorized') >= 0 || raw.indexOf('forbidden') >= 0) return '登录态失效';
      if (raw.indexOf('404') >= 0) return '资源不存在';
      if (raw.indexOf('429') >= 0) return '请求过于频繁';
      if (raw.indexOf('500') >= 0 || raw.indexOf('502') >= 0 || raw.indexOf('503') >= 0 || raw.indexOf('504') >= 0) return '服务器异常';
      if (raw.indexOf('network') >= 0 || raw.indexOf('failed to fetch') >= 0 || raw.indexOf('timed out') >= 0 || raw.indexOf('timeout') >= 0) return '网络失败';
      if (raw.indexOf('permission') >= 0 || raw.indexOf('not allowed') >= 0 || raw.indexOf('denied') >= 0) return '权限受限';
      if (raw.indexOf('download dir') >= 0 || raw.indexOf('create file') >= 0 || raw.indexOf('write') >= 0 || raw.indexOf('path') >= 0) return '保存失败';
      return '下载失败';
    }

    function toggleDownloadPanel(force) {
      if (!enableDownloadManager) return;
      const next = typeof force === 'boolean' ? force : !downloadPanel.classList.contains('show');
      downloadPanel.classList.toggle('show', next);
      downloadPanel.style.position = 'fixed';
      downloadPanel.style.top = '52px';
      downloadPanel.style.right = '12px';
      downloadPanel.style.left = 'auto';
      downloadPanel.style.bottom = 'auto';
      downloadPanel.style.zIndex = '2147483647';
      downloadPanel.style.display = next ? 'block' : 'none';
      downloadPanel.style.background = 'rgba(28,28,30,0.88)';
      downloadPanel.style.backdropFilter = 'blur(28px) saturate(1.5)';
      downloadPanel.style.webkitBackdropFilter = 'blur(28px) saturate(1.5)';
      downloadPanel.style.border = '1px solid rgba(255,255,255,0.12)';
      downloadPanel.style.borderRadius = '14px';
      downloadPanel.style.boxShadow = '0 16px 40px rgba(0,0,0,0.35)';
      downloadPanel.style.padding = '10px';
      downloadPanel.style.color = '#f5f5f7';
      downloadPanel.style.width = 'min(360px, calc(100vw - 24px))';
      if (next) {
        hideContextMenu();
        if (typeof window.__W2A_EXPAND_TOOLBAR__ === 'function') window.__W2A_EXPAND_TOOLBAR__();
      }
    }

    function renderDownloadItems() {
      if (!enableDownloadManager) return;
      downloadList.innerHTML = '';
      downloadEmpty.style.display = downloadItems.length ? 'none' : 'block';
      downloadItems.forEach(function(item) {
        const row = document.createElement('div');
        row.className = 'dp-item';
        const statusText = String(item.statusText || '');
        const stateClass = item.canRetry
          ? 'is-error'
          : ((typeof item.progress === 'number' && item.progress >= 0 && item.progress < 100 && !item.savedPath)
            ? 'is-progress'
            : (item.savedPath ? 'is-success' : ''));
        if (stateClass) row.classList.add(stateClass);

        const header = document.createElement('div');
        header.className = 'dp-row';
        const name = document.createElement('div');
        name.className = 'dp-name';
        name.textContent = String(item.filename || '未命名文件');
        header.appendChild(name);
        if (statusText) {
          const tag = document.createElement('div');
          tag.className = 'dp-status-tag';
          tag.textContent = item.errorTag || (item.savedPath ? '已完成' : ((typeof item.progress === 'number' && item.progress < 100) ? '下载中' : '状态'));
          header.appendChild(tag);
        }
        row.appendChild(header);

        const status = document.createElement('div');
        status.className = 'dp-status';
        status.textContent = statusText;
        row.appendChild(status);

        if (typeof item.progress === 'number') {
          const progressWrap = document.createElement('div');
          progressWrap.className = 'dp-progress';
          const progressBar = document.createElement('span');
          progressBar.style.width = Math.max(0, Math.min(100, item.progress)) + '%';
          progressWrap.appendChild(progressBar);
          row.appendChild(progressWrap);
        }

        if (item.savedPath) {
          const pathLine = document.createElement('div');
          pathLine.className = 'dp-path';
          pathLine.textContent = String(item.savedPath);
          row.appendChild(pathLine);
        }

        const actions = document.createElement('div');
        actions.className = 'dp-actions-row';

        if (item.canRetry) {
          const retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'dp-mini';
          retryBtn.textContent = '重试';
          retryBtn.addEventListener('click', function() {
            retryDownloadItem(item.id);
          });
          actions.appendChild(retryBtn);
        }

        if (item.savedPath) {
          const openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.className = 'dp-mini';
          openBtn.textContent = '打开';
          openBtn.addEventListener('click', function() {
            openDownloadedFile(item.savedPath);
          });
          actions.appendChild(openBtn);

          const revealBtn = document.createElement('button');
          revealBtn.type = 'button';
          revealBtn.className = 'dp-mini';
          revealBtn.textContent = '定位';
          revealBtn.addEventListener('click', function() {
            revealDownloadedFile(item.savedPath);
          });
          actions.appendChild(revealBtn);

          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'dp-mini';
          copyBtn.textContent = '复制路径';
          copyBtn.addEventListener('click', function() {
            copyText(item.savedPath);
          });
          actions.appendChild(copyBtn);
        }

        const sourceUrl = item && item.retryPayload ? String(item.retryPayload.url || '') : '';
        if (/^https?:/i.test(sourceUrl) || /^blob:/i.test(sourceUrl)) {
          const copyLinkBtn = document.createElement('button');
          copyLinkBtn.type = 'button';
          copyLinkBtn.className = 'dp-mini';
          copyLinkBtn.textContent = '复制链接';
          copyLinkBtn.addEventListener('click', function() {
            copyText(sourceUrl);
          });
          actions.appendChild(copyLinkBtn);
        }

        if (actions.childNodes.length) row.appendChild(actions);
        downloadList.appendChild(row);
      });
    }

    function upsertDownloadItem(item) {
      if (!enableDownloadManager) return;
      const next = Object.assign({}, item || {});
      const idx = downloadItems.findIndex(function(entry) { return entry.id === next.id; });
      if (idx >= 0) downloadItems[idx] = Object.assign({}, downloadItems[idx], next);
      else downloadItems.unshift(next);
      if (downloadItems.length > 12) downloadItems = downloadItems.slice(0, 12);
      renderDownloadItems();
    }

    function getDownloadItem(id) {
      return downloadItems.find(function(entry) { return entry.id === id; }) || null;
    }

    function clearCompletedDownloads() {
      downloadItems = downloadItems.filter(function(entry) {
        return !entry || (!entry.savedPath && entry.canRetry) || (String(entry.statusText || '').indexOf('正在下载') === 0);
      });
      renderDownloadItems();
    }

    function openDownloadedFile(pathValue) {
      const invoke = getTauriInvoke();
      if (!invoke || !pathValue) return;
      invoke('plugin:opener|open_path', { path: String(pathValue) }).catch(function() {
        invoke('plugin:shell|open', { path: String(pathValue) }).catch(function() {});
      });
    }

    function revealDownloadedFile(pathValue) {
      const invoke = getTauriInvoke();
      if (!invoke || !pathValue) return;
      const revealDir = (function(p) {
        p = String(p || '');
        const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
        return i > 0 ? p.slice(0, i) : p;
      })(pathValue);
      invoke('plugin:opener|reveal_item_in_dir', { path: String(pathValue) }).catch(function() {
        invoke('plugin:shell|open', { path: revealDir }).catch(function() {});
      });
    }

    function extractFilenameFromHeaders(headers, fallbackName) {
      try {
        const value = headers && typeof headers.get === 'function' ? headers.get('content-disposition') : '';
        if (!value) return fallbackName;
        const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) return decodeURIComponent(utf8Match[1]).replace(/[\\\\/:*?"<>|]+/g, '_');
        const plainMatch = value.match(/filename="?([^";]+)"?/i);
        if (plainMatch && plainMatch[1]) return plainMatch[1].replace(/[\\\\/:*?"<>|]+/g, '_');
      } catch (e) {}
      return fallbackName;
    }

    function inferDownloadFilename(rawUrl, fallbackName) {
      try {
        const url = new URL(rawUrl, window.location.href);
        const seg = decodeURIComponent(String(url.pathname || '').split('/').pop() || '').trim();
        return (seg || fallbackName || 'download').replace(/[\\\\/:*?"<>|]+/g, '_');
      } catch (e) {
        return String(fallbackName || 'download').replace(/[\\\\/:*?"<>|]+/g, '_');
      }
    }

    let rawTauriInvoke = null;

    async function runDownloadTask(task) {
      const invoke = rawTauriInvoke || getTauriInvoke();
      if (!invoke) throw new Error('Tauri invoke 不可用');
      const itemId = task.id;
      const initialName = String(task.filename || inferDownloadFilename(task.url || '', 'download'));
      upsertDownloadItem({
        id: itemId,
        filename: initialName,
        statusText: '正在下载...',
        savedPath: '',
        progress: 0,
        canRetry: false,
        retryPayload: Object.assign({}, task)
      });
      toggleDownloadPanel(true);

      try {
        let savedPath = '';
        if (task.kind === 'data' || task.kind === 'blob' || task.kind === 'binary') {
          const sourceUrl = String(task.url || '');
          let binary = Array.isArray(task.binary) ? task.binary : null;
          if (!binary && task.kind === 'data') {
            const byteString = atob(sourceUrl.split(',')[1] || '');
            const buffer = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) buffer[i] = byteString.charCodeAt(i);
            binary = Array.from(buffer);
          }
          if (!binary && task.kind === 'blob') {
            const res = await fetch(sourceUrl);
            const buf = new Uint8Array(await res.arrayBuffer());
            binary = Array.from(buf);
          }
          savedPath = await invoke('download_file_by_binary', {
            params: { filename: initialName, binary: binary || [], language: task.language }
          });
        } else {
          let fetched = false;
          try {
            const targetUrl = String(task.url || '');
            const resolved = new URL(targetUrl, window.location.href);
            if (resolved.origin === window.location.origin && typeof fetch === 'function') {
              const res = await fetch(resolved.toString(), {
                credentials: 'include',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
              });
              if (!res.ok) throw new Error('HTTP ' + res.status);
              const fetchedName = extractFilenameFromHeaders(res.headers, initialName) || initialName;
              upsertDownloadItem({ id: itemId, filename: fetchedName, retryPayload: Object.assign({}, task, { filename: fetchedName }) });
              const total = parseInt(String(res.headers.get('content-length') || '0'), 10) || 0;
              if (res.body && typeof res.body.getReader === 'function') {
                const reader = res.body.getReader();
                const chunks = [];
                let received = 0;
                while (true) {
                  const next = await reader.read();
                  if (next.done) break;
                  const chunk = next.value || new Uint8Array();
                  chunks.push(chunk);
                  received += chunk.length || 0;
                  if (total > 0) {
                    upsertDownloadItem({ id: itemId, progress: Math.round((received / total) * 100), statusText: '正在下载... ' + Math.round((received / total) * 100) + '%' });
                  }
                }
                const merged = new Uint8Array(received);
                let offset = 0;
                chunks.forEach(function(chunk) {
                  merged.set(chunk, offset);
                  offset += chunk.length || 0;
                });
                savedPath = await invoke('download_file_by_binary', {
                  params: { filename: fetchedName, binary: Array.from(merged), language: task.language }
                });
                fetched = true;
              }
            }
          } catch (fetchErr) {}
          if (!fetched) {
            savedPath = await invoke('download_file', {
              params: { url: String(task.url || ''), filename: initialName, language: task.language }
            });
          }
        }
        upsertDownloadItem({
          id: itemId,
          statusText: '下载完成',
          savedPath: String(savedPath || ''),
          progress: 100,
          canRetry: false
        });
        return savedPath;
      } catch (error) {
        const shortReason = classifyDownloadError(error);
        upsertDownloadItem({
          id: itemId,
          statusText: shortReason + '：' + String((error && error.message) || error || '未知错误'),
          canRetry: true,
          progress: null,
          errorTag: shortReason
        });
        throw error;
      }
    }

    function retryDownloadItem(id) {
      const item = getDownloadItem(id);
      if (!item || !item.retryPayload) return;
      const retryTask = Object.assign({}, item.retryPayload, { id: String(Date.now()) + '_' + Math.random().toString(16).slice(2) });
      runDownloadTask(retryTask).catch(function() {});
    }

    function patchDownloadInvoke() {
      if (!enableDownloadManager || window.__W2A_DOWNLOAD_PATCHED__) return;
      const tauri = window.__TAURI__ || {};
      const originalInvoke = tauri.core && typeof tauri.core.invoke === 'function'
        ? tauri.core.invoke.bind(tauri.core)
        : (typeof tauri.invoke === 'function' ? tauri.invoke.bind(tauri) : null);
      if (!originalInvoke) {
        // Tauri 可能尚未注入，延迟重试（配合 __W2A_DOWNLOAD_PATCHED__ 守卫避免重复）
        setTimeout(patchDownloadInvoke, 500);
        return;
      }
      rawTauriInvoke = originalInvoke;
      window.__W2A_TAURI_RAW_INVOKE__ = originalInvoke;

      async function proxiedInvoke(command, args) {
        if (command !== 'download_file' && command !== 'download_file_by_binary') {
          return originalInvoke(command, args);
        }
        const params = args && args.params ? args.params : {};
        return runDownloadTask({
          id: String(Date.now()) + '_' + Math.random().toString(16).slice(2),
          kind: command === 'download_file_by_binary' ? 'binary' : 'remote',
          url: params.url || '',
          filename: params.filename || inferDownloadFilename(params.url || '', 'download'),
          binary: params.binary || null,
          language: params.language || ''
        });
      }

      function tryInstallInvokeProxy(target) {
        if (!target || typeof target.invoke !== 'function') return false;
        try {
          target.invoke = proxiedInvoke;
          return target.invoke === proxiedInvoke;
        } catch (e) {}
        try {
          Object.defineProperty(target, 'invoke', {
            configurable: true,
            writable: true,
            value: proxiedInvoke
          });
          return target.invoke === proxiedInvoke;
        } catch (e) {}
        return false;
      }

      tryInstallInvokeProxy(tauri.core);
      tryInstallInvokeProxy(tauri);
      window.__W2A_TAURI_INVOKE_PROXY__ = proxiedInvoke;
      window.__W2A_DOWNLOAD_PATCHED__ = true;
      window.__W2A_HANDLE_DOWNLOAD__ = function(payload) {
        const next = Object.assign({}, payload || {});
        next.id = String(Date.now()) + '_' + Math.random().toString(16).slice(2);
        next.language = next.language || ((navigator.language || 'zh-CN'));
        next.filename = next.filename || inferDownloadFilename(next.url || '', 'download');
        return runDownloadTask(next);
      };
    }

    // 拦截原生 Web 下载（<a download>、blob URL、window.open），路由到 runDownloadTask
    function patchNativeDownloads() {
      if (!enableDownloadManager || window.__W2A_NATIVE_DOWNLOAD_PATCHED__) return;
      window.__W2A_NATIVE_DOWNLOAD_PATCHED__ = true;

      var _DL_EXT = /\.({_DOWNLOAD_EXTENSIONS})$/i;

      // ---- 1. blob URL 映射：记录 createObjectURL 的 blob，供 anchor 点击时 fetch ----
      var _blobMap = {};
      var _origCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = function(blob) {
        var url = _origCreateObjectURL.call(URL, blob);
        if (blob && typeof url === 'string' && url.indexOf('blob:') === 0) {
          try { _blobMap[url] = blob; } catch (e) {}
        }
        return url;
      };
      var _origRevokeObjectURL = URL.revokeObjectURL;
      URL.revokeObjectURL = function(url) {
        if (url && _blobMap[url]) { try { delete _blobMap[url]; } catch (e) {} }
        return _origRevokeObjectURL.call(URL, url);
      };

      // ---- 2. capture 阶段 click 拦截 <a download> / 带下载意图的链接 ----
      document.addEventListener('click', function(ev) {
        if (!enableDownloadManager) return;
        try {
          var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
          if (!a) return;
          var href = a.href || '';
          if (!href || href.indexOf('javascript:') === 0 || href.indexOf('#') === 0) return;
          var hasDownloadAttr = a.hasAttribute('download') || a.download;
          var isBlobUrl = href.indexOf('blob:') === 0;
          var hrefLower = href.toLowerCase().split('?')[0].split('#')[0];
          var isFileExt = _DL_EXT.test(hrefLower);
          if (!hasDownloadAttr && !isBlobUrl && !isFileExt) return;
          ev.preventDefault();
          ev.stopPropagation();
          var filename = a.getAttribute('download') || '';
          if (!filename) filename = inferDownloadFilename(href, 'download');
          var task = {
            id: String(Date.now()) + '_' + Math.random().toString(16).slice(2),
            kind: isBlobUrl ? 'blob' : 'remote',
            url: href,
            filename: filename,
            binary: null,
            language: navigator.language || 'zh-CN'
          };
          runDownloadTask(task).catch(function() {});
        } catch (e) {}
      }, true);

      // ---- 3. window.open 拦截：下载类弹窗路由到下载管理器；普通弹窗改为当前窗口导航 ----
      // 注意：不可调用原始 window.open 放行普通弹窗，否则触发 WKWebView createNewPage 崩溃。
      // desktop_fix.js 中已做全局 window.open 防护，这里在下载管理器开启时补充下载拦截。
      var _popupNavigator = typeof window.__W2A_NAVIGATE_POPUP__ === 'function'
        ? window.__W2A_NAVIGATE_POPUP__
        : function(nextUrl) {
            if (nextUrl && typeof nextUrl === 'string' && /^https?:\/\//i.test(nextUrl)) window.location.href = nextUrl;
          };
      var _popupProxyFactory = typeof window.__W2A_CREATE_POPUP_PROXY__ === 'function'
        ? window.__W2A_CREATE_POPUP_PROXY__
        : function(initialUrl) {
            return {
              closed: false,
              opener: window,
              parent: window,
              top: window,
              location: { href: initialUrl || '' },
              focus: function() {},
              blur: function() {},
              close: function() { this.closed = true; }
            };
          };
      window.open = function(url) {
        if (!enableDownloadManager || !url || typeof url !== 'string') {
          if (typeof url === 'string') _popupNavigator(url);
          return _popupProxyFactory(url || '');
        }
        var hrefLower = url.toLowerCase().split('?')[0].split('#')[0];
        var isFileExt = _DL_EXT.test(hrefLower);
        var isBlobUrl = url.indexOf('blob:') === 0;
        if (!isFileExt && !isBlobUrl) {
          _popupNavigator(url);
          return _popupProxyFactory(url);
        }
        var task = {
          id: String(Date.now()) + '_' + Math.random().toString(16).slice(2),
          kind: isBlobUrl ? 'blob' : 'remote',
          url: url,
          filename: inferDownloadFilename(url, 'download'),
          binary: null,
          language: navigator.language || 'zh-CN'
        };
        runDownloadTask(task).catch(function() {});
        return _popupProxyFactory(url);
      };

      // ---- 4. 覆盖 document.createElement('a')：拦截编程式下载 ----
      // Suno 等站点用 createElement('a') + a.click() 编程式下载，<a> 从未加入 DOM，
      // document 上的 click 监听收不到事件。pake event.js 的 createElement hook
      // 仅处理 blob:/data: URL，对签名 https mp3 放行。这里补上 https 拦截。
      // 注意：custom.js 在 event.js 之后加载，会替换 pake 的 createElement，
      // 所以对 blob/data URL 直接 return，交给 pake 通过 __W2A_HANDLE_DOWNLOAD__ 处理。
      var _origCreateElement = document.createElement.bind(document);
      document.createElement = function(tag) {
        var el = _origCreateElement(tag);
        if (typeof tag === 'string' && tag.toLowerCase() === 'a') {
          el.addEventListener('click', function(e) {
            if (!enableDownloadManager) return;
            try {
              var href = el.href || '';
              if (!href || href.indexOf('javascript:') === 0 || href.indexOf('#') === 0) return;
              var isBlobUrl = href.indexOf('blob:') === 0;
              var isDataUrl = href.indexOf('data:') === 0;
              // blob/data URL 交给 pake event.js 处理（它已 hook 且会移交 __W2A_HANDLE_DOWNLOAD__）
              if (isBlobUrl || isDataUrl) return;
              var hasDownloadAttr = el.hasAttribute('download') || el.download;
              var hrefLower = href.toLowerCase().split('?')[0].split('#')[0];
              var isFileExt = _DL_EXT.test(hrefLower);
              if (!hasDownloadAttr && !isFileExt) return;
              e.preventDefault();
              e.stopImmediatePropagation();
              var filename = el.getAttribute('download') || '';
              if (!filename) filename = inferDownloadFilename(href, 'download');
              var task = {
                id: String(Date.now()) + '_' + Math.random().toString(16).slice(2),
                kind: 'remote',
                url: href,
                filename: filename,
                binary: null,
                language: navigator.language || 'zh-CN'
              };
              runDownloadTask(task).catch(function() {});
            } catch (err) {}
          }, true);
        }
        return el;
      };
    }

    function isEditableTarget(node) {
      if (!node || !node.closest) return null;
      return node.closest('input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
    }
    function copyText(text) {
      const value = String(text || '');
      if (!value) return Promise.resolve(false);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(value).then(function() { return true; }).catch(function() {
          const area = document.createElement('textarea');
          area.value = value;
          area.setAttribute('readonly', 'readonly');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          let ok = false;
          try { ok = document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(area);
          return ok;
        });
      }
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(area);
      return Promise.resolve(ok);
    }
    function pasteIntoEditable(target) {
      if (!target) return;
      const applyText = function(text) {
        if (!text) return;
        try { target.focus({ preventScroll: true }); } catch (e) {
          try { target.focus(); } catch (err) {}
        }
        if (typeof target.setRangeText === 'function' && typeof target.selectionStart === 'number' && typeof target.selectionEnd === 'number') {
          const start = target.selectionStart;
          const end = target.selectionEnd;
          target.setRangeText(text, start, end, 'end');
          target.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        try { document.execCommand('insertText', false, text); } catch (e) {}
      };
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(applyText).catch(function() {});
      } else {
        try { document.execCommand('paste'); } catch (e) {}
      }
    }
    function hideContextMenu() {
      contextMenu.classList.remove('show');
      contextMenu.style.left = '-9999px';
      contextMenu.style.top = '-9999px';
      contextMenu.innerHTML = '';
      contextMenuOpen = false;
      contextMenuTarget = null;
    }
    function appendContextDivider() {
      const line = document.createElement('div');
      line.className = '__w2a_ctx_divider';
      contextMenu.appendChild(line);
    }
    function appendContextItem(label, action, disabled) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = '__w2a_ctx_item';
      item.textContent = label;
      item.disabled = !!disabled;
      item.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        hideContextMenu();
        if (!disabled && typeof action === 'function') action();
      });
      contextMenu.appendChild(item);
    }
    function showContextMenu(x, y) {
      contextMenu.classList.add('show');
      contextMenu.style.left = Math.max(8, x) + 'px';
      contextMenu.style.top = Math.max(8, y) + 'px';
      const rect = contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) contextMenu.style.left = Math.max(8, window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight - 8) contextMenu.style.top = Math.max(8, window.innerHeight - rect.height - 8) + 'px';
      contextMenuOpen = true;
    }
    function populateDefaultContextMenu(ev) {
      const target = ev.target;
      const editable = isEditableTarget(target);
      const link = target && target.closest ? target.closest('a[href]') : null;
      const media = target && target.closest ? target.closest('img,video,audio') : null;
      // WKWebView/Tauri 往往没有系统右键菜单；媒体/链接上也必须提供自建菜单，不能 return false
      const selectedText = String(window.getSelection && window.getSelection().toString() || '').trim();
      contextMenu.innerHTML = '';
      if (editable) {
        contextMenuTarget = editable;
        appendContextItem(contextTexts.cut, function() {
          try { editable.focus(); document.execCommand('cut'); } catch (e) {}
        }, !!editable.readOnly || !!editable.disabled);
        appendContextItem(contextTexts.copy, function() {
          try { editable.focus(); document.execCommand('copy'); } catch (e) {}
        });
        appendContextItem(contextTexts.paste, function() { pasteIntoEditable(editable); }, !!editable.readOnly || !!editable.disabled);
        appendContextItem(contextTexts.selectAll, function() {
          try { editable.focus(); } catch (e) {}
          if (typeof editable.select === 'function') editable.select();
          else {
            try { document.execCommand('selectAll'); } catch (e) {}
          }
        });
        return true;
      }
      if (selectedText) {
        appendContextItem(contextTexts.copySelection, function() { copyText(selectedText); });
        appendContextItem(contextTexts.searchSelection, function() {
          toggleSearch(true);
          searchInput.value = selectedText;
          renderSearch(selectedText);
        });
        appendContextDivider();
      }
      if (link && link.href) {
        const href = String(link.href || '');
        appendContextItem('打开链接', function() { window.location.href = href; });
        appendContextItem('复制链接', function() { copyText(href); });
        appendContextDivider();
      }
      if (media) {
        const tag = String(media.tagName || '').toLowerCase();
        if (tag === 'video' || tag === 'audio') {
          appendContextItem(media.paused ? '播放' : '暂停', function() {
            try {
              if (media.paused) media.play();
              else media.pause();
            } catch (e) {}
          });
          if (enableCinema) {
            appendContextItem('打开影视增强', function() {
              try {
                const t = document.getElementById('__w2a_cinema_trigger');
                if (t) t.click();
              } catch (e) {}
            });
          }
          const src = media.currentSrc || media.src || '';
          if (src) appendContextItem('复制媒体地址', function() { copyText(src); });
        } else if (tag === 'img' && media.src) {
          appendContextItem('复制图片地址', function() { copyText(media.src); });
        }
        appendContextDivider();
      }
      appendContextItem(contextTexts.back, function() { window.history.back(); });
      appendContextItem(contextTexts.forward, function() { window.history.forward(); });
      appendContextItem(contextTexts.reload, function() { window.location.reload(); });
      appendContextItem(contextTexts.searchPage, function() { toggleSearch(true); });
      appendContextItem(contextTexts.copyPageUrl, function() { copyText(location.href); });
      return true;
    }

    function clearSearchMarks() {
      document.querySelectorAll('mark[data-w2a-search="1"]').forEach(function(mark) {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      });
      searchMarks = [];
      activeSearchIndex = -1;
      searchCount.textContent = '';
    }

    function collectTextNodes(root) {
      const nodes = [];
      const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
          if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest('#__w2a_search_bar') || parent.closest('#__w2a_cinema_panel') || parent.closest('#__w2a_drag') || parent.closest('#__w2a_toolbar') || parent.closest('#__w2a_download_panel') || parent.closest('#__w2a_ui_root')) return NodeFilter.FILTER_REJECT;
          if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|OPTION)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      return nodes;
    }

    function focusSearchResult(index) {
      if (!searchMarks.length) {
        searchCount.textContent = '0/0';
        return;
      }
      activeSearchIndex = (index + searchMarks.length) % searchMarks.length;
      searchMarks.forEach(function(mark, i) {
        mark.style.background = i === activeSearchIndex ? '#ff9f0a' : '#f7d564';
      });
      const mark = searchMarks[activeSearchIndex];
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      searchCount.textContent = (activeSearchIndex + 1) + '/' + searchMarks.length;
    }

    function renderSearch(query) {
      clearSearchMarks();
      if (!query) return;
      const normalized = String(query).toLowerCase();
      collectTextNodes(document.body).forEach(function(node) {
        const text = node.nodeValue || '';
        const lower = text.toLowerCase();
        if (lower.indexOf(normalized) === -1) return;
        const frag = document.createDocumentFragment();
        let cursor = 0;
        let pos = lower.indexOf(normalized, cursor);
        while (pos !== -1) {
          if (pos > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, pos)));
          const mark = document.createElement('mark');
          mark.dataset.w2aSearch = '1';
          mark.textContent = text.slice(pos, pos + normalized.length);
          frag.appendChild(mark);
          searchMarks.push(mark);
          cursor = pos + normalized.length;
          pos = lower.indexOf(normalized, cursor);
        }
        if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
        if (node.parentNode) node.parentNode.replaceChild(frag, node);
      });
      if (searchMarks.length) focusSearchResult(0);
      else searchCount.textContent = '0/0';
    }

    function toggleSearch(force) {
      const next = typeof force === 'boolean' ? force : !searchBar.classList.contains('show');
      searchBar.classList.toggle('show', next);
      hideContextMenu();
      if (next) {
        searchInput.focus();
        searchInput.select();
      } else {
        clearSearchMarks();
      }
    }

    const searchToggleBtn = document.getElementById('__w2a_search_toggle');
    if (searchToggleBtn) {
      bindBtnAction(searchToggleBtn, function() {
        if (typeof window.__W2A_EXPAND_TOOLBAR__ === 'function') window.__W2A_EXPAND_TOOLBAR__();
        toggleSearch();
      });
    }
    const downloadToggleBtn = document.getElementById('__w2a_download_toggle');
    if (downloadToggleBtn) {
      bindBtnAction(downloadToggleBtn, function() {
        if (typeof window.__W2A_EXPAND_TOOLBAR__ === 'function') window.__W2A_EXPAND_TOOLBAR__();
        toggleDownloadPanel();
      });
    }
    if (downloadClearDoneBtn) downloadClearDoneBtn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      clearCompletedDownloads();
    });
    const downloadCloseBtn = document.getElementById('__w2a_download_close');
    if (downloadCloseBtn) {
      downloadCloseBtn.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleDownloadPanel(false);
      });
    }
    document.getElementById('__w2a_search_close').addEventListener('click', function() { toggleSearch(false); });
    document.getElementById('__w2a_search_next').addEventListener('click', function() { focusSearchResult(activeSearchIndex + 1); });
    document.getElementById('__w2a_search_prev').addEventListener('click', function() { focusSearchResult(activeSearchIndex - 1); });
    searchInput.addEventListener('input', function() { renderSearch(searchInput.value.trim()); });
    searchInput.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        focusSearchResult(activeSearchIndex + 1);
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        toggleSearch(false);
      }
    });
    document.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') {
        if (contextMenuOpen) {
          hideContextMenu();
          return;
        }
        if (downloadPanel && downloadPanel.classList.contains('show')) {
          toggleDownloadPanel(false);
          return;
        }
        if (searchBar && searchBar.classList.contains('show')) {
          toggleSearch(false);
          return;
        }
        const cinemaPanel = document.getElementById('__w2a_cinema_panel');
        if (cinemaPanel && cinemaPanel.classList.contains('show')) {
          cinemaPanel.classList.remove('show');
          cinemaPanel.style.display = 'none';
          const trig = document.getElementById('__w2a_cinema_trigger');
          if (trig) {
            trig.classList.remove('active');
            trig.setAttribute('aria-expanded', 'false');
          }
          return;
        }
      }
      if ((ev.metaKey || ev.ctrlKey) && String(ev.key).toLowerCase() === 'f') {
        ev.preventDefault();
        toggleSearch();
      }
    });
    document.addEventListener('contextmenu', function(ev) {
      if (contextMenu.contains(ev.target)) return;
      // 自建浮层内部交给各自逻辑；其余一律接管，保证 WKWebView 也能右键
      if (ev.target && ev.target.closest && ev.target.closest('#__w2a_ui_root button, #__w2a_cinema_panel, #__w2a_download_panel, #__w2a_search_bar')) {
        // 允许在输入框里使用系统菜单感的自建菜单
      }
      if (!populateDefaultContextMenu(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
      showContextMenu(ev.clientX, ev.clientY);
    }, true);
    document.addEventListener('click', function(ev) {
      if (!contextMenuOpen) return;
      if (contextMenu.contains(ev.target)) return;
      hideContextMenu();
    }, true);
    document.addEventListener('click', function(ev) {
      if (!enableDownloadManager || !downloadPanel.classList.contains('show')) return;
      if (downloadPanel.contains(ev.target)) return;
      if (downloadToggleBtn && downloadToggleBtn.contains(ev.target)) return;
      // 外点关闭：同时清 class 与 display（只 remove class 会关不掉）
      toggleDownloadPanel(false);
    }, true);
    window.addEventListener('blur', hideContextMenu);
    window.addEventListener('resize', hideContextMenu);
    document.addEventListener('scroll', function() {
      if (contextMenuOpen) hideContextMenu();
    }, true);

    if (!enableCinema) {
      window.__W2A_TAURI_UI_FULL__ = true;
      purgeEarlyBootstrapDom();
      return;
    }

    let abLoopA = null;
    let abLoopB = null;
    let abTimer = null;
    let sleepTimer = null;
    let sleepTicker = null;
    let resumeTried = false;
    let audioCtx = null;
    let gainNode = null;
    let mediaSource = null;
    let boostedVideo = null;
    let subtitleTrack = null;
    let subtitleTrackEl = null;
    let subtitleDelay = 0;
    let qualityMode = 0;
    let subtitleEnhance = false;
    let cinemaRuntimeActivated = false;
    let cinemaPlaybackLoopsStarted = false;
    let triggerRefreshTimer = null;
    let triggerRefreshNeedsDeepScan = false;
    let triggerWakeTimer = null;
    let lockWakeTimer = null;
    let unlockHintTimer = null;
    let playbackLocked = false;
    let lastPlaybackWakeSrc = '';
    const siteHints = (function() {
      const host = String(location.hostname || '').toLowerCase();
      const joined = [host, String(location.href || ''), String(document.title || '')].join(' ').toLowerCase();
      return {
        isEmby: joined.indexOf('emby') !== -1,
        isJellyfin: joined.indexOf('jellyfin') !== -1,
        isPlex: joined.indexOf('plex') !== -1,
        label: joined.indexOf('emby') !== -1 ? 'Emby' : (joined.indexOf('jellyfin') !== -1 ? 'Jellyfin' : (joined.indexOf('plex') !== -1 ? 'Plex' : ''))
      };
    })();
    let playbackStore = null;
    let progressStore = {};
    let skipStore = {};

    function saveProgress() {
      if (playbackStore) playbackStore.saveProgressStore(progressStore);
      else try { localStorage.setItem('__w2a_progress', JSON.stringify(progressStore)); } catch (e) {}
    }
    function saveSkip() {
      if (playbackStore) playbackStore.saveSkipStore(skipStore);
      else try { localStorage.setItem('__w2a_skip_times', JSON.stringify(skipStore)); } catch (e) {}
    }
    function defaultCinemaAdvancedSettings() {
      return {
        speed: '1',
        volume: 100,
        qualityMode: 0,
        subtitleEnhance: false,
        subtitleSize: '1',
        ratio: 'contain',
        brightness: 100,
        contrast: 100,
        saturate: 100,
        flip: 'none'
      };
    }
    function loadCinemaAdvanced() {
      try {
        const defaults = defaultCinemaAdvancedSettings();
        const activeStore = playbackStore ? playbackStore.loadAdvancedSettings() : defaults;
        activeStore.speed = String(activeStore.speed || defaults.speed);
        activeStore.volume = Math.max(100, Math.min(400, parseInt(activeStore.volume || defaults.volume, 10) || defaults.volume));
        activeStore.qualityMode = Math.max(0, Math.min(5, parseInt(activeStore.qualityMode || defaults.qualityMode, 10) || 0));
        activeStore.subtitleEnhance = !!activeStore.subtitleEnhance;
        activeStore.subtitleSize = String(activeStore.subtitleSize || defaults.subtitleSize);
        activeStore.ratio = String(activeStore.ratio || defaults.ratio);
        activeStore.brightness = Math.max(50, Math.min(150, parseInt(activeStore.brightness || defaults.brightness, 10) || defaults.brightness));
        activeStore.contrast = Math.max(50, Math.min(150, parseInt(activeStore.contrast || defaults.contrast, 10) || defaults.contrast));
        activeStore.saturate = Math.max(0, Math.min(200, parseInt(activeStore.saturate || defaults.saturate, 10) || defaults.saturate));
        activeStore.flip = String(activeStore.flip || defaults.flip);
        return activeStore;
      } catch (e) {
        return defaultCinemaAdvancedSettings();
      }
    }
    function saveCinemaAdvanced() {
      try {
        const defaults = defaultCinemaAdvancedSettings();
        const settings = typeof readCurrentCinemaAdvancedSettings === 'function'
          ? readCurrentCinemaAdvancedSettings()
          : defaults;
        settings.qualityMode = qualityMode;
        settings.subtitleEnhance = subtitleEnhance;
        if (playbackStore) playbackStore.saveAdvancedSettings(settings);
        else localStorage.setItem('__w2a_cinema_adv', JSON.stringify(Object.assign({}, defaults, settings)));
      } catch (e) {}
    }
    function selectPrimaryVideo(list) {
      if (!list || !list.length) return null;
      list.sort(function(a, b) {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });
      return list[0] || null;
    }
    function hasPlaybackShell() {
      const hintText = [location.pathname || '', location.hash || '', document.title || ''].join(' ').toLowerCase();
      if (/(play|watch|video|movie|episode|stream|player|now playing)/.test(hintText)) return true;
      const selectors = (siteHints.isEmby || siteHints.isJellyfin)
        ? ['video', '.htmlvideoplayer', '.videoPlayerContainer', '.videoOsd', '.upNextContainer', '[data-type="video-osd"]']
        : (siteHints.isPlex
          ? ['video', '[class*="VideoPlayer"]', '[class*="PlayerOverlay"]', '[data-testid*="player"]']
          : ['video', '.vjs-tech', '.jw-video', '.jwplayer', '.plyr', '[data-testid*="player"]', '[class*="videoPlayer"]', '[class*="VideoPlayer"]']);
      for (let i = 0; i < selectors.length; i++) {
        try {
          if (document.querySelector(selectors[i])) return true;
        } catch (e) {}
      }
      return false;
    }
    function shouldAllowDeepVideoScan(forceDeep) {
      const cinemaPanel = document.getElementById('__w2a_cinema_panel');
      return !!forceDeep || cinemaRuntimeActivated || !!(cinemaPanel && cinemaPanel.classList.contains('show')) || hasPlaybackShell();
    }
    function walkRoots(visitor) {
      const seenRoots = new Set();
      function scan(root, depth) {
        if (!root || seenRoots.has(root) || depth > 4) return;
        seenRoots.add(root);
        visitor(root);
        if (!root.querySelectorAll) return;
        const nodes = root.querySelectorAll('*');
        for (let i = 0; i < nodes.length; i++) {
          const el = nodes[i];
          if (el && el.shadowRoot) scan(el.shadowRoot, depth + 1);
          if (el && el.tagName === 'IFRAME') {
            try {
              if (el.contentDocument) scan(el.contentDocument, depth + 1);
            } catch (e) {}
          }
        }
      }
      scan(document, 0);
    }
    function queryAllDeep(selector) {
      const out = [];
      const seenNodes = new Set();
      walkRoots(function(root) {
        if (!root.querySelectorAll) return;
        const found = root.querySelectorAll(selector);
        for (let i = 0; i < found.length; i++) {
          if (!seenNodes.has(found[i])) {
            seenNodes.add(found[i]);
            out.push(found[i]);
          }
        }
      });
      return out;
    }
    function queryFirstDeep(selector) {
      let match = null;
      walkRoots(function(root) {
        if (match || !root.querySelector) return;
        const node = root.querySelector(selector);
        if (node) match = node;
      });
      return match;
    }
    function currentEpisodeLabel() {
      const candidates = [];
      if (siteHints.isEmby || siteHints.isJellyfin) {
        candidates.push('.videoOsdTitle', '.videoOsdParentTitle', '.itemName', '.name', '.pageTitle', 'h1');
      } else if (siteHints.isPlex) {
        candidates.push('[class*="MetadataTitle"]', '[data-testid*="metadata"] h1', 'h1');
      } else {
        candidates.push('h1', '.pageTitle', '.title');
      }
      for (let i = 0; i < candidates.length; i++) {
        const node = cinemaRuntimeActivated ? queryFirstDeep(candidates[i]) : document.querySelector(candidates[i]);
        const text = String(node && node.textContent || '').trim();
        if (text) return text.slice(0, 160);
      }
      return String(document.title || '').trim().slice(0, 160);
    }
    playbackStore = window.__W2APlaybackStoreFactory__({
      getVideo: getVideo,
      getEpisodeLabel: currentEpisodeLabel,
      getSeriesTitle: function() {
        const parentTitleNode = (cinemaRuntimeActivated ? queryFirstDeep('.videoOsdParentTitle') : document.querySelector('.videoOsdParentTitle'))
          || (cinemaRuntimeActivated ? queryFirstDeep('.pageTitle') : document.querySelector('.pageTitle'));
        return String(parentTitleNode && parentTitleNode.textContent ? parentTitleNode.textContent : document.title || '');
      },
      defaultAdvancedSettings: defaultCinemaAdvancedSettings
    });
    progressStore = playbackStore.loadProgressStore();
    skipStore = playbackStore.loadSkipStore();
    function currentSeriesKey() {
      return playbackStore.currentSeriesKey();
    }
    function currentEpisodeKey() {
      return playbackStore.currentEpisodeKey();
    }
    function currentProgressKey() {
      return playbackStore.currentProgressKey();
    }
    function currentLegacyProgressKey() {
      return currentEpisodeKey();
    }
    function getSkipInfo() {
      return playbackStore.getSkipInfo(skipStore);
    }
    function saveSkipField(name, value) {
      skipStore = playbackStore.saveSkipField(skipStore, name, value);
      saveSkip();
    }
    function clearSkipField(name) {
      skipStore = playbackStore.clearSkipField(skipStore, name);
      saveSkip();
    }
    function fmtTime(sec) {
      if (sec == null || !isFinite(sec)) return '--';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + String(s).padStart(2, '0');
    }
    function getVideo(options) {
      options = options || {};
      let list = Array.from(document.querySelectorAll('video'));
      if (!list.length && shouldAllowDeepVideoScan(options.allowDeep)) list = queryAllDeep('video');
      return selectPrimaryVideo(list);
    }
    function isVideoActivelyPlaying() {
      const v = getVideo();
      // 去掉 readyState>=2：缓冲中也算在播，否则顶栏 peek 白点会一直露着
      return !!(v && !v.paused && !v.ended);
    }

    // 播放沉浸：仅调用原生 API 隐藏/恢复系统红绿灯；不再绘制任何 ⚪️ 占位白点
    // （旧版 __w2a_traffic_dots 无点击作用，播放时一直露着，用户明确要求去掉）
    let trafficImmersive = false;
    let trafficRevealTimer = null;

    // 清掉历史构建可能残留的白点节点
    try {
      ['__w2a_traffic_dots', '__w2a_traffic_hotedge'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    } catch (eClearDots) {}

    function applyTrafficLightsVisible(visible, fromHover) {
      if (!isMacDesktop) return Promise.resolve(null);
      // 原生隐藏/显示系统红绿灯（构建期注入 set_window_buttons_visible）
      return tauriInvoke('set_window_buttons_visible', { visible: !!visible }).catch(function() {
        return tauriInvoke('set_window_buttons_visible', { value: !!visible }).catch(function(err) {
          if (!fromHover) {
            console.warn('[W2A] 红绿灯显隐失败:', err && err.message ? err.message : err);
          }
          return null;
        });
      });
    }

    function setNativeChromeImmersive(immersive) {
      try {
        document.documentElement.classList.toggle('__w2a_video_immersive', !!immersive);
        if (document.body) document.body.classList.toggle('__w2a_video_immersive', !!immersive);
      } catch (e) {}
      trafficImmersive = !!immersive;
      if (!isMacDesktop) return;
      if (trafficRevealTimer) { clearTimeout(trafficRevealTimer); trafficRevealTimer = null; }
      // 播放中隐藏红绿灯；停止后保持隐藏，由左上角 hover 热区控制是否显示
      if (trafficImmersive) {
        applyTrafficLightsVisible(false, false);
      }
    }

    // 红绿灯 hover 热区：非播放状态下初始隐藏，鼠标移入左上角 80×40px 区域才显示
    if (isMacDesktop) {
      let trafficHoverActive = false;
      let trafficHoverLeaveTimer = null;
      function applyTrafficHover(inZone) {
        if (trafficImmersive) return;
        if (inZone === trafficHoverActive) return;
        trafficHoverActive = !!inZone;
        if (trafficHoverLeaveTimer) { clearTimeout(trafficHoverLeaveTimer); trafficHoverLeaveTimer = null; }
        if (inZone) {
          applyTrafficLightsVisible(true, true);
        } else {
          trafficHoverLeaveTimer = setTimeout(function() {
            if (!trafficHoverActive) applyTrafficLightsVisible(false, true);
          }, 320);
        }
      }
      document.addEventListener('mousemove', function(ev) {
        if (trafficImmersive) return;
        applyTrafficHover(ev.clientX < 80 && ev.clientY < 40);
      }, true);
      document.addEventListener('mouseleave', function() { applyTrafficHover(false); }, true);
      // 启动时隐藏红绿灯（延迟一帧，等待 Tauri 窗口命令就绪）
      window.setTimeout(function() { applyTrafficLightsVisible(false, false); }, 150);
    }

    function setVideoImmersive(active) {
      const next = !!active;
      const prev = !!window.__W2A_VIDEO_IMMERSIVE__;
      if (prev === next) return;
      window.__W2A_VIDEO_IMMERSIVE__ = next;
      // 先打 html 标记，让 CSS 立即隐藏右上角 peek（比 JS 更早生效）
      try {
        document.documentElement.classList.toggle('__w2a_video_immersive', next);
        if (document.body) document.body.classList.toggle('__w2a_video_immersive', next);
      } catch (eCls) {}
      // 播放沉浸：收起面板、淡化 FAB + 卸下顶栏 peek；保持窗口原尺寸与非全屏
      try {
        if (typeof window.__W2A_SET_TOOLBAR_IMMERSIVE__ === 'function') {
          window.__W2A_SET_TOOLBAR_IMMERSIVE__(next);
        }
        if (next) {
          if (panel && panel.classList.contains('show') && typeof styleCinemaPanelOpen === 'function') {
            styleCinemaPanelOpen(false);
          }
          if (trigger) {
            trigger.classList.remove('active');
            trigger.setAttribute('aria-expanded', 'false');
            // 保持节点在场，播放中用 class 强制淡出（覆盖 .awake 的 opacity:!important）
            if (!playbackLocked) {
              trigger.classList.add('visible');
              trigger.classList.add('is-immersive-faded');
              trigger.classList.remove('awake');
              trigger.style.display = 'flex';
              trigger.style.opacity = '0';
              trigger.style.pointerEvents = 'none';
            }
          }
          if (typeof lockTrigger !== 'undefined' && lockTrigger) {
            lockTrigger.classList.remove('awake');
            lockTrigger.style.opacity = '0';
            lockTrigger.style.pointerEvents = 'none';
          }
        } else {
          if (trigger && !playbackLocked) {
            const v = getVideo();
            trigger.classList.remove('is-immersive-faded');
            if (v) {
              trigger.classList.add('visible');
              trigger.style.display = 'flex';
              trigger.style.opacity = '';
              trigger.style.pointerEvents = '';
            }
          }
          if (typeof lockTrigger !== 'undefined' && lockTrigger) {
            lockTrigger.style.opacity = '';
            lockTrigger.style.pointerEvents = '';
          }
        }
      } catch (e3) {}
      setNativeChromeImmersive(next);
    }

    function syncVideoImmersiveFromPlayback() {
      const playing = (function() {
        try { return isVideoActivelyPlaying() && !playbackLocked; } catch (e) { return false; }
      })();
      setVideoImmersive(playing);
    }

    function ensureAudioBoost() {
      const v = getVideo();
      if (!v) return;
      if (boostedVideo && boostedVideo !== v) {
        audioCtx = null;
        gainNode = null;
        mediaSource = null;
        boostedVideo = null;
      }
      // 视频元素换了（SPA 导航）则重建 AudioContext，否则旧 gainNode 绑错视频
      if (audioCtx && boostedVideo && boostedVideo !== v) {
        try { audioCtx.close(); } catch(e) {}
        audioCtx = null; gainNode = null; mediaSource = null; boostedVideo = null;
      }
      if (audioCtx) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
        audioCtx.__w2aVideo = v;
        mediaSource = audioCtx.createMediaElementSource(v);
        gainNode = audioCtx.createGain();
        mediaSource.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        boostedVideo = v;
      } catch (e) {
        audioCtx = null;
        gainNode = null;
        mediaSource = null;
        boostedVideo = null;
      }
    }

    function convertSrtToVtt(text) {
      const normalized = String(text || '').replace(/\r+/g, '');
      if (/^\s*WEBVTT/i.test(normalized)) return normalized;
      return 'WEBVTT\\n\\n' + normalized.replace(/(\\d+)\\n(\\d{2}:\\d{2}:\\d{2}),(\\d{3})\\s+-->\\s+(\\d{2}:\\d{2}:\\d{2}),(\\d{3})/g, '$1\\n$2.$3 --> $4.$5');
    }

    function updateAudioTracks() {
      const row = document.getElementById('__w2a_audio_track_row');
      const select = document.getElementById('__w2a_audio_track');
      const v = getVideo();
      if (!select) return;
      select.innerHTML = '';
      if (!v || !v.audioTracks || !v.audioTracks.length) {
        const opt = document.createElement('option');
        opt.value = '0';
        opt.textContent = '默认';
        select.appendChild(opt);
        select.disabled = true;
        if (row) row.style.display = 'none';
        return;
      }
      if (row) row.style.display = '';
      select.disabled = false;
      for (let i = 0; i < v.audioTracks.length; i++) {
        const track = v.audioTracks[i];
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = track.label || track.language || ('音轨 ' + (i + 1));
        if (track.enabled) opt.selected = true;
        select.appendChild(opt);
      }
    }

    const trigger = document.createElement('button');
    trigger.id = '__w2a_cinema_trigger';
    trigger.type = 'button';
    trigger.textContent = '🎬';
    trigger.title = '影视增强';
    trigger.setAttribute('aria-label', '影视增强');
    trigger.setAttribute('aria-expanded', 'false');
    // 默认隐藏：仅检测到视频时加 .visible；深色毛玻璃，避免纯白圆形
    trigger.style.cssText = 'position:fixed;right:20px;bottom:20px;left:auto;top:auto;z-index:2147483647;width:40px;height:40px;border-radius:20px;border:1px solid rgba(255,255,255,0.18);background:rgba(28,28,32,0.78);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);color:rgba(255,255,255,0.94);display:none;align-items:center;justify-content:center;cursor:pointer;font:18px/1 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,0.28);';
    mountUi(trigger);
    const lockTrigger = document.createElement('button');
    lockTrigger.id = '__w2a_lock_trigger';
    lockTrigger.type = 'button';
    lockTrigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11V8.4a4 4 0 1 0-8 0"></path><rect x="6" y="11" width="12" height="9" rx="2"></rect></svg>';
    lockTrigger.title = '锁定屏幕';
    lockTrigger.setAttribute('aria-label', '锁定屏幕');
    mountUi(lockTrigger);
    const lockOverlay = document.createElement('div');
    lockOverlay.id = '__w2a_lock_overlay';
    lockOverlay.innerHTML = '<button type="button" id="__w2a_unlock_chip" aria-label="解锁屏幕" title="解锁屏幕"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8.4a4 4 0 0 1 8 0V11"></path><rect x="6" y="11" width="12" height="9" rx="2"></rect></svg></button>';
    mountUi(lockOverlay);
    const unlockChip = document.getElementById('__w2a_unlock_chip');

    const panel = document.createElement('div');
    panel.id = '__w2a_cinema_panel';
    // 苹果风毛玻璃卡片 + 分组网格，避免按钮挤到第二行
    panel.style.cssText = 'position:fixed;right:16px;bottom:70px;left:auto;top:auto;z-index:2147483647;display:none;width:min(300px,calc(100vw - 24px));max-height:min(72vh,620px);overflow:auto;background:rgba(28,28,30,0.92);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:12px 12px 10px;color:#f5f5f7;font:12px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;box-shadow:0 16px 48px rgba(0,0,0,0.42);box-sizing:border-box;backdrop-filter:blur(28px) saturate(1.4);-webkit-backdrop-filter:blur(28px) saturate(1.4);';
    panel.innerHTML = [
      '<div class="cp-title">影视增强</div>',
      '<div class="cp-sec">',
      '  <div class="cp-sec-title">播放</div>',
      '  <div class="cp-row cp-stack"><span class="cp-label">倍速</span><span class="cp-btns cp-grid cp-grid-5" id="__w2a_speed_btns"><button data-speed="0.5">0.5</button><button data-speed="1" class="active">1.0</button><button data-speed="1.25">1.25</button><button data-speed="1.5">1.5</button><button data-speed="2">2.0</button></span></div>',
      '  <div class="cp-row"><span class="cp-label">音量</span><span class="cp-slider-row"><input id="__w2a_volume" type="range" min="100" max="400" value="100"><span class="cp-note" id="__w2a_volume_val">100%</span></span></div>',
      '  <div class="cp-row"><span class="cp-label">控制</span><span class="cp-btns cp-grid"><button id="__w2a_media_toggle">播放</button><button id="__w2a_media_prev">上集</button><button id="__w2a_media_next">下集</button></span></div>',
      '  <div class="cp-row"><span class="cp-label">功能</span><span class="cp-btns cp-grid"><button id="__w2a_pip_btn">画中画</button><button id="__w2a_fs_btn">全屏</button><button id="__w2a_shot_btn">截图</button></span></div>',
      '</div>',
      '<div class="cp-divider"></div>',
      '<div class="cp-sec">',
      '  <div class="cp-sec-title">画面</div>',
      '  <div class="cp-row cp-stack"><span class="cp-label">画质</span><span class="cp-btns cp-grid" id="__w2a_quality_btns"><button data-quality="0" class="active">关</button><button data-quality="1">清晰</button><button data-quality="2">鲜艳</button><button data-quality="3">影院</button><button data-quality="4">夜景</button><button data-quality="5">HDR</button></span></div>',
      '  <div class="cp-row"><span class="cp-label">比例</span><span class="cp-btns cp-grid" id="__w2a_ratio_btns"><button data-ratio="contain" class="active">默认</button><button data-ratio="cover">填充</button><button data-ratio="stretch">拉伸</button></span></div>',
      '  <div class="cp-row"><span class="cp-label">翻转</span><span class="cp-btns cp-grid" id="__w2a_flip_btns"><button data-flip="none" class="active">正常</button><button data-flip="h">水平</button><button data-flip="v">垂直</button></span></div>',
      '  <div class="cp-row"><span class="cp-label">亮度</span><span class="cp-slider-row"><input type="range" min="50" max="150" value="100" data-filter="brightness"></span></div>',
      '  <div class="cp-row"><span class="cp-label">对比度</span><span class="cp-slider-row"><input type="range" min="50" max="150" value="100" data-filter="contrast"></span></div>',
      '  <div class="cp-row"><span class="cp-label">饱和度</span><span class="cp-slider-row"><input type="range" min="0" max="200" value="100" data-filter="saturate"></span></div>',
      '</div>',
      '<div class="cp-divider"></div>',
      '<div class="cp-sec">',
      '  <div class="cp-sec-title">字幕</div>',
      '  <div class="cp-row"><span class="cp-label">文件</span><span class="cp-btns cp-grid" style="grid-template-columns:1fr 1fr"><button id="__w2a_sub_load">加载</button><button id="__w2a_sub_clear">清除</button></span><input id="__w2a_sub_file" type="file" accept=".srt,.vtt,.txt" style="display:none"></div>',
      '  <div class="cp-row cp-stack"><span class="cp-label">大小</span><span class="cp-btns cp-grid cp-grid-4" id="__w2a_subsize_btns"><button data-subsize="0.85">小</button><button data-subsize="1" class="active">中</button><button data-subsize="1.25">大</button><button data-subsize="1.5">特大</button></span></div>',
      '  <div class="cp-row"><span class="cp-label">延迟</span><span class="cp-btns cp-grid"><button id="__w2a_sub_delay_dec">-0.5s</button><button id="__w2a_sub_delay_reset">归零</button><button id="__w2a_sub_delay_inc">+0.5s</button></span></div>',
      '  <div class="cp-row"><span class="cp-label">状态</span><span class="cp-note" id="__w2a_sub_delay_val" style="text-align:left">0.0s</span></div>',
      '  <div class="cp-row"><span class="cp-label">增强</span><span class="cp-btns" style="justify-content:flex-start"><button id="__w2a_sub_enhance_btn" style="flex:0 0 auto;padding:5px 12px">增强</button><span class="cp-note" id="__w2a_sub_enhance_status" style="margin-left:8px">关闭</span></span></div>',
      '  <div id="__w2a_audio_track_row" class="cp-row cp-stack"><span class="cp-label">音轨</span><select id="__w2a_audio_track"></select></div>',
      '</div>',
      '<div class="cp-divider"></div>',
      '<div class="cp-sec">',
      '  <div class="cp-sec-title">跳过 / 定时</div>',
      '  <div class="cp-row"><span class="cp-label">片头</span><span class="cp-btns" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%"><button id="__w2a_intro_set">设点</button><button id="__w2a_intro_clear">清除</button></span></div>',
      '  <div class="cp-status" id="__w2a_intro_status">未设置</div>',
      '  <div class="cp-row"><span class="cp-label">片尾</span><span class="cp-btns" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%"><button id="__w2a_outro_set">设点</button><button id="__w2a_outro_clear">清除</button></span></div>',
      '  <div class="cp-status" id="__w2a_outro_status">未设置</div>',
      '  <div class="cp-row"><span class="cp-label">AB循环</span><span class="cp-btns cp-grid"><button id="__w2a_ab_a">A</button><button id="__w2a_ab_b">B</button><button id="__w2a_ab_clear">清除</button></span></div>',
      '  <div class="cp-status" id="__w2a_ab_status"></div>',
      '  <div class="cp-row cp-stack"><span class="cp-label">定时暂停</span><span class="cp-btns cp-grid cp-grid-5" id="__w2a_sleep_btns"><button data-sleep="0" class="active">关</button><button data-sleep="15">15分</button><button data-sleep="30">30分</button><button data-sleep="60">60分</button><button data-sleep="end">播完</button></span></div>',
      '  <div class="cp-status" id="__w2a_sleep_status"></div>',
      '  <div class="cp-row"><span class="cp-label">续播</span><span class="cp-note" id="__w2a_resume_status" style="text-align:left">自动记忆</span></div>',
      '  <div class="cp-row"><span class="cp-label">状态</span><span class="cp-note" id="__w2a_live_status" style="text-align:left">等待视频</span></div>',
      '</div>'
    ].join('');
    mountUi(panel);

    // 全屏时把浮层挂到全屏元素内，否则右下角 FAB / 面板会从屏幕消失
    function syncUiRootFullscreenHost() {
      try {
        const fs = document.fullscreenElement || document.webkitFullscreenElement || null;
        const host = fs || document.documentElement || document.body;
        if (uiRoot && uiRoot.parentNode !== host) host.appendChild(uiRoot);
        if (uiRoot) {
          uiRoot.style.position = 'fixed';
          uiRoot.style.inset = '0';
          uiRoot.style.zIndex = '2147483646';
          uiRoot.style.pointerEvents = 'none';
        }
      } catch (e) {}
    }
    document.addEventListener('fullscreenchange', syncUiRootFullscreenHost, true);
    document.addEventListener('webkitfullscreenchange', syncUiRootFullscreenHost, true);
    function styleCinemaPanelOpen(show) {
      if (!panel) return;
      if (show) {
        panel.classList.add('show');
        panel.style.display = 'block';
        panel.style.position = 'fixed';
        panel.style.right = '16px';
        panel.style.bottom = '70px';
        panel.style.left = 'auto';
        panel.style.top = 'auto';
        panel.style.zIndex = '2147483647';
        panel.style.width = 'min(300px, calc(100vw - 24px))';
        panel.style.background = 'rgba(28,28,30,0.92)';
        panel.style.border = '1px solid rgba(255,255,255,0.1)';
        panel.style.borderRadius = '16px';
        panel.style.padding = '12px 12px 10px';
        panel.style.color = '#f5f5f7';
        panel.style.boxShadow = '0 16px 48px rgba(0,0,0,0.42)';
        panel.style.backdropFilter = 'blur(28px) saturate(1.4)';
        try {
          panel.querySelectorAll('.cp-row').forEach(function(row) {
            const stack = row.classList.contains('cp-stack');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = stack ? '1fr' : '64px 1fr';
            row.style.alignItems = 'center';
            row.style.gap = stack ? '6px' : '8px';
            row.style.padding = '5px 0';
            row.style.minWidth = '0';
          });
          panel.querySelectorAll('.cp-btns').forEach(function(wrap) {
            if (wrap.classList.contains('cp-grid') || wrap.classList.contains('cp-grid-4') || wrap.classList.contains('cp-grid-5')) {
              wrap.style.display = 'grid';
              wrap.style.gap = '4px';
              wrap.style.width = '100%';
              wrap.style.minWidth = '0';
              if (wrap.classList.contains('cp-grid-5')) wrap.style.gridTemplateColumns = 'repeat(5,minmax(0,1fr))';
              else if (wrap.classList.contains('cp-grid-4')) wrap.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
              else wrap.style.gridTemplateColumns = 'repeat(3,minmax(0,1fr))';
            } else {
              wrap.style.display = wrap.style.display || 'flex';
              wrap.style.gap = '4px';
              wrap.style.minWidth = '0';
            }
          });
          panel.querySelectorAll('.cp-slider-row').forEach(function(row) {
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            row.style.minWidth = '0';
          });
          panel.querySelectorAll('button').forEach(function(btn) {
            btn.style.background = btn.classList.contains('active') ? 'rgba(10,132,255,0.95)' : 'rgba(120,120,128,0.22)';
            btn.style.border = '0';
            btn.style.color = '#fff';
            btn.style.borderRadius = '8px';
            btn.style.padding = '5px 0';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '11px';
            btn.style.minWidth = '0';
            btn.style.textAlign = 'center';
          });
        } catch (e) {}
      } else {
        panel.classList.remove('show');
        panel.style.display = 'none';
      }
    }

    // 记录 VIDEO_IMMERSIVE 持续 true 的起始时间，超时自动重置（防卡死）
    let immersiveStartTs = 0;
    const IMMERSIVE_TIMEOUT_MS = 8000; // 8s 无视频仍沉浸则强制复位

    function ensureCinemaFabVisible() {
      try {
        syncVideoImmersiveFromPlayback();
        // --- uiRoot 断连自愈 ---
        if (uiRoot && !uiRoot.isConnected) {
          (document.documentElement || document.body).appendChild(uiRoot);
        }
        // --- 所有 UI 元素断连自愈 ---
        var domChrome = document.getElementById('__w2a_drag');
        if (domChrome && uiRoot && domChrome.parentNode !== uiRoot) uiRoot.appendChild(domChrome);
        if (lockTrigger && uiRoot && lockTrigger.parentNode !== uiRoot) uiRoot.appendChild(lockTrigger);
        if (lockOverlay && uiRoot && lockOverlay.parentNode !== uiRoot) uiRoot.appendChild(lockOverlay);
        if (trigger && uiRoot && trigger.parentNode !== uiRoot) uiRoot.appendChild(trigger);
        if (panel && uiRoot && panel.parentNode !== uiRoot) uiRoot.appendChild(panel);
        // --- VIDEO_IMMERSIVE 卡死保险：超时无视频则强制复位 ---
        if (window.__W2A_VIDEO_IMMERSIVE__) {
          if (!immersiveStartTs) immersiveStartTs = Date.now();
          if (!getVideo() && (Date.now() - immersiveStartTs) > IMMERSIVE_TIMEOUT_MS) {
            window.__W2A_VIDEO_IMMERSIVE__ = false;
            try { document.documentElement.classList.remove('__w2a_video_immersive'); } catch(e){}
            try { document.body.classList.remove('__w2a_video_immersive'); } catch(e){}
            immersiveStartTs = 0;
          }
        } else {
          immersiveStartTs = 0;
        }
        if (window.__W2A_PLAYBACK_LOCKED__ || window.__W2A_VIDEO_IMMERSIVE__) {
          if (trigger) {
            trigger.classList.remove('visible');
            trigger.style.display = 'none';
          }
          if (lockTrigger) {
            if (window.__W2A_PLAYBACK_LOCKED__) {
              // 真正锁屏：完全隐藏锁按钮（解锁芯片替代）
              lockTrigger.classList.remove('visible');
              lockTrigger.classList.remove('awake');
              lockTrigger.style.display = 'none';
            } else {
              // 仅视频沉浸：保留 visible，仅收起 awake；鼠标移动时可通过 wakeLockTrigger 唤醒
              lockTrigger.classList.remove('awake');
              if (!lockTrigger.classList.contains('visible') && !!getVideo()) {
                lockTrigger.classList.add('visible');
              }
            }
          }
          return;
        }
        if (trigger && uiRoot && trigger.parentNode !== uiRoot) uiRoot.appendChild(trigger);
        if (panel && uiRoot && panel.parentNode !== uiRoot) uiRoot.appendChild(panel);
        // 有视频且未在播放时显示入口；播放中沉浸隐藏
        const hasVideo = !!getVideo();
        const showFab = hasVideo && !isVideoActivelyPlaying();
        // 同步 lockTrigger 可见性（非沉浸/非锁定时，有视频就应可见）
        if (lockTrigger) {
          lockTrigger.classList.toggle('visible', hasVideo);
          if (!hasVideo) {
            lockTrigger.classList.remove('awake');
            lockTrigger.style.display = 'none';
          }
        }
        if (trigger) {
          trigger.classList.toggle('visible', showFab);
          trigger.style.display = showFab ? 'flex' : 'none';
          if (showFab) {
            trigger.style.position = 'fixed';
            trigger.style.right = '18px';
            trigger.style.bottom = '18px';
            trigger.style.zIndex = '2147483647';
          }
        }
        if (panel && !panel.classList.contains('show')) {
          panel.style.display = 'none';
        }
      } catch (e) {}
    }
    window.setInterval(ensureCinemaFabVisible, 1200);
    ensureCinemaFabVisible();
    function readCurrentCinemaAdvancedSettings() {
      const v = getVideo();
      const speedBtn = panel.querySelector('#__w2a_speed_btns button.active');
      const subSizeBtn = panel.querySelector('#__w2a_subsize_btns button.active');
      const ratioBtn = panel.querySelector('#__w2a_ratio_btns button.active');
      const flipBtn = panel.querySelector('#__w2a_flip_btns button.active');
      return {
        speed: String(speedBtn && speedBtn.dataset ? (speedBtn.dataset.speed || '1') : String((v && v.playbackRate) || 1)),
        volume: Math.max(100, Math.min(400, parseInt(document.getElementById('__w2a_volume').value || '100', 10) || 100)),
        qualityMode: qualityMode,
        subtitleEnhance: subtitleEnhance,
        subtitleSize: String(subSizeBtn && subSizeBtn.dataset ? (subSizeBtn.dataset.subsize || '1') : '1'),
        ratio: String(ratioBtn && ratioBtn.dataset ? (ratioBtn.dataset.ratio || 'contain') : 'contain'),
        brightness: Math.max(50, Math.min(150, parseInt(panel.querySelector('[data-filter="brightness"]').value || '100', 10) || 100)),
        contrast: Math.max(50, Math.min(150, parseInt(panel.querySelector('[data-filter="contrast"]').value || '100', 10) || 100)),
        saturate: Math.max(0, Math.min(200, parseInt(panel.querySelector('[data-filter="saturate"]').value || '100', 10) || 100)),
        flip: String(flipBtn && flipBtn.dataset ? (flipBtn.dataset.flip || 'none') : 'none')
      };
    }
    function applyCinemaAdvancedSettings(settings) {
      const merged = Object.assign(defaultCinemaAdvancedSettings(), settings || {});
      qualityMode = Math.max(0, Math.min(5, parseInt(merged.qualityMode || '0', 10) || 0));
      subtitleEnhance = !!merged.subtitleEnhance;
      const volumeInput = document.getElementById('__w2a_volume');
      if (volumeInput) {
        volumeInput.value = String(Math.max(100, Math.min(400, parseInt(merged.volume || '100', 10) || 100)));
        document.getElementById('__w2a_volume_val').textContent = volumeInput.value + '%';
      }
      panel.querySelectorAll('#__w2a_speed_btns button').forEach(function(btn) {
        btn.classList.toggle('active', String(btn.dataset.speed || '') === String(merged.speed || '1'));
      });
      panel.querySelectorAll('#__w2a_subsize_btns button').forEach(function(btn) {
        btn.classList.toggle('active', String(btn.dataset.subsize || '') === String(merged.subtitleSize || '1'));
      });
      panel.querySelectorAll('#__w2a_ratio_btns button').forEach(function(btn) {
        btn.classList.toggle('active', String(btn.dataset.ratio || '') === String(merged.ratio || 'contain'));
      });
      panel.querySelectorAll('#__w2a_flip_btns button').forEach(function(btn) {
        btn.classList.toggle('active', String(btn.dataset.flip || '') === String(merged.flip || 'none'));
      });
      const brightnessInput = panel.querySelector('[data-filter="brightness"]');
      const contrastInput = panel.querySelector('[data-filter="contrast"]');
      const saturateInput = panel.querySelector('[data-filter="saturate"]');
      if (brightnessInput) brightnessInput.value = String(Math.max(50, Math.min(150, parseInt(merged.brightness || '100', 10) || 100)));
      if (contrastInput) contrastInput.value = String(Math.max(50, Math.min(150, parseInt(merged.contrast || '100', 10) || 100)));
      if (saturateInput) saturateInput.value = String(Math.max(0, Math.min(200, parseInt(merged.saturate || '100', 10) || 100)));
      syncQualityButtons();
      applySubtitleEnhance();
      let styleEl = document.getElementById('__w2a_sub_style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = '__w2a_sub_style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = 'video::cue{font-size:' + parseFloat(String(merged.subtitleSize || '1')) + 'em !important;}';
      const v = getVideo();
      if (v) {
        v.playbackRate = parseFloat(String(merged.speed || '1')) || 1;
        if (String(merged.ratio || 'contain') === 'stretch') {
          v.style.objectFit = 'fill';
          v.style.width = '100%';
          v.style.height = '100%';
        } else {
          v.style.objectFit = String(merged.ratio || 'contain');
          v.style.width = '';
          v.style.height = '';
        }
      }
      applyVideoFilters();
      ensureAudioBoost();
      if (gainNode && volumeInput) gainNode.gain.value = (parseInt(volumeInput.value || '100', 10) || 100) / 100;
    }
    applyCinemaAdvancedSettings(loadCinemaAdvanced());
    syncQualityButtons();
    applySubtitleEnhance();

    function wakeCinemaTrigger(ms) {
      if (playbackLocked) return;
      trigger.classList.add('visible');
      trigger.classList.add('awake');
      trigger.classList.remove('is-immersive-faded');
      trigger.style.display = 'flex';
      trigger.style.opacity = '';
      trigger.style.pointerEvents = 'auto';
      if (triggerWakeTimer) clearTimeout(triggerWakeTimer);
      if (panel.classList.contains('show')) return;
      triggerWakeTimer = setTimeout(function() {
        triggerWakeTimer = null;
        // 播放中再次淡出；暂停时保持可见
        if (!panel.classList.contains('show')) {
          trigger.classList.remove('awake');
          if (isVideoActivelyPlaying()) {
            trigger.classList.add('is-immersive-faded');
            trigger.style.opacity = '0';
            trigger.style.pointerEvents = 'none';
          }
        }
      }, Math.max(900, ms || 1800));
    }
    function wakeLockTrigger(ms) {
      if (!lockTrigger.classList.contains('visible') || playbackLocked) return;
      lockTrigger.classList.add('awake');
      lockTrigger.style.display = '';
      lockTrigger.style.opacity = '';
      lockTrigger.style.pointerEvents = 'auto';
      if (lockWakeTimer) clearTimeout(lockWakeTimer);
      lockWakeTimer = setTimeout(function() {
        lockWakeTimer = null;
        if (!playbackLocked) {
          lockTrigger.classList.remove('awake');
          if (isVideoActivelyPlaying()) {
            lockTrigger.style.opacity = '0';
            lockTrigger.style.pointerEvents = 'none';
          }
        }
      }, Math.max(900, ms || 1800));
    }
    function wakePlaybackControls(ms) {
      wakeCinemaTrigger(ms);
      wakeLockTrigger(ms);
    }
    function showUnlockHint(ms) {
      if (!playbackLocked) return;
      unlockChip.classList.add('show');
      if (unlockHintTimer) clearTimeout(unlockHintTimer);
      unlockHintTimer = setTimeout(function() {
        unlockHintTimer = null;
        if (playbackLocked) unlockChip.classList.remove('show');
      }, Math.max(1200, ms || 1800));
    }
    function setPlaybackLocked(locked) {
      playbackLocked = !!locked;
      window.__W2A_PLAYBACK_LOCKED__ = playbackLocked;
      document.body.classList.toggle('__w2a_playback_locked', playbackLocked);
      lockOverlay.classList.toggle('show', playbackLocked);
      if (playbackLocked) {
        setCinemaPanelVisible(false);
        hideContextMenu();
        trigger.classList.remove('awake');
        // 锁定时仅隐藏影视入口；解锁后恢复常驻
        trigger.classList.remove('visible');
        lockTrigger.classList.remove('awake');
        lockTrigger.classList.remove('visible');
        try {
          if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
        } catch (_err) {}
        // 移除 Emby controlsvisible（单次），用低频定时器（300ms）持续压制，避免 MutationObserver 无限循环
        try {
          document.querySelectorAll('.htmlVideoPlayer').forEach(function(p) {
            p.classList.remove('controlsvisible');
          });
        } catch (_e) {}
        if (!window.__w2a_ctrl_timer) {
          window.__w2a_ctrl_timer = setInterval(function() {
            if (!window.__W2A_PLAYBACK_LOCKED__) {
              clearInterval(window.__w2a_ctrl_timer);
              window.__w2a_ctrl_timer = null;
              return;
            }
            try {
              document.querySelectorAll('.htmlVideoPlayer.controlsvisible').forEach(function(p) {
                p.classList.remove('controlsvisible');
              });
            } catch (_e) {}
          }, 300);
        }
        showUnlockHint(1800);
      } else {
        unlockChip.classList.remove('show');
        if (unlockHintTimer) {
          clearTimeout(unlockHintTimer);
          unlockHintTimer = null;
        }
        syncVideoImmersiveFromPlayback();
        const video = getVideo();
        const showFab = !!video;
        trigger.classList.toggle('visible', showFab);
        trigger.style.display = showFab ? 'flex' : 'none';
        lockTrigger.classList.toggle('visible', showFab);
        if (showFab) {
          lockTrigger.style.display = 'flex';
          wakePlaybackControls(1400);
        }
        // 解锁：停止定时器，让 Emby 恢复控制字幕位置
        if (window.__w2a_ctrl_timer) {
          clearInterval(window.__w2a_ctrl_timer);
          window.__w2a_ctrl_timer = null;
        }
      }
    }
    function setCinemaPanelVisible(show) {
      if (playbackLocked && show) return;
      styleCinemaPanelOpen(!!show);
      trigger.classList.toggle('active', !!show);
      trigger.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show) {
        trigger.classList.add('visible');
        trigger.classList.add('awake');
        trigger.style.display = 'flex';
        trigger.style.opacity = '';
        trigger.style.pointerEvents = 'auto';
        if (triggerWakeTimer) {
          clearTimeout(triggerWakeTimer);
          triggerWakeTimer = null;
        }
      } else {
        wakeCinemaTrigger(1200);
      }
    }

    function startCinemaPlaybackLoops() {
      if (cinemaPlaybackLoopsStarted) return;
      cinemaPlaybackLoopsStarted = true;
      updateAudioTracks();
      updateLiveStatus();
      updateSkipStatus();
      setInterval(updateAudioTracks, 3000);
      setInterval(updateLiveStatus, 1000);
      setInterval(function() {
        const v = getVideo();
        if (!v || !v.duration) return;
        const key = currentProgressKey();
        const skip = getSkipInfo();
        if (skip) {
          if (skip.intro != null && !v.paused && v.currentTime > 0.5 && v.currentTime < skip.intro) v.currentTime = skip.intro;
          if (skip.outro != null && !v.paused && (v.duration - v.currentTime) < skip.outro && (v.duration - v.currentTime) > 0.5) v.currentTime = Math.max(0, v.duration - 0.5);
        }
        const sleepEndBtn = document.querySelector('#__w2a_sleep_btns button[data-sleep="end"]');
        if (sleepEndBtn && sleepEndBtn.classList.contains('active') && !v.paused && (v.duration - v.currentTime) <= 0.6) {
          v.pause();
          document.getElementById('__w2a_sleep_status').textContent = '已在片尾暂停';
          sleepEndBtn.classList.remove('active');
          const offBtn = document.querySelector('#__w2a_sleep_btns button[data-sleep="0"]');
          if (offBtn) offBtn.classList.add('active');
        }
        if (v.duration > 60) {
          if ((v.duration - v.currentTime) <= 30) {
            delete progressStore[key];
          } else {
            progressStore[key] = { time: v.currentTime, duration: v.duration };
          }
          saveProgress();
        }
        if (!resumeTried && v.readyState >= 2) {
          resumeTried = true;
          const cached = progressStore[key] || progressStore[currentLegacyProgressKey()];
          if (cached && cached.time > 5 && cached.time < cached.duration - 5 && Math.abs(v.currentTime - cached.time) > 10) {
            v.currentTime = cached.time;
            document.getElementById('__w2a_resume_status').textContent = '已恢复到 ' + fmtTime(cached.time) + (siteHints.label ? (' · ' + siteHints.label) : '');
          } else {
            document.getElementById('__w2a_resume_status').textContent = siteHints.label ? ('自动记忆 · ' + siteHints.label) : '自动记忆';
          }
        }
      }, 1000);
      setInterval(function() {
        const v = getVideo();
        if (!v) return;
        const src = v.currentSrc || v.src || '';
        if (window.__W2A_LAST_VIDEO_SRC__ !== src) {
          window.__W2A_LAST_VIDEO_SRC__ = src;
          resumeTried = false;
          if (subtitleTrack) subtitleTrack.mode = 'disabled';
          subtitleTrack = null;
          subtitleTrackEl = null;
          updateSkipStatus();
          updateAudioTracks();
          updateLiveStatus();
          applyCinemaAdvancedSettings(loadCinemaAdvanced());
          if (!playbackLocked) wakePlaybackControls(1800);
        }
      }, 2000);
    }

    function activateCinemaRuntime(video) {
      if (!video) return null;
      const src = String(video.currentSrc || video.src || '');
      const shouldWake = !cinemaRuntimeActivated || (src && src !== lastPlaybackWakeSrc);
      cinemaRuntimeActivated = true;
      if (src) lastPlaybackWakeSrc = src;
      trigger.classList.add('visible');
      lockTrigger.classList.add('visible');
      if (shouldWake && isVideoActivelyPlaying() && !playbackLocked) wakePlaybackControls(2200);
      startCinemaPlaybackLoops();
      return video;
    }

    function maybeActivateCinemaRuntime(forceDeep) {
      let video = getVideo();
      if (video) return activateCinemaRuntime(video);
      if (shouldAllowDeepVideoScan(forceDeep)) {
        video = getVideo({ allowDeep: true });
        if (video) return activateCinemaRuntime(video);
      }
      return null;
    }

    function updateTrigger(forceDeep) {
      const video = maybeActivateCinemaRuntime(!!forceDeep) || getVideo();
      syncVideoImmersiveFromPlayback();
      // 有视频即保留入口；播放中可淡出，右下角唤醒
      const showFab = !!video && !playbackLocked;
      if (!playbackLocked) {
        trigger.classList.toggle('visible', showFab);
        trigger.style.display = showFab ? 'flex' : 'none';
        if (showFab && isVideoActivelyPlaying() && !panel.classList.contains('show') && !trigger.classList.contains('awake')) {
          trigger.style.opacity = '0';
          trigger.style.pointerEvents = 'none';
        } else if (showFab && !isVideoActivelyPlaying()) {
          trigger.style.opacity = '';
          trigger.style.pointerEvents = '';
        }
      }
      lockTrigger.classList.toggle('visible', showFab);
      if (!showFab) {
        lockTrigger.style.display = 'none';
      } else {
        lockTrigger.style.display = '';
        if (isVideoActivelyPlaying() && !lockTrigger.classList.contains('awake')) {
          lockTrigger.style.opacity = '0';
          lockTrigger.style.pointerEvents = 'none';
        } else if (!isVideoActivelyPlaying()) {
          lockTrigger.style.opacity = '';
          lockTrigger.style.pointerEvents = '';
        }
      }
      if (!video) {
        if (!panel.classList.contains('show')) {
          trigger.classList.remove('awake');
          trigger.style.display = 'none';
        }
        lockTrigger.classList.remove('awake');
        if (triggerWakeTimer) {
          clearTimeout(triggerWakeTimer);
          triggerWakeTimer = null;
        }
        if (lockWakeTimer) {
          clearTimeout(lockWakeTimer);
          lockWakeTimer = null;
        }
      } else if (panel.classList.contains('show')) {
        trigger.classList.add('awake');
      } else if (!isVideoActivelyPlaying()) {
        trigger.classList.remove('awake');
        if (!playbackLocked) lockTrigger.classList.remove('awake');
      }
    }

    function scheduleTriggerRefresh(forceDeep) {
      triggerRefreshNeedsDeepScan = triggerRefreshNeedsDeepScan || !!forceDeep;
      if (triggerRefreshTimer) return;
      triggerRefreshTimer = setTimeout(function() {
        const doDeepScan = triggerRefreshNeedsDeepScan;
        triggerRefreshTimer = null;
        triggerRefreshNeedsDeepScan = false;
        updateTrigger(doDeepScan);
      }, forceDeep ? 80 : 220);
    }
    updateTrigger(false);
    new MutationObserver(function() {
      scheduleTriggerRefresh(false);
    }).observe(document.body, { childList: true, subtree: true });
    setupMediaSession();
    setInterval(function() {
      if (!cinemaRuntimeActivated) scheduleTriggerRefresh(true);
    }, 3000);

    trigger.addEventListener('click', function(ev) {
      ev.stopPropagation();
      scheduleTriggerRefresh(true);
      setCinemaPanelVisible(!panel.classList.contains('show'));
    });
    lockTrigger.addEventListener('click', function(ev) {
      ev.stopPropagation();
      setPlaybackLocked(true);
    });
    document.addEventListener('click', function(ev) {
      if (!panel.classList.contains('show')) return;
      if (panel.contains(ev.target) || trigger.contains(ev.target)) return;
      setCinemaPanelVisible(false);
    });
    trigger.addEventListener('mouseenter', function() { wakeCinemaTrigger(2200); });
    lockTrigger.addEventListener('mouseenter', function() { wakeLockTrigger(2200); });
    panel.addEventListener('mouseenter', function() { trigger.classList.add('awake'); });
    panel.addEventListener('mouseleave', function() { if (!panel.classList.contains('show')) wakeCinemaTrigger(900); });
    document.addEventListener('pointermove', function(ev) {
      if (playbackLocked) return;
      if (panel.classList.contains('show')) return;
      const video = getVideo();
      if (!video) return;
      const x = typeof ev.clientX === 'number' ? ev.clientX : 0;
      const y = typeof ev.clientY === 'number' ? ev.clientY : 0;
      // 屏幕右下角热区：播放中也可唤醒 🎬
      if (x > window.innerWidth - 120 && y > window.innerHeight - 120 && isVideoActivelyPlaying()) {
        wakeCinemaTrigger(1400);
      }
      const rect = video.getBoundingClientRect();
      const insideVideo = rect.width > 80 && rect.height > 80 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      if (!insideVideo) return;
      const nearVideoRight = x >= (rect.right - Math.min(180, rect.width * 0.28));
      const nearVideoBottom = y >= (rect.bottom - Math.min(160, rect.height * 0.28));
      const nearVideoCenterX = Math.abs(x - ((rect.left + rect.right) / 2)) <= Math.min(90, rect.width * 0.16);
      const nearVideoCenterY = Math.abs(y - ((rect.top + rect.bottom) / 2)) <= Math.min(90, rect.height * 0.16);
      if (nearVideoRight && nearVideoBottom && isVideoActivelyPlaying()) wakeCinemaTrigger(1400);
      if (nearVideoCenterX && nearVideoCenterY && isVideoActivelyPlaying()) wakeLockTrigger(1400);
    }, true);
    lockOverlay.addEventListener('pointerdown', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      showUnlockHint(1500);
    }, true);
    lockOverlay.addEventListener('touchstart', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      showUnlockHint(1500);
    }, { capture: true, passive: false });
    document.addEventListener('pointermove', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    document.addEventListener('mousemove', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    document.addEventListener('touchmove', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, { capture: true, passive: false });
    document.addEventListener('mousedown', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    document.addEventListener('mouseup', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    document.addEventListener('touchstart', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, { capture: true, passive: false });
    document.addEventListener('click', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    }, true);
    lockOverlay.addEventListener('click', function(ev) {
      if (!playbackLocked) return;
      if (unlockChip.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      showUnlockHint(1500);
    }, true);
    lockOverlay.addEventListener('contextmenu', function(ev) {
      if (!playbackLocked) return;
      ev.preventDefault();
      ev.stopPropagation();
      showUnlockHint(1500);
    }, true);
    unlockChip.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      setPlaybackLocked(false);
    });
    document.addEventListener('keydown', function(ev) {
      if (!playbackLocked) return;
      if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') showUnlockHint(1500);
      ev.preventDefault();
      ev.stopPropagation();
    }, true);

    function applyVideoFilters() {
      const v = getVideo();
      if (!v) return;
      const b = parseInt(panel.querySelector('[data-filter="brightness"]').value || '100', 10);
      const c = parseInt(panel.querySelector('[data-filter="contrast"]').value || '100', 10);
      const s = parseInt(panel.querySelector('[data-filter="saturate"]').value || '100', 10);
      const flipBtn = panel.querySelector('#__w2a_flip_btns button.active');
      const preset = {
        0: { brightness: 1, contrast: 1, saturate: 1, sepia: 0, hue: 0 },
        1: { brightness: 1.06, contrast: 1.22, saturate: 1.10, sepia: 0, hue: 0 },
        2: { brightness: 1.04, contrast: 1.14, saturate: 1.36, sepia: 0, hue: 0 },
        3: { brightness: 0.96, contrast: 1.28, saturate: 1.14, sepia: 0.12, hue: -6 },
        4: { brightness: 1.16, contrast: 1.08, saturate: 1.10, sepia: 0, hue: 4 },
        5: { brightness: 1.08, contrast: 1.34, saturate: 1.26, sepia: 0.04, hue: 0 }
      }[qualityMode] || { brightness: 1, contrast: 1, saturate: 1, sepia: 0, hue: 0 };
      let transform = '';
      if (flipBtn && flipBtn.dataset.flip === 'h') transform = 'scaleX(-1)';
      if (flipBtn && flipBtn.dataset.flip === 'v') transform = 'scaleY(-1)';
      const filters = [
        'brightness(' + Math.max(0.4, Math.min(2.4, (b / 100) * preset.brightness)) + ')',
        'contrast(' + Math.max(0.4, Math.min(2.6, (c / 100) * preset.contrast)) + ')',
        'saturate(' + Math.max(0, Math.min(3, (s / 100) * preset.saturate)) + ')'
      ];
      if (preset.sepia > 0) filters.push('sepia(' + preset.sepia + ')');
      if (preset.hue) filters.push('hue-rotate(' + preset.hue + 'deg)');
      v.style.filter = filters.join(' ');
      v.style.transform = transform;
    }

    function applySubtitleEnhance() {
      let styleEl = document.getElementById('__w2a_sub_enhance_style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = '__w2a_sub_enhance_style';
        document.head.appendChild(styleEl);
      }
      if (!subtitleEnhance) {
        styleEl.textContent = '';
      } else {
        styleEl.textContent = [
          'video::cue{',
          '  color:#fff !important;',
          '  background:rgba(0,0,0,0.52) !important;',
          '  text-shadow:0 2px 6px rgba(0,0,0,0.88),0 0 2px rgba(0,0,0,0.9) !important;',
          '  font-weight:600 !important;',
          '  letter-spacing:0 !important;',
          '}'
        ].join('\n');
      }
      const btn = document.getElementById('__w2a_sub_enhance_btn');
      const status = document.getElementById('__w2a_sub_enhance_status');
      if (btn) btn.classList.toggle('active', subtitleEnhance);
      if (status) status.textContent = subtitleEnhance ? '已开启' : '关闭';
    }

    function syncQualityButtons() {
      const row = document.getElementById('__w2a_quality_btns');
      if (!row) return;
      row.querySelectorAll('button').forEach(function(btn) {
        btn.classList.toggle('active', String(btn.dataset.quality || '0') === String(qualityMode));
      });
    }

    function updateLiveStatus() {
      const el = document.getElementById('__w2a_live_status');
      if (!el) return;
      const v = getVideo();
      if (!v) {
        el.textContent = (siteHints.label ? (siteHints.label + ' ') : '') + '等待视频';
        return;
      }
      const state = v.ended ? '已结束' : (v.paused ? '暂停' : '播放中');
      const dur = v.duration && isFinite(v.duration) ? fmtTime(v.duration) : '--';
      const prefix = siteHints.label ? (siteHints.label + ' ') : '';
      el.textContent = prefix + state + ' ' + fmtTime(v.currentTime || 0) + ' / ' + dur;
      updateMediaSessionMetadata();
    }

    function applySubtitleDelay() {
      if (!subtitleTrack || !subtitleTrack.cues) {
        document.getElementById('__w2a_sub_delay_val').textContent = subtitleDelay.toFixed(1) + 's';
        return;
      }
      try {
        for (let i = 0; i < subtitleTrack.cues.length; i++) {
          const cue = subtitleTrack.cues[i];
          if (cue.__w2aBaseStart == null) {
            cue.__w2aBaseStart = cue.startTime;
            cue.__w2aBaseEnd = cue.endTime;
          }
          cue.startTime = Math.max(0, cue.__w2aBaseStart + subtitleDelay);
          cue.endTime = Math.max(cue.startTime + 0.01, cue.__w2aBaseEnd + subtitleDelay);
        }
      } catch (e) {}
      document.getElementById('__w2a_sub_delay_val').textContent = subtitleDelay.toFixed(1) + 's';
    }

    function clickBySelectors(selectors) {
      for (let i = 0; i < selectors.length; i++) {
        const node = queryFirstDeep(selectors[i]);
        if (node) {
          try { node.click(); return true; } catch (e) {}
        }
      }
      return false;
    }

    function clickByText(candidates) {
      const nodes = queryAllDeep('button,a,[role="button"],[aria-label],[title],[data-title],[data-action]');
      for (let i = 0; i < nodes.length; i++) {
        if (!nodes[i] || nodes[i].disabled) continue;
        if (!nodes[i].getClientRects || !nodes[i].getClientRects().length) continue;
        const text = [
          nodes[i].textContent || '',
          nodes[i].getAttribute && nodes[i].getAttribute('aria-label') || '',
          nodes[i].getAttribute && nodes[i].getAttribute('title') || '',
          nodes[i].getAttribute && nodes[i].getAttribute('data-title') || '',
          nodes[i].getAttribute && nodes[i].getAttribute('data-action') || '',
          nodes[i].id || '',
          nodes[i].className || ''
        ].join(' ').trim().toLowerCase();
        if (!text) continue;
        for (let j = 0; j < candidates.length; j++) {
          if (text.indexOf(candidates[j]) !== -1) {
            try { nodes[i].click(); return true; } catch (e) {}
          }
        }
      }
      return false;
    }

    function actionSelectors(action) {
      const common = {
        toggle: ['[data-action="play"]','[data-action="pause"]','.vjs-play-control','.ytp-play-button','.jw-icon-playback','.playPauseButton','.pauseButton','.playButton'],
        next: ['[data-action="next"]','.btnNextTrack','.btnNext','.skip-button','.next-button','.ytp-next-button','.btnNextChapter','.btnSkipForward'],
        prev: ['[data-action="prev"]','[data-action="previous"]','.btnPrevTrack','.btnPrev','.prev-button','.ytp-prev-button','.btnPreviousTrack','.btnPrevious','.btnPreviousChapter']
      };
      const emby = {
        toggle: ['button[title*="Play"]','button[title*="Pause"]','[aria-label*="Play"]','[aria-label*="Pause"]','.btnPause','.btnPlay'],
        next: ['button[title*="Next"]','[aria-label*="Next"]','.upNextContainer button','.countdownNextButton','.btnNextTrack'],
        prev: ['button[title*="Previous"]','[aria-label*="Previous"]','.btnPreviousTrack','.btnPrevious']
      };
      const plex = {
        toggle: ['[class*="PlayPause"]','button[aria-label*="Play"]','button[aria-label*="Pause"]'],
        next: ['button[aria-label*="Next"]','[class*="Next"]'],
        prev: ['button[aria-label*="Previous"]','[class*="Previous"]']
      };
      let selectors = (common[action] || []).slice();
      if (siteHints.isEmby || siteHints.isJellyfin) selectors = (emby[action] || []).concat(selectors);
      if (siteHints.isPlex) selectors = (plex[action] || []).concat(selectors);
      return selectors;
    }

    function actionTexts(action) {
      const common = {
        toggle: ['播放', '暂停', 'play', 'pause', 'resume'],
        next: ['下一集', '下一个', '下一首', 'next episode', 'next track', 'next'],
        prev: ['上一集', '上一个', '上一首', 'previous episode', 'previous track', 'previous', 'prev']
      };
      if (siteHints.isEmby || siteHints.isJellyfin) {
        if (action === 'next') return ['下一集', '播放下一集', 'next episode', 'next'];
        if (action === 'prev') return ['上一集', '返回上一集', 'previous episode', 'previous', 'prev'];
      }
      return common[action] || [];
    }

    function triggerMediaAction(action) {
      const v = getVideo();
      if (action === 'toggle') {
        if (v) {
          if (v.paused) v.play && v.play().catch(function() {});
          else v.pause && v.pause();
          return true;
        }
        if (clickBySelectors(actionSelectors('toggle'))) return true;
        return clickByText(actionTexts('toggle'));
      }
      if (action === 'next') {
        if (clickBySelectors(actionSelectors('next'))) return true;
        return clickByText(actionTexts('next'));
      }
      if (action === 'prev') {
        if (clickBySelectors(actionSelectors('prev'))) return true;
        return clickByText(actionTexts('prev'));
      }
      return false;
    }

    function setupMediaSession() {
      if (!('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.setActionHandler('play', function() { triggerMediaAction('toggle'); });
        navigator.mediaSession.setActionHandler('pause', function() { triggerMediaAction('toggle'); });
        navigator.mediaSession.setActionHandler('previoustrack', function() { triggerMediaAction('prev'); });
        navigator.mediaSession.setActionHandler('nexttrack', function() { triggerMediaAction('next'); });
      } catch (e) {}
    }

    function updateMediaSessionMetadata() {
      const v = getVideo();
      if (!('mediaSession' in navigator) || !v) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: document.title || appName,
          artist: appName,
          artwork: []
        });
      } catch (e) {}
    }

    panel.querySelector('#__w2a_speed_btns').addEventListener('click', function(ev) {
      const speed = ev.target && ev.target.dataset ? ev.target.dataset.speed : '';
      if (!speed) return;
      const v = getVideo();
      if (!v) return;
      v.playbackRate = parseFloat(speed);
      this.querySelectorAll('button').forEach(function(btn) { btn.classList.remove('active'); });
      ev.target.classList.add('active');
      saveCinemaAdvanced();
    });
    document.getElementById('__w2a_volume').addEventListener('input', function() {
      const pct = parseInt(this.value || '100', 10);
      document.getElementById('__w2a_volume_val').textContent = pct + '%';
      ensureAudioBoost();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function() {});
      if (gainNode) gainNode.gain.value = pct / 100;
      saveCinemaAdvanced();
    });
    panel.querySelector('#__w2a_quality_btns').addEventListener('click', function(ev) {
      const mode = ev.target && ev.target.dataset ? ev.target.dataset.quality : '';
      if (mode === '') return;
      qualityMode = Math.max(0, Math.min(5, parseInt(mode, 10) || 0));
      syncQualityButtons();
      saveCinemaAdvanced();
      applyVideoFilters();
    });
    document.getElementById('__w2a_sub_load').addEventListener('click', function() {
      document.getElementById('__w2a_sub_file').click();
    });
    document.getElementById('__w2a_sub_file').addEventListener('change', function(ev) {
      const file = ev.target.files && ev.target.files[0];
      const v = getVideo();
      if (!file || !v) return;
      const reader = new FileReader();
      reader.onload = function(loadEv) {
        try {
          if (subtitleTrack) subtitleTrack.mode = 'disabled';
          if (subtitleTrackEl && subtitleTrackEl.parentNode) subtitleTrackEl.parentNode.removeChild(subtitleTrackEl);
          const blob = new Blob([convertSrtToVtt(loadEv.target.result || '')], { type: 'text/vtt' });
          const track = document.createElement('track');
          track.kind = 'subtitles';
          track.label = file.name || 'subtitle';
          track.src = URL.createObjectURL(blob);
          track.default = true;
          v.appendChild(track);
          subtitleTrackEl = track;
          const tt = v.textTracks[v.textTracks.length - 1];
          if (tt) {
            tt.mode = 'showing';
            subtitleTrack = tt;
            subtitleDelay = 0;
            applySubtitleDelay();
          }
        } catch (e) {}
      };
      reader.readAsText(file);
      this.value = '';
    });
    document.getElementById('__w2a_sub_clear').addEventListener('click', function() {
      if (subtitleTrack) subtitleTrack.mode = 'disabled';
      if (subtitleTrackEl && subtitleTrackEl.parentNode) subtitleTrackEl.parentNode.removeChild(subtitleTrackEl);
      subtitleTrack = null;
      subtitleTrackEl = null;
      subtitleDelay = 0;
      document.getElementById('__w2a_sub_delay_val').textContent = '0.0s';
    });
    document.getElementById('__w2a_subsize_btns').addEventListener('click', function(ev) {
      const size = ev.target && ev.target.dataset ? ev.target.dataset.subsize : '';
      if (!size) return;
      this.querySelectorAll('button').forEach(function(btn) { btn.classList.remove('active'); });
      ev.target.classList.add('active');
      let styleEl = document.getElementById('__w2a_sub_style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = '__w2a_sub_style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = 'video::cue{font-size:' + parseFloat(size) + 'em !important;}';
      saveCinemaAdvanced();
    });
    document.getElementById('__w2a_sub_delay_dec').addEventListener('click', function() {
      subtitleDelay = Math.max(-10, subtitleDelay - 0.5);
      applySubtitleDelay();
    });
    document.getElementById('__w2a_sub_delay_inc').addEventListener('click', function() {
      subtitleDelay = Math.min(10, subtitleDelay + 0.5);
      applySubtitleDelay();
    });
    document.getElementById('__w2a_sub_delay_reset').addEventListener('click', function() {
      subtitleDelay = 0;
      applySubtitleDelay();
    });
    document.getElementById('__w2a_sub_enhance_btn').addEventListener('click', function() {
      subtitleEnhance = !subtitleEnhance;
      saveCinemaAdvanced();
      applySubtitleEnhance();
    });
    document.getElementById('__w2a_audio_track').addEventListener('change', function() {
      const v = getVideo();
      if (!v || !v.audioTracks) return;
      const idx = parseInt(this.value || '0', 10);
      for (let i = 0; i < v.audioTracks.length; i++) {
        v.audioTracks[i].enabled = i === idx;
      }
    });
    panel.querySelector('#__w2a_ratio_btns').addEventListener('click', function(ev) {
      const ratio = ev.target && ev.target.dataset ? ev.target.dataset.ratio : '';
      if (!ratio) return;
      const v = getVideo();
      if (!v) return;
      this.querySelectorAll('button').forEach(function(btn) { btn.classList.remove('active'); });
      ev.target.classList.add('active');
      if (ratio === 'stretch') {
        v.style.objectFit = 'fill';
        v.style.width = '100%';
        v.style.height = '100%';
      } else {
        v.style.objectFit = ratio;
        v.style.width = '';
        v.style.height = '';
      }
      saveCinemaAdvanced();
    });
    panel.querySelector('#__w2a_flip_btns').addEventListener('click', function(ev) {
      const flip = ev.target && ev.target.dataset ? ev.target.dataset.flip : '';
      if (!flip) return;
      this.querySelectorAll('button').forEach(function(btn) { btn.classList.remove('active'); });
      ev.target.classList.add('active');
      applyVideoFilters();
      saveCinemaAdvanced();
    });
    panel.querySelectorAll('[data-filter]').forEach(function(el) {
      el.addEventListener('input', function() {
        applyVideoFilters();
        saveCinemaAdvanced();
      });
    });
    document.getElementById('__w2a_pip_btn').addEventListener('click', function() {
      const v = getVideo();
      if (!v || !document.pictureInPictureEnabled || !v.requestPictureInPicture) return;
      const restorePiPDisabled = function() {
        try { v.__w2aPipUserUnlock = false; } catch (e0) {}
        v.disablePictureInPicture = true;
        v.setAttribute('disablePictureInPicture', '');
        v.setAttribute('disablepictureinpicture', '');
      };
      try { v.__w2aPipUserUnlock = true; } catch (e1) {}
      v.disablePictureInPicture = false;
      v.removeAttribute('disablePictureInPicture');
      v.removeAttribute('disablepictureinpicture');
      v.addEventListener('leavepictureinpicture', restorePiPDisabled, { once: true });
      v.requestPictureInPicture().catch(function() {
        v.removeEventListener('leavepictureinpicture', restorePiPDisabled);
        restorePiPDisabled();
      });
    });
    function syncFsBtn() {
      const btn = document.getElementById('__w2a_fs_btn');
      if (btn) btn.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
    }
    document.addEventListener('fullscreenchange', syncFsBtn);
    document.addEventListener('webkitfullscreenchange', syncFsBtn);
    document.getElementById('__w2a_fs_btn').addEventListener('click', function() {
      const v = getVideo();
      if (!v) return;
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(function() {});
        return;
      }
      setCinemaPanelVisible(false);
      setTimeout(function() {
        if (v.requestFullscreen) v.requestFullscreen().catch(function() {});
      }, 80);
    });
    document.getElementById('__w2a_shot_btn').addEventListener('click', function() {
      const v = getVideo();
      if (!v || !v.videoWidth || !v.videoHeight) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'screenshot_' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
          try { if (a.parentNode) a.parentNode.removeChild(a); } catch(e) {}
          try { URL.revokeObjectURL(a.href); } catch(e) {}
        }, 1000);
      } catch (e) {}
    });
    document.getElementById('__w2a_media_toggle').addEventListener('click', function() {
      triggerMediaAction('toggle');
    });
    document.getElementById('__w2a_media_prev').addEventListener('click', function() {
      triggerMediaAction('prev');
    });
    document.getElementById('__w2a_media_next').addEventListener('click', function() {
      triggerMediaAction('next');
    });

    function updateSkipStatus() {
      if (!cinemaRuntimeActivated) {
        document.getElementById('__w2a_intro_status').textContent = '未设置';
        document.getElementById('__w2a_outro_status').textContent = '未设置';
        return;
      }
      const info = getSkipInfo();
      const label = currentEpisodeLabel();
      document.getElementById('__w2a_intro_status').textContent = info.intro != null ? ('片头结束 ' + fmtTime(info.intro)) : (label ? ('未设置 · ' + label) : '未设置');
      document.getElementById('__w2a_outro_status').textContent = info.outro != null ? ('片尾前 ' + fmtTime(info.outro)) : (label ? ('未设置 · ' + label) : '未设置');
    }
    document.getElementById('__w2a_intro_set').addEventListener('click', function() {
      const v = getVideo();
      if (!v) return;
      saveSkipField('intro', v.currentTime);
      updateSkipStatus();
    });
    document.getElementById('__w2a_intro_clear').addEventListener('click', function() {
      clearSkipField('intro');
      updateSkipStatus();
    });
    document.getElementById('__w2a_outro_set').addEventListener('click', function() {
      const v = getVideo();
      if (!v || !v.duration) return;
      saveSkipField('outro', Math.max(0, v.duration - v.currentTime));
      updateSkipStatus();
    });
    document.getElementById('__w2a_outro_clear').addEventListener('click', function() {
      clearSkipField('outro');
      updateSkipStatus();
    });
    updateSkipStatus();

    function syncABStatus() {
      const status = document.getElementById('__w2a_ab_status');
      if (abLoopA == null && abLoopB == null) {
        status.textContent = '';
        return;
      }
      status.textContent = 'A ' + fmtTime(abLoopA) + (abLoopB != null ? (' / B ' + fmtTime(abLoopB)) : '');
    }
    document.getElementById('__w2a_ab_a').addEventListener('click', function() {
      const v = getVideo();
      if (!v) return;
      abLoopA = v.currentTime;
      syncABStatus();
    });
    document.getElementById('__w2a_ab_b').addEventListener('click', function() {
      const v = getVideo();
      if (!v) return;
      abLoopB = v.currentTime;
      syncABStatus();
      if (abTimer) clearInterval(abTimer);
      if (abLoopA != null && abLoopB != null && abLoopB > abLoopA) {
        abTimer = setInterval(function() {
          const video = getVideo();
          if (video && video.currentTime >= abLoopB) video.currentTime = abLoopA;
        }, 250);
      }
    });
    document.getElementById('__w2a_ab_clear').addEventListener('click', function() {
      abLoopA = null;
      abLoopB = null;
      if (abTimer) clearInterval(abTimer);
      abTimer = null;
      syncABStatus();
    });

    document.getElementById('__w2a_sleep_btns').addEventListener('click', function(ev) {
      const sleepMode = ev.target && ev.target.dataset ? String(ev.target.dataset.sleep || '0') : '';
      if (!sleepMode) return;
      const mins = sleepMode === 'end' ? -1 : parseInt(sleepMode || '0', 10);
      if (sleepMode !== 'end' && Number.isNaN(mins)) return;
      if (sleepTimer) clearTimeout(sleepTimer);
      if (sleepTicker) clearInterval(sleepTicker);
      sleepTimer = null;
      sleepTicker = null;
      this.querySelectorAll('button').forEach(function(btn) { btn.classList.remove('active'); });
      ev.target.classList.add('active');
      const status = document.getElementById('__w2a_sleep_status');
      if (mins === 0) {
        status.textContent = '';
        return;
      }
      if (sleepMode === 'end') {
        status.textContent = '播放结束后暂停';
        return;
      }
      const end = Date.now() + mins * 60000;
      sleepTicker = setInterval(function() {
        const left = Math.max(0, Math.round((end - Date.now()) / 1000));
        status.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' 后暂停';
        if (left <= 0) clearInterval(sleepTicker);
      }, 1000);
      sleepTimer = setTimeout(function() {
        const v = getVideo();
        if (v) v.pause();
        status.textContent = '已暂停';
      }, mins * 60000);
    });

    document.addEventListener('keydown', function(ev) {
      const target = ev.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const v = getVideo();
      if (!v && ['n','N','p','P'].indexOf(ev.key) === -1) return;
      if (ev.key === ' ') {
        ev.preventDefault();
        if (v.paused) v.play().catch(function() {});
        else v.pause();
      }
      if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 10);
      }
      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        v.currentTime = Math.min(v.duration || (v.currentTime + 10), v.currentTime + 10);
      }
      if ((ev.key === 'f' || ev.key === 'F') && !ev.metaKey && !ev.ctrlKey) {
        ev.preventDefault();
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function() {});
        else if (v.requestFullscreen) v.requestFullscreen().catch(function() {});
      }
      if ((ev.key === '[' || ev.key === '-') && v) {
        ev.preventDefault();
        v.playbackRate = Math.max(0.25, (v.playbackRate || 1) - 0.25);
        panel.querySelectorAll('#__w2a_speed_btns button').forEach(function(btn) { btn.classList.remove('active'); });
        saveCinemaAdvanced();
      }
      if ((ev.key === ']' || ev.key === '=') && v) {
        ev.preventDefault();
        v.playbackRate = Math.min(4, (v.playbackRate || 1) + 0.25);
        panel.querySelectorAll('#__w2a_speed_btns button').forEach(function(btn) { btn.classList.remove('active'); });
        saveCinemaAdvanced();
      }
      if (ev.key === 'n' || ev.key === 'N') {
        ev.preventDefault();
        triggerMediaAction('next');
      }
      if (ev.key === 'p' || ev.key === 'P') {
        ev.preventDefault();
        triggerMediaAction('prev');
      }
    });

    document.addEventListener('play', function() {
      maybeActivateCinemaRuntime(true);
      syncVideoImmersiveFromPlayback();
      updateLiveStatus();
    }, true);
    document.addEventListener('playing', function() {
      syncVideoImmersiveFromPlayback();
      updateLiveStatus();
    }, true);
    document.addEventListener('pause', function() {
      maybeActivateCinemaRuntime(false);
      syncVideoImmersiveFromPlayback();
      // 暂停后短暂显示影视入口，便于再调出面板
      if (!playbackLocked) {
        const v = getVideo();
        if (v && trigger) {
          trigger.classList.add('visible');
          trigger.style.display = 'flex';
          wakeCinemaTrigger(2200);
        }
      }
      updateLiveStatus();
    }, true);
    document.addEventListener('ended', function() {
      syncVideoImmersiveFromPlayback();
      if (!playbackLocked) {
        const v = getVideo();
        if (v && trigger) {
          trigger.classList.add('visible');
          trigger.style.display = 'flex';
          wakeCinemaTrigger(2200);
        }
      }
      updateLiveStatus();
    }, true);
    window.__W2A_TAURI_UI_FULL__ = true;
    purgeEarlyBootstrapDom();
  } catch(e) {
    console.error('[W2A] desktop_ui onReady 执行出错:', e && e.message ? e.message : e, e && e.stack ? e.stack : '');
  }
  });

  window.setTimeout(function() {
    maybePromptMacInstallerCleanup().catch(function() {});
  }, 1400);
})();
