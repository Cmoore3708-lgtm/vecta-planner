(function () {
  'use strict';
  // Loaded only by public pages. No cookies or browser storage are used.
  if (!['vectamotors.co.uk', 'www.vectamotors.co.uk', 'vecta-website.vercel.app', 'vecta-planner.vercel.app'].includes(location.hostname)) return;
  if (navigator.webdriver || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  var sentDay = '', pending = false;
  function record() {
    if (pending || document.visibilityState === 'hidden' || !navigator.onLine) return;
    var day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    if (sentDay === day) return;
    pending = true;
    fetch('https://vecta-planner.vercel.app/api/admin-website?visitors=1', {
      method: 'POST', mode: 'cors', credentials: 'omit', body: '', keepalive: true,
      referrerPolicy: 'strict-origin-when-cross-origin', signal: AbortSignal.timeout(10000)
    }).then(function (response) { if (response.ok) sentDay = day; }).catch(function () {}).finally(function () { pending = false; });
  }
  document.addEventListener('visibilitychange', record);
  window.addEventListener('pageshow', record);
  window.addEventListener('online', record);
  setInterval(record, 60000);
  record();
})();
