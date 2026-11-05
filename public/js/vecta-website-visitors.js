(function () {
  'use strict';
  var panel = document.getElementById('websiteVisitorStats');
  if (!panel || (window.VECTA_MECHANIC_DEPLOYMENT === true || document.querySelector('meta[name="vecta-mechanic-build"]'))) return;
  panel.hidden = false;
  var pending = false, lastUpdated = 0;
  function value(id, count) { document.getElementById(id).textContent = Number.isSafeInteger(count) && count >= 0 ? count.toLocaleString('en-GB') : '—'; }
  async function refresh() {
    if (pending || document.visibilityState === 'hidden') return;
    if (!navigator.onLine) { unavailable('Offline — visitor counts will update when reconnected.'); return; }
    pending = true;
    try {
      var response = await fetch('/api/admin-website?visitors=1', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Unavailable');
      var data = await response.json();
      var day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (data.date !== day) throw new Error('Outdated totals');
      value('websiteVisitorsToday', data.today); value('websiteVisitorsYesterday', data.yesterday);
      panel.title = 'Estimated unique visitors to the public website. Repeat page views are counted once per UK calendar day. Updates every minute.' + (data.started_at ? ' Tracking started ' + new Date(data.started_at).toLocaleString('en-GB', { timeZone: 'Europe/London' }) + '.' : ' Waiting for tracking to start.') + (data.partial_today || data.partial_yesterday ? ' The first day is a partial total.' : '') + (data.yesterday === null ? ' Yesterday was not tracked.' : '');
      delete panel.dataset.unavailable;
      lastUpdated = Date.now();
    } catch { unavailable('Visitor counts are temporarily unavailable. Retrying automatically.'); }
    finally { pending = false; }
  }
  function unavailable(message) {
    value('websiteVisitorsToday', null); value('websiteVisitorsYesterday', null);
    panel.dataset.unavailable = 'true'; panel.title = message;
  }
  document.addEventListener('visibilitychange', function () { if (Date.now() - lastUpdated > 30000) refresh(); });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', function () { unavailable('Offline — visitor counts will update when reconnected.'); });
  setInterval(refresh, 60000);
  refresh();
})();
