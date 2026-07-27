(function() {
  try {
    if (location.username || location.password) {
      var __w2aCleanUrl = new URL(location.href);
      __w2aCleanUrl.username = '';
      __w2aCleanUrl.password = '';
      history.replaceState(history.state, document.title, __w2aCleanUrl.href);
    }
  } catch (e) {}

  // ===== 全局拦截 window.open，防止 WKWebView createNewPage 崩溃 =====
  // macOS WKWebView 在未正确实现新窗口委托时，window.open 会触发
  // UIDelegate::UIClient::createNewPage 抛出 NSException 导致应用崩溃。
  // 将新窗口请求改为在当前窗口导航，保证单窗口应用不会崩溃。
  // 下载类弹窗（文件后缀/blob URL）交给后续下载管理器逻辑处理。
  if (!window.__W2A_WINDOW_OPEN_GUARDED__) {
    window.__W2A_WINDOW_OPEN_GUARDED__ = true;
    function __w2aNavigateFromPopup(rawUrl) {
      try {
        var s = String(rawUrl || '');
        if (!s || s === 'about:blank') return;
        if (window.__W2A_HANDLE_DOWNLOAD__) {
          var isFile = /\.(__W2A_DOWNLOAD_EXTENSIONS__)$/i.test(s.split('?')[0].split('#')[0]);
          var isBlob = s.indexOf('blob:') === 0;
          if (isFile || isBlob) {
            window.__W2A_HANDLE_DOWNLOAD__({ url: s, kind: isBlob ? 'blob' : 'remote' });
            return;
          }
        }
        if (/^https?:\/\//i.test(s) || s.indexOf('/') === 0 || s.indexOf('?') === 0 || s.indexOf('#') === 0) {
          window.location.href = s;
        }
      } catch (e) {}
    }
    window.__W2A_NAVIGATE_POPUP__ = __w2aNavigateFromPopup;
    function __w2aCreatePopupProxy(initialUrl) {
      var state = {
        closed: false,
        opener: window,
        name: '',
      };
      var proxy = {
        closed: false,
        opener: window,
        parent: window,
        top: window,
        focus: function() {},
        blur: function() {},
        close: function() {
          state.closed = true;
          proxy.closed = true;
        },
        postMessage: function(message, targetOrigin, transfer) {
          try { window.postMessage(message, targetOrigin || '*', transfer); } catch (e) {}
        },
        document: {
          write: function() {},
          open: function() { return this; },
          close: function() {},
          body: null,
        },
      };
      var locationState = {
        href: '',
        assign: function(value) { __w2aNavigateFromPopup(value); },
        replace: function(value) { __w2aNavigateFromPopup(value); },
        reload: function() {},
        toString: function() { return locationState.href || ''; },
      };
      Object.defineProperty(locationState, 'href', {
        get: function() { return state.href || ''; },
        set: function(value) {
          state.href = String(value || '');
          __w2aNavigateFromPopup(state.href);
        }
      });
      proxy.location = locationState;
      if (initialUrl && initialUrl !== 'about:blank') {
        locationState.href = initialUrl;
      }
      return proxy;
    }
    window.__W2A_CREATE_POPUP_PROXY__ = __w2aCreatePopupProxy;
    window.open = function(url) {
      try {
        if (url == null) return __w2aCreatePopupProxy('');
        var s = String(url);
        if (!s || s === 'about:blank') return __w2aCreatePopupProxy(s);
        __w2aNavigateFromPopup(s);
        return __w2aCreatePopupProxy(s);
      } catch (e) {
        return __w2aCreatePopupProxy('');
      }
    };
  }
  try {
    const cleanUA = __W2A_CLEAN_UA_JSON__;
    const navPlatform = __W2A_NAV_PLATFORM_JSON__;
    const uadPlatform = __W2A_UAD_PLATFORM_JSON__;
    const platformVersion = __W2A_PLATFORM_VERSION_JSON__;
    const fakePlugins = __W2A_FAKE_PLUGINS_JSON__;
    const fakeMimeTypes = __W2A_FAKE_MIME_TYPES_JSON__;
    function defineNav(key, value) {
      try {
        Object.defineProperty(navigator, key, {
          get: function() { return value; },
          configurable: true
        });
      } catch (e) {}
    }
    if (__W2A_SPOOF_ENABLED__) {
    const lowBrands = [
      { brand: 'Chromium', version: __W2A_CHROME_MAJOR_JSON__ },
      { brand: 'Google Chrome', version: __W2A_CHROME_MAJOR_JSON__ },
      { brand: 'Not)A;Brand', version: '8' }
    ];
    const fullBrands = [
      { brand: 'Chromium', version: __W2A_CHROME_FULL_JSON__ },
      { brand: 'Google Chrome', version: __W2A_CHROME_FULL_JSON__ },
      { brand: 'Not)A;Brand', version: '8' }
    ];
    defineNav('userAgent', cleanUA);
    defineNav('appVersion', cleanUA.replace(/^Mozilla\//, ''));
    defineNav('platform', navPlatform);
    defineNav('vendor', 'Google Inc.');
    defineNav('vendorSub', '');
    defineNav('productSub', '20030107');
    defineNav('webdriver', false);
    defineNav('pdfViewerEnabled', true);
    defineNav('cookieEnabled', true);
    defineNav('maxTouchPoints', __W2A_TOUCH_POINTS__);
    defineNav('hardwareConcurrency', 8);
    defineNav('deviceMemory', __W2A_HW_CONCURRENCY__);
    // 语言伪装移出 spoof 块外（见下方 oauth_safe 时仍强制 zh-CN）
    const uaData = {
      brands: lowBrands,
      mobile: __W2A_IS_MOBILE__,
      platform: uadPlatform,
      getHighEntropyValues: function(hints) {
        const req = Array.isArray(hints) ? hints : [];
        const result = {
          brands: lowBrands,
          mobile: __W2A_IS_MOBILE__,
          platform: uadPlatform,
          architecture: __W2A_ARCH_JSON__,
          bitness: __W2A_BITNESS_JSON__,
          model: __W2A_MODEL_JSON__,
          platformVersion: platformVersion,
          uaFullVersion: __W2A_CHROME_FULL_JSON__,
          fullVersionList: fullBrands,
          wow64: false
        };
        const filtered = {};
        req.forEach(function(key) {
          if (Object.prototype.hasOwnProperty.call(result, key)) filtered[key] = result[key];
        });
        filtered.brands = lowBrands;
        filtered.mobile = __W2A_IS_MOBILE__;
        filtered.platform = uadPlatform;
        return Promise.resolve(filtered);
      }
    };
    defineNav('userAgentData', uaData);
    if (!window.chrome) {
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        value: {
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
          },
          runtime: {}
        }
      });
    }
    if (!navigator.plugins || !navigator.plugins.length) {
      defineNav('plugins', fakePlugins.map(function(item, index) {
        return Object.assign({ length: fakeMimeTypes.length, index: index }, item);
      }));
    }
    if (!navigator.mimeTypes || !navigator.mimeTypes.length) {
      defineNav('mimeTypes', fakeMimeTypes.map(function(item, index) {
        return Object.assign({ enabledPlugin: fakePlugins[0] || null, index: index }, item);
      }));
    }
    if (navigator.permissions && typeof navigator.permissions.query === 'function' && !navigator.permissions.__w2aPatched) {
      const rawQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function(desc) {
        const name = desc && desc.name;
        if (name === 'notifications') {
          return Promise.resolve({ state: Notification.permission || 'default', onchange: null });
        }
        return rawQuery(desc);
      };
      navigator.permissions.__w2aPatched = true;
    }
    }
  } catch (e) {}

  // 汉化：强制 navigator.language/languages 为 zh-CN。
  // 与 Chrome UA spoof 解耦——OAuth 安全模式默认关闭 spoof，但语言伪装仍应生效。
  try {
    function defineNavLang(key, value) {
      try {
        Object.defineProperty(navigator, key, {
          get: function() { return value; },
          configurable: true
        });
      } catch (e) {}
    }
    defineNavLang('language', 'zh-CN');
    defineNavLang('languages', Object.freeze(['zh-CN', 'zh', 'en-US', 'en']));
  } catch (e) {}

  // macOS WKWebView 的原生 video 控件会在播放页右上角绘制远程播放/PiP 入口；
  // 在 Tauri 壳内表现为无功能的纯白圆点（OmniBox/ArtPlayer 最明显；Emby 自有 OSD 通常不触发）。
  // 只隐藏原生入口与 ArtPlayer AirPlay 控件，不影响壳自定义三点工具栏 / 影视增强。
  try {
    if (!document.getElementById('__w2a_video_native_controls_style')) {
      var mediaStyle = document.createElement('style');
      mediaStyle.id = '__w2a_video_native_controls_style';
      mediaStyle.textContent = [
        /* WebKit 原生媒体控件：投屏 / AirPlay / 无线播放 / PiP */
        'video::-webkit-media-controls-airplay-button{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;width:0 !important;height:0 !important;margin:0 !important;padding:0 !important}',
        'video::-webkit-media-controls-wireless-playback-picker-button{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;width:0 !important;height:0 !important;margin:0 !important;padding:0 !important}',
        'video::-webkit-media-controls-picture-in-picture-button{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;width:0 !important;height:0 !important;margin:0 !important;padding:0 !important}',
        'video::-webkit-media-controls-toggle-closed-captions-button{/* keep captions if present */}',
        'video::-webkit-media-controls-overlay-enclosure video::-webkit-media-controls-airplay-button{display:none !important}',
        /* 部分 WebKit 版本把投屏入口画在 overlay 层 */
        '*::-webkit-media-controls-airplay-button{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;width:0 !important;height:0 !important}',
        '*::-webkit-media-controls-wireless-playback-picker-button{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;width:0 !important;height:0 !important}',
        '*::-webkit-media-controls-picture-in-picture-button{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;width:0 !important;height:0 !important}',
        /* ArtPlayer AirPlay 控件（仅在 WebKit + airplay 开启时出现；壳内无可用目标时常成白点） */
        '.art-control-airplay,.art-icon-airplay,.artplayer-plugin-airplay,[class*="art-control"][class*="airplay"],[data-index] .art-control-airplay{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important;width:0 !important;min-width:0 !important;height:0 !important;margin:0 !important;padding:0 !important;overflow:hidden !important}',
        /* 站点若直接挂 Remote Playback 图标 */
        '[aria-label*="AirPlay" i],[aria-label*="Airplay" i],[aria-label*="隔空播放"],[title*="AirPlay" i],[title*="隔空播放"],[class*="airplay" i],[class*="AirPlay"],[id*="airplay" i]{display:none !important;opacity:0 !important;visibility:hidden !important;pointer-events:none !important}'
      ].join('\n');
      (document.documentElement || document.head || document.body).appendChild(mediaStyle);
    }

    function __w2aCollectVideos(root, out, depth) {
      if (!root || depth > 8) return;
      try {
        if (root.tagName === 'VIDEO') out.push(root);
        var list = root.querySelectorAll ? root.querySelectorAll('video') : [];
        for (var i = 0; i < list.length; i++) out.push(list[i]);
        var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (var j = 0; j < all.length; j++) {
          var el = all[j];
          if (el && el.shadowRoot) __w2aCollectVideos(el.shadowRoot, out, depth + 1);
        }
        if (root.shadowRoot) __w2aCollectVideos(root.shadowRoot, out, depth + 1);
      } catch (eCollect) {}
    }

    function __w2aPatchVideoElement(video) {
      if (!video || video.tagName !== 'VIDEO') return;
      try {
        video.disableRemotePlayback = true;
        video.setAttribute('disableRemotePlayback', '');
        video.setAttribute('disableremoteplayback', '');
        video.setAttribute('x-webkit-airplay', 'deny');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('playsinline', '');
        // 默认禁原生 PiP 入口（壳影视面板可临时解开）；避免右上角白点
        if (!video.__w2aPipUserUnlock) {
          video.disablePictureInPicture = true;
          video.setAttribute('disablePictureInPicture', '');
          video.setAttribute('disablepictureinpicture', '');
        }
        var controlsList = String(video.getAttribute('controlsList') || '').split(/\s+/).filter(Boolean);
        ['noremoteplayback', 'nodownload'].forEach(function(token) {
          if (controlsList.indexOf(token) === -1) controlsList.push(token);
        });
        video.setAttribute('controlsList', controlsList.join(' '));
        // 截断 WebKit 投屏选择器
        try {
          if (typeof video.webkitShowPlaybackTargetPicker === 'function' && !video.__w2aAirplayPatched) {
            video.__w2aAirplayPatched = true;
            video.webkitShowPlaybackTargetPicker = function() { return undefined; };
          }
        } catch (ePick) {}
        try {
          if (video.remote && typeof video.remote.watchAvailability === 'function' && !video.__w2aRemotePatched) {
            video.__w2aRemotePatched = true;
            try { video.remote.cancelWatchAvailability && video.remote.cancelWatchAvailability(); } catch (eCancel) {}
          }
        } catch (eRemote) {}
      } catch (ePatch) {}
    }

    function __w2aHideArtAirplayButtons(root) {
      try {
        var scope = root && root.querySelectorAll ? root : document;
        var sels = [
          '.art-control-airplay',
          '.art-icon-airplay',
          '[class*="airplay" i]',
          '[aria-label*="AirPlay" i]',
          '[aria-label*="隔空播放"]',
          '[title*="AirPlay" i]',
          '[title*="隔空播放"]'
        ];
        for (var s = 0; s < sels.length; s++) {
          var nodes = [];
          try { nodes = scope.querySelectorAll(sels[s]); } catch (eSel) { nodes = []; }
          for (var n = 0; n < nodes.length; n++) {
            var node = nodes[n];
            // 勿误伤壳 UI
            if (!node || (node.closest && node.closest('#__w2a_ui_root,#__w2a_drag,#__w2a_toolbar,#__w2a_cinema_panel,#__w2a_cinema_trigger'))) continue;
            try {
              node.style.setProperty('display', 'none', 'important');
              node.style.setProperty('visibility', 'hidden', 'important');
              node.style.setProperty('pointer-events', 'none', 'important');
              node.style.setProperty('opacity', '0', 'important');
              node.setAttribute('aria-hidden', 'true');
            } catch (eHide) {}
          }
        }
      } catch (eArt) {}
    }

    function silenceNativeVideoDots(root) {
      var videos = [];
      var scope = root || document;
      if (scope && scope.tagName === 'VIDEO') {
        __w2aPatchVideoElement(scope);
        videos.push(scope);
      }
      __w2aCollectVideos(scope === document ? (document.documentElement || document) : scope, videos, 0);
      // 去重
      var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
      for (var videoIndex = 0; videoIndex < videos.length; videoIndex++) {
        var video = videos[videoIndex];
        if (!video) continue;
        if (seen) {
          if (seen.has(video)) continue;
          seen.add(video);
        }
        __w2aPatchVideoElement(video);
      }
      __w2aHideArtAirplayButtons(scope === document ? document : scope);
    }

    // 尽早干掉 WebKit 投屏可用性事件（ArtPlayer 用它决定是否挂 AirPlay 按钮）
    try {
      if (typeof window.WebKitPlaybackTargetAvailabilityEvent !== 'undefined' && !window.__W2A_AIRPLAY_EVENT_NUKED__) {
        window.__W2A_AIRPLAY_EVENT_NUKED__ = true;
        try {
          Object.defineProperty(window, 'WebKitPlaybackTargetAvailabilityEvent', {
            get: function() { return undefined; },
            configurable: true
          });
        } catch (eNuke) {
          try { window.WebKitPlaybackTargetAvailabilityEvent = undefined; } catch (eNuke2) {}
        }
      }
    } catch (eEvt) {}

    silenceNativeVideoDots(document);
    ['loadedmetadata', 'loadstart', 'canplay', 'play', 'playing', 'enterpictureinpicture', 'webkitcurrentplaybacktargetiswirelesschanged'].forEach(function(eventName) {
      document.addEventListener(eventName, function(event) {
        var target = event && event.target;
        if (target && target.tagName === 'VIDEO') silenceNativeVideoDots(target);
        else silenceNativeVideoDots(document);
      }, true);
    });
    new MutationObserver(function(mutations) {
      var needScan = false;
      for (var mutationIndex = 0; mutationIndex < mutations.length; mutationIndex++) {
        var nodes = mutations[mutationIndex].addedNodes || [];
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
          var node = nodes[nodeIndex];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
            silenceNativeVideoDots(node);
            needScan = true;
          } else if (node.className && String(node.className).indexOf('art-') !== -1) {
            __w2aHideArtAirplayButtons(node);
            needScan = true;
          }
        }
      }
      if (needScan) silenceNativeVideoDots(document);
    }).observe(document.documentElement || document, { childList: true, subtree: true });

    // ArtPlayer/hls 常在 play 后重建属性；短周期补丁直到页面稳定
    var __w2aDotGuardTicks = 0;
    var __w2aDotGuardTimer = setInterval(function() {
      __w2aDotGuardTicks += 1;
      silenceNativeVideoDots(document);
      if (__w2aDotGuardTicks >= 40) { // ~20s
        try { clearInterval(__w2aDotGuardTimer); } catch (eClear) {}
      }
    }, 500);
    // 播放期间再扫几次，防止控件晚挂载
    document.addEventListener('play', function() {
      setTimeout(function() { silenceNativeVideoDots(document); }, 0);
      setTimeout(function() { silenceNativeVideoDots(document); }, 200);
      setTimeout(function() { silenceNativeVideoDots(document); }, 800);
      setTimeout(function() { silenceNativeVideoDots(document); }, 2000);
    }, true);

    window.__W2A_SILENCE_NATIVE_VIDEO_DOTS__ = silenceNativeVideoDots;
  } catch (e) {}

  // 修复：覆盖 pake event.js 的 isAuthLink / matchesAuthUrl。
  // pake 原始正则 /\/login/ /\/signin/ /\/auth\// 极其宽泛，会匹配 suno 等站点的
  // 内部认证路径，配合 --new-window 导致主窗口被导航到 accounts.google.com，
  // 回调后 SPA 状态不一致 → 黑屏。这里缩小为仅对 OAuth 提供商域名触发。
  try {
    var _AUTH_HOSTS = __W2A_AUTH_HOSTS_JSON__;
    function _w2aIsAuthLink(url) {
      try {
        var u = new URL(url, window.location.href);
        var host = (u.hostname || '').toLowerCase();
        for (var i = 0; i < _AUTH_HOSTS.length; i++) {
          if (host === _AUTH_HOSTS[i] || host.endsWith('.' + _AUTH_HOSTS[i])) return true;
        }
        // 仍保留 /oauth/ /authorize 路径匹配，但要求在第三方域名上
        var path = (u.pathname || '').toLowerCase();
        if (path.indexOf('/oauth/') >= 0 || path.indexOf('/authorize') >= 0) {
          var launchOrigin = '';
          try { launchOrigin = new URL(window.location.href).origin; } catch(e2) {}
          if (u.origin !== launchOrigin) return true;
        }
        return false;
      } catch (e) { return false; }
    }
    window.matchesAuthUrl = _w2aIsAuthLink;
    window.isAuthLink = _w2aIsAuthLink;
    window.isAuthPopup = function(url, name) {
      var authNames = ['AppleAuthentication','oauth2','oauth','google-auth','auth-popup','signin','login'];
      if (name && authNames.indexOf(name) >= 0) return true;
      return _w2aIsAuthLink(url);
    };
  } catch (e) {}

  try {
    if (__W2A_IS_MOBILE__) {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head && document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=yes');
    } else {
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head && document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'width=1280,initial-scale=1,user-scalable=yes');
      if (document.body) document.body.style.overflow = 'auto';
    }
  } catch (e) {}

  try {
    const authCfg = __W2A_PROXY_JSON__;
    if (authCfg && authCfg.user && authCfg.password) {
      const token = btoa(String(authCfg.user) + ':' + String(authCfg.password));
      window.__W2A_BASIC_AUTH = token;
      if (!window.__W2A_FETCH_PATCHED__) {
        const rawFetch = window.fetch;
        if (typeof rawFetch === 'function') {
          window.fetch = function(input, init) {
            init = init || {};
            const headers = new Headers(init.headers || {});
            if (!headers.has('Authorization')) headers.set('Authorization', 'Basic ' + token);
            init.headers = headers;
            return rawFetch.call(this, input, init);
          };
        }
        window.__W2A_FETCH_PATCHED__ = true;
      }
    }
  } catch (e) {}

  try {
    if (__W2A_BACKGROUND_PLAY__) {
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) return;
        const videos = document.querySelectorAll('video');
        videos.forEach(function(video) {
          try {
            if (video.paused && video.dataset && video.dataset.w2aAutoplay === '1') {
              video.play && video.play().catch(function(){});
            }
          } catch (e) {}
        });
      });
      document.addEventListener('play', function(ev) {
        const video = ev && ev.target;
        if (video && video.tagName === 'VIDEO' && video.dataset) video.dataset.w2aAutoplay = '1';
      }, true);
    }
  } catch (e) {}
})();
