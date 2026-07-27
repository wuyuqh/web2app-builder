(function() {
  const loginCfg = __W2A_LOGIN_JSON__;
  if (!loginCfg || !loginCfg.enabled) return;
  let submitted = false;
  function fillInput(el, value) {
    if (!el) return;
    try {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (setter && setter.set) setter.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      try { el.value = value; } catch (_e) {}
    }
  }
  function detectLoginPage() {
    try {
      const html = ((document.documentElement && document.documentElement.innerHTML) || '').toLowerCase();
      const kw = String(loginCfg.keyword || 'password').toLowerCase();
      return html.includes(kw) || html.includes('login') || html.includes('sign in') || html.includes('登录');
    } catch (e) {
      return false;
    }
  }
  function trySubmit() {
    if (submitted || !detectLoginPage()) return;
    const pwd = document.querySelector(loginCfg.pwdSelector || 'input[type="password"]');
    if (!pwd) return;
    const user = document.querySelector(loginCfg.userSelector || 'input[type="email"],input[type="text"],input:not([type])');
    if (user) fillInput(user, loginCfg.user || '');
    fillInput(pwd, loginCfg.password || '');
    window.setTimeout(function() {
      let done = false;
      try {
        if (!done && loginCfg.formSelector) {
          const f = document.querySelector(loginCfg.formSelector);
          if (f) { f.submit(); done = true; }
        }
      } catch (e) {}
      try {
        if (!done && loginCfg.submitSelector) {
          const btn = document.querySelector(loginCfg.submitSelector);
          if (btn) { btn.click(); done = true; }
        }
      } catch (e) {}
      if (!done) {
        const btns = document.querySelectorAll('button[type="submit"],input[type="submit"],button');
        for (const btn of btns) {
          const text = String(btn.textContent || '').toLowerCase();
          if (text.includes('sign') || text.includes('log') || text.includes('登') || text.includes('submit')) {
            try { btn.click(); done = true; break; } catch (e) {}
          }
        }
      }
      if (!done && pwd.form) {
        try { pwd.form.submit(); done = true; } catch (e) {}
      }
      if (done) submitted = true;
    }, Math.max(0, Number(loginCfg.waitMs || 500)));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trySubmit, { once: true });
  } else {
    trySubmit();
  }
  window.addEventListener('load', trySubmit, { once: true });
  const observer = new MutationObserver(function() {
    if (!submitted) trySubmit();
  });
  try {
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    window.setTimeout(function() { observer.disconnect(); }, 20000);
  } catch (e) {}
})();
