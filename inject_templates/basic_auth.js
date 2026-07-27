(function() {
  if (window.__W2A_BASIC_AUTH_UI__) return;
  window.__W2A_BASIC_AUTH_UI__ = true;
  const packagedAuth = __W2A_PACKAGED_JSON__;

  function invokeSafe(cmd, args) {
    try {
      const inv = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
        || (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
      if (typeof inv === 'function') return Promise.resolve(inv(cmd, args || {}));
    } catch (e) {}
    return Promise.resolve(null);
  }

  function authKey() {
    try {
      const u = new URL(location.href);
      return 'server://' + u.hostname + (u.port ? (':' + u.port) : '') + '/';
    } catch (e) {
      return 'server://unknown/';
    }
  }

  function attemptKey() { return '__w2a_ba_attempts__' + authKey(); }

  function getAttempts() {
    try { return Number(sessionStorage.getItem(attemptKey()) || '0') || 0; } catch (e) { return 0; }
  }
  function setAttempts(n) {
    try { sessionStorage.setItem(attemptKey(), String(n)); } catch (e) {}
  }

  function applyFetchAuth(user, password) {
    try {
      if (!user) return;
      const token = btoa(String(user) + ':' + String(password || ''));
      window.__W2A_BASIC_AUTH = token;
      if (window.__W2A_FETCH_PATCHED__) return;
      const rawFetch = window.fetch;
      if (typeof rawFetch !== 'function') return;
      window.fetch = function(input, init) {
        init = init || {};
        const headers = new Headers(init.headers || {});
        if (!headers.has('Authorization')) headers.set('Authorization', 'Basic ' + token);
        init.headers = headers;
        return rawFetch.call(this, input, init);
      };
      window.__W2A_FETCH_PATCHED__ = true;
    } catch (e) {}
  }

  function isLikelyAuthBlank() {
    try {
      const href = String(location.href || '');
      if (!/^https?:/i.test(href)) return false;
      if (href.indexOf('w2a-auth://') === 0) return false;
      const body = document.body;
      if (!body) return true;
      // 我们自己的弹层不算业务内容
      const clone = body.cloneNode(true);
      const self = clone.querySelector('#__w2a_basic_auth_mask');
      if (self) self.remove();
      const text = String(clone.innerText || '').replace(/\\s+/g, ' ').trim();
      const html = String(clone.innerHTML || '').replace(/\\s+/g, '').trim();
      if (html.length < 80 && text.length < 40) return true;
      if (/^unauthorized$/i.test(text) || text === '401' || /^authorization required$/i.test(text)) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function hasUrlCredentials() {
    try { return !!(location.username || location.password); } catch (e) { return false; }
  }

  function defaultUser() {
    try {
      if (location.username) return decodeURIComponent(location.username);
    } catch (e) {}
    return packagedAuth.user || '';
  }

  function buildAuthNav(action, payload) {
    const q = [];
    Object.keys(payload || {}).forEach(function(k) {
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(payload[k] == null ? '' : payload[k])));
    });
    return 'w2a-auth://' + action + (q.length ? ('?' + q.join('&')) : '');
  }

  function showBasicAuthDialog(opts) {
    if (document.getElementById('__w2a_basic_auth_mask')) return;
    opts = opts || {};
    const host = (function() { try { return location.host || location.hostname || ''; } catch (e) { return ''; } })();
    const mask = document.createElement('div');
    mask.id = '__w2a_basic_auth_mask';
    mask.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.45);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;');
    const panel = document.createElement('div');
    panel.setAttribute('style',
      'width:min(380px,92vw);background:#fff;color:#1f2937;border-radius:14px;padding:20px 20px 16px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,0.28);');
    panel.innerHTML =
      '<div style="font-size:18px;font-weight:600;margin-bottom:10px">登录验证</div>' +
      '<div style="font-size:13px;line-height:1.45;color:#6b7280;margin-bottom:14px">站点 ' +
      String(host).replace(/[<>&]/g, '') + ' 需要认证' +
      (opts.hint ? ('<br>' + String(opts.hint).replace(/[<>&]/g, '')) : '') +
      '</div>' +
      '<label style="display:block;font-size:13px;margin:0 0 6px">用户名</label>' +
      '<input id="__w2a_ba_user" type="text" autocomplete="username" ' +
      'style="box-sizing:border-box;width:100%;height:36px;border:1px solid #d1d5db;border-radius:8px;padding:0 10px;font-size:14px;margin-bottom:10px">' +
      '<label style="display:block;font-size:13px;margin:0 0 6px">密码</label>' +
      '<input id="__w2a_ba_pwd" type="password" autocomplete="current-password" ' +
      'style="box-sizing:border-box;width:100%;height:36px;border:1px solid #d1d5db;border-radius:8px;padding:0 10px;font-size:14px">' +
      '<label style="display:flex;gap:8px;align-items:center;margin:14px 0 16px;color:#4b5563;font-size:13px">' +
      '<input id="__w2a_ba_remember" type="checkbox" checked>自动登录（下次打开无需再次输入）</label>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px">' +
      '<button id="__w2a_ba_cancel" type="button" style="height:34px;border:0;border-radius:8px;padding:0 16px;background:transparent;color:#6b7280;font-size:14px">取消</button>' +
      '<button id="__w2a_ba_ok" type="button" style="height:34px;border:0;border-radius:8px;padding:0 16px;background:#2563eb;color:#fff;font-size:14px">登录</button>' +
      '</div>';
    mask.appendChild(panel);
    (document.documentElement || document.body).appendChild(mask);
    const userEl = panel.querySelector('#__w2a_ba_user');
    const pwdEl = panel.querySelector('#__w2a_ba_pwd');
    const remEl = panel.querySelector('#__w2a_ba_remember');
    if (userEl) {
      userEl.value = defaultUser();
      try { userEl.focus(); } catch (e) {}
    }
    function close() { try { mask.remove(); } catch (e) {} }
    function submit() {
      const user = userEl ? String(userEl.value || '').trim() : '';
      const password = pwdEl ? String(pwdEl.value || '') : '';
      const remember = !!(remEl && remEl.checked);
      if (!user) {
        try { userEl && userEl.focus(); } catch (e) {}
        return;
      }
      applyFetchAuth(user, password);
      const target = (function() {
        try {
          const u = new URL(location.href);
          u.username = '';
          u.password = '';
          return u.toString();
        } catch (e) {
          return location.href;
        }
      })();
      let credentialed = target;
      try {
        const cu = new URL(target);
        cu.username = user;
        cu.password = password || '';
        credentialed = cu.toString();
      } catch (e) {}
      // 优先走原生 on_navigation：持久化 + 带凭据重载（与 Electron w2a-auth 协议一致）
      try {
        location.href = buildAuthNav('submit', {
          user: user,
          password: password,
          remember: remember ? '1' : '0',
          target: target
        });
      } catch (e) {}
      // 兜底：若自定义协议未被拦截，直接带凭据重载（至少本次可用）
      setTimeout(function() {
        try {
          if (isLikelyAuthBlank() || String(location.href || '').indexOf('w2a-auth://') === 0) {
            location.replace(credentialed);
          }
        } catch (e2) {
          try { location.replace(credentialed); } catch (e3) {}
        }
      }, 350);
      close();
    }
    panel.querySelector('#__w2a_ba_ok').addEventListener('click', submit);
    panel.querySelector('#__w2a_ba_cancel').addEventListener('click', function() {
      location.href = buildAuthNav('cancel', {});
      close();
    });
    if (pwdEl) {
      pwdEl.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') submit();
      });
    }
    if (userEl) {
      userEl.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { try { pwdEl && pwdEl.focus(); } catch (e) {} }
      });
    }
  }

  function handlePossibleAuthChallenge() {
    if (!isLikelyAuthBlank()) return;
    const attempts = getAttempts();
    if (hasUrlCredentials() || (packagedAuth.user && packagedAuth.password)) {
      if (attempts < 2) {
        // 已自动带凭据仍空白：计次，交给原生/URL 凭据；超限再弹窗
        setAttempts(attempts + 1);
        if (attempts + 1 < 2) return;
      }
      // 凭据失效：清掉已存，改手动
      try {
        const target = new URL(location.href);
        target.username = '';
        target.password = '';
        location.href = buildAuthNav('clear', { target: target.toString() });
      } catch (e) {}
    }
    showBasicAuthDialog({ hint: attempts >= 2 ? '自动登录失败，请重新输入' : '' });
  }

  // 启动时若打包了代理凭据，先挂到 fetch（主文档仍依赖 URL/原生）
  if (packagedAuth.user && packagedAuth.password) {
    applyFetchAuth(packagedAuth.user, packagedAuth.password);
  }
  // URL 里已有 user:pass 时也挂 fetch
  try {
    if (location.username) applyFetchAuth(decodeURIComponent(location.username), decodeURIComponent(location.password || ''));
  } catch (e) {}

  function scheduleCheck() {
    setTimeout(handlePossibleAuthChallenge, 50);
    setTimeout(handlePossibleAuthChallenge, 400);
    setTimeout(handlePossibleAuthChallenge, 1200);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleCheck, { once: true });
  } else {
    scheduleCheck();
  }
  window.addEventListener('load', function() { setTimeout(handlePossibleAuthChallenge, 30); }, { once: true });
})();
