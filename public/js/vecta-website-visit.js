(function () {
  'use strict';
  // Loaded only by public pages. Storage is used only for an explicit opt-out.
  if (!['vectamotors.co.uk', 'www.vectamotors.co.uk', 'vecta-website.vercel.app', 'vecta-planner.vercel.app'].includes(location.hostname)) return;
  var optOutKey = 'vecta_ignore_my_visits', ignored = false;
  var url = new URL(location.href), preference = url.searchParams.get('vecta_visitors');
  try {
    if (preference === 'exclude') localStorage.setItem(optOutKey, '1');
    if (preference === 'include') localStorage.removeItem(optOutKey);
    ignored = localStorage.getItem(optOutKey) === '1';
  } catch {
    if (preference === 'exclude') {
      ignored = true;
      notice('Your visits are ignored on this page, but this browser could not save the preference. Allow site storage and try again.');
    }
  }
  if (preference === 'exclude' || preference === 'include') {
    url.searchParams.delete('vecta_visitors');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    if (ignored) {
      notice('Your visits are now ignored on this browser. Use “Ignore my visits” separately on your phone and any other browser.');
      // Remove an earlier visit from today's total, without recording a new one.
      fetch('https://vecta-planner.vercel.app/api/admin-website?visitors=1&exclude=1', request()).catch(function () {});
    } else notice('Your visits will be included again on this browser.');
  }
  if (ignored) return;
  if (navigator.webdriver || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  var sentDay = '', pending = false;
  window.addEventListener('vecta:website-booking-created', function (event) {
    try { if (localStorage.getItem(optOutKey) === '1') return; } catch {}
    var receipt = event.detail && event.detail.receipt;
    if (typeof receipt !== 'string' || receipt.length > 500) return;
    // A signed receipt from the booking server proves a request was saved.
    fetch('https://vecta-planner.vercel.app/api/admin-website?visitors=1', request({ receipt: receipt })).catch(function () {});
  });
  function record() {
    try { if (localStorage.getItem(optOutKey) === '1') return; } catch {}
    if (pending || document.visibilityState === 'hidden' || !navigator.onLine) return;
    var day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    if (sentDay === day) return;
    pending = true;
    fetch('https://vecta-planner.vercel.app/api/admin-website?visitors=1', request()).then(function (response) { if (response.ok) sentDay = day; }).catch(function () {}).finally(function () { pending = false; });
  }
  document.addEventListener('visibilitychange', record);
  window.addEventListener('pageshow', record);
  window.addEventListener('online', record);
  setInterval(record, 60000);
  record();
  function request(data) {
    return { method: 'POST', mode: 'cors', credentials: 'omit', body: JSON.stringify(data || { kind: /^\/track(?:\/|\.html|$)/.test(location.pathname) ? 'progress' : 'browse' }), keepalive: true,
      referrerPolicy: 'strict-origin-when-cross-origin', signal: AbortSignal.timeout(10000) };
  }
  function notice(text) {
    var old = document.getElementById('vectaVisitorPreferenceNotice');
    if (old) return;
    var box = document.createElement('div'), label = document.createElement('div'), close = document.createElement('button');
    box.id = 'vectaVisitorPreferenceNotice'; box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;z-index:2147483647;bottom:20px;left:50%;transform:translateX(-50%);width:min(460px,calc(100% - 32px));box-sizing:border-box;padding:18px;background:#112438;color:#fff;border:1px solid #6888a6;border-radius:12px;font:14px/1.5 system-ui;box-shadow:0 12px 40px #0008';
    label.textContent = text; close.textContent = 'Done'; close.type = 'button';
    close.style.cssText = 'margin-top:12px;padding:8px 20px;background:#e8f2fc;color:#112438;border:0;border-radius:6px;font:600 14px system-ui';
    close.onclick = function () { box.remove(); };
    box.append(label, close); document.body.appendChild(box);
  }
})();
