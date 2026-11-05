(function () {
  'use strict';
  var panel = document.getElementById('websiteVisitorStats');
  if (!panel || panel.hidden || window.VECTA_MECHANIC_DEPLOYMENT === true || document.querySelector('meta[name="vecta-mechanic-build"]')) return;
  var trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'visitorTrigger';
  trigger.setAttribute('aria-label', 'Open website visitor and booking graphs');
  trigger.setAttribute('aria-haspopup', 'dialog');
  Array.from(panel.querySelectorAll('.visitorHeading,.visitorDay')).forEach(function (node) { trigger.appendChild(node); });
  panel.prepend(trigger);
  var modal, controller, currentData, serial = 0, period = 7;
  var number = function (value) { return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en-GB') : '—'; };
  var dateLabel = function (day, full) { return new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', ...(full ? { weekday: 'short' } : {}) }); };
  var safeCount = function (value) { return Number.isSafeInteger(value) && value >= 0; };
  function el(tag, className, text) {
    var node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  }
  function build() {
    modal = el('dialog', 'websiteGraphs'); modal.id = 'websiteGraphs';
    modal.setAttribute('aria-labelledby', 'websiteGraphsTitle');
    modal.innerHTML = '<div class="wg-top"><div><span class="wg-eyebrow">VECTA · WEBSITE PERFORMANCE</span><h2 id="websiteGraphsTitle">Visits into bookings</h2><p>See how your website is working for the workshop.</p></div><button type="button" class="wg-close" aria-label="Close website graphs">×</button></div><div class="wg-toolbar"><div class="wg-period" role="group" aria-label="Chart period"><button type="button" data-days="7" aria-pressed="true">7 days</button><button type="button" data-days="30" aria-pressed="false">30 days</button></div><span class="wg-dates"></span></div><div class="wg-status" role="status"></div><div class="wg-content" hidden></div><div class="wg-bottom"><span>UK dates · Updates every minute</span></div>';
    document.body.appendChild(modal);
    modal.querySelector('.wg-close').addEventListener('click', function () { modal.close(); });
    modal.addEventListener('click', function (event) { if (event.target === modal) { var rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close(); } });
    modal.addEventListener('close', function () { serial++; if (controller) controller.abort(); trigger.focus(); });
    modal.querySelectorAll('[data-days]').forEach(function (button) {
      button.addEventListener('click', function () {
        period = Number(button.dataset.days);
        modal.querySelectorAll('[data-days]').forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
        load();
      });
    });
  }
  function unavailable(message) {
    if (!modal || !modal.open) return;
    modal.querySelector('.wg-content').hidden = true;
    var status = modal.querySelector('.wg-status'); status.replaceChildren(el('span', '', message));
    var retry = el('button', 'wg-retry', 'Try again'); retry.type = 'button'; retry.addEventListener('click', load); status.appendChild(retry);
  }
  async function load() {
    if (!modal || !modal.open) return;
    var request = ++serial;
    if (controller) controller.abort();
    if (!navigator.onLine) { unavailable('You are offline. Reconnect to see the latest figures.'); return; }
    controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);
    modal.querySelector('.wg-status').textContent = 'Loading website performance…';
    modal.querySelector('.wg-content').hidden = true;
    try {
      var response = await fetch('/api/admin-website?visitors=1&history=1&days=' + period, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Unavailable');
      var data = await response.json();
      if (request !== serial || !modal.open) return;
      var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (data.date !== today || !Array.isArray(data.days) || data.days.length !== period) throw new Error('Outdated totals');
      data.days.forEach(function (row, index) {
        var expected = new Date(today + 'T12:00:00Z'); expected.setUTCDate(expected.getUTCDate() - period + 1 + index);
        if (row.date !== expected.toISOString().slice(0, 10) || ['visitors','booking_visitors','requests','confirmed','converted_visitors'].some(function (key) { return row[key] !== null && !safeCount(row[key]); }) || row.converted_visitors > row.booking_visitors || row.confirmed > row.requests) throw new Error('Invalid totals');
      });
      render(data);
    } catch { if (request === serial && modal.open) unavailable('Website figures are temporarily unavailable. Your bookings are unaffected.'); }
    finally { clearTimeout(timeout); }
  }
  function render(data) {
    currentData = data;
    var content = modal.querySelector('.wg-content'); content.replaceChildren();
    var rows = data.days;
    function total(key) { var known = rows.filter(function (row) { return safeCount(row[key]); }); return known.length ? known.reduce(function (sum, row) { return sum + row[key]; }, 0) : null; }
    var visitors = total('visitors'), browsers = total('booking_visitors'), confirmed = total('confirmed'), requests = total('requests'), converted = total('converted_visitors');
    var rate = browsers > 0 && converted !== null ? (converted / browsers * 100).toFixed(1) + '%' : '—';
    var cards = el('div', 'wg-cards');
    [['Website visitors', number(visitors), 'Daily unique visitors added together'], ['Confirmed bookings', number(confirmed), requests === null ? 'Waiting for booking tracking' : number(requests) + ' online requests · ' + number(requests - confirmed) + ' awaiting acceptance'], ['Booking rate', rate, converted === null || browsers === null ? 'Waiting for booking tracking' : number(converted) + ' of ' + number(browsers) + ' browsing visitors booked']].forEach(function (item) {
      var card = el('div', 'wg-card'); card.append(el('span', '', item[0]), el('strong', '', item[1]), el('small', '', item[2])); cards.appendChild(card);
    });
    content.appendChild(cards);
    var chartBox = el('section', 'wg-chart');
    var heading = el('div', 'wg-chart-heading'); heading.append(el('h3', '', 'Daily activity'));
    var legend = el('div', 'wg-legend'); legend.append(el('span', 'wg-visitors-key', 'Visitors'), el('span', 'wg-bookings-key', 'Confirmed bookings')); heading.appendChild(legend); chartBox.appendChild(heading);
    chartBox.appendChild(chart(rows)); content.appendChild(chartBox);
    var note = el('p', 'wg-note');
    note.textContent = 'Today is still in progress. ' + (rows.some(function (row) { return row.visitors === null || row.requests === null; }) ? 'Blank days were not tracked. ' : '') + (data.activity_started_at ? 'Booking tracking began ' + dateLabel(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(data.activity_started_at))) + '; its first day is partial. ' : 'Booking tracking starts with the first visitor. ') + 'Only tracked requests accepted into Workshop Pro count as confirmed bookings. Figures update when you accept a request.';
    content.appendChild(note);
    var details = el('details', 'wg-details'); details.appendChild(el('summary', '', 'Daily figures & how the booking rate works'));
    var explanation = el('p', '', 'Booking rate = browsing visitors who made an accepted online booking ÷ browsing visitors. People only checking their car’s progress are excluded from this percentage. Two bookings by one visitor count as one converted visitor. Bookings are grouped by the day the request was sent, even if you accept it later. Declined, deleted and archived requests are excluded.');
    details.append(explanation, el('p', '', 'Visitor counts are estimates per browser and connection, deduplicated each UK day. The same person can appear on multiple days. Your opt-out applies separately to each browser/device; privacy opt-outs and blocked tracking can make these figures lower than the full Website Bookings list.'));
    var tableWrap = el('div', 'wg-table-wrap'), table = el('table');
    table.innerHTML = '<caption>Daily website figures</caption><thead><tr><th scope="col">Day</th><th scope="col">Visitors</th><th scope="col">Requests</th><th scope="col">Confirmed</th></tr></thead>';
    var tbody = el('tbody'); rows.slice().reverse().forEach(function (row) { var tr = el('tr'), th = el('th', '', dateLabel(row.date, true) + (row.partial ? ' *' : '')); th.scope = 'row'; tr.appendChild(th); ['visitors','requests','confirmed'].forEach(function (key) { tr.appendChild(el('td', '', number(row[key]))); }); tbody.appendChild(tr); });
    table.appendChild(tbody); tableWrap.appendChild(table); details.append(tableWrap, el('p', '', '* Partial day. — means not tracked; 0 means tracked with no activity.')); content.appendChild(details);
    modal.querySelector('.wg-dates').textContent = dateLabel(rows[0].date) + ' – ' + dateLabel(rows[rows.length - 1].date);
    modal.querySelector('.wg-status').textContent = visitors === null ? 'Ready to collect. Your graph will fill as people visit the website.' : '';
    content.hidden = false;
  }
  function chart(rows) {
    var ns = 'http://www.w3.org/2000/svg';
    function svgNode(tag, attrs, text) { var node = document.createElementNS(ns, tag); Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); }); if (text !== undefined) node.textContent = text; return node; }
    var chartWidth = window.innerWidth < 600 ? 400 : 800;
    var svg = svgNode('svg', { viewBox: '0 0 ' + chartWidth + ' 250', role: 'img', 'aria-label': 'Daily visitors and confirmed online bookings. Exact figures are available in the table below.' });
    var max = Math.max(4, ...rows.flatMap(function (row) { return [row.visitors || 0, row.confirmed || 0]; }));
    max = Math.ceil(max / 4) * 4;
    var left = 40, width = chartWidth - 56, bottom = 211, height = 179, step = width / rows.length;
    for (var tick = 0; tick <= 4; tick++) {
      var y = bottom - height * tick / 4;
      svg.append(svgNode('line', { x1: left, x2: chartWidth - 10, y1: y, y2: y, class: 'wg-grid' }), svgNode('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 'wg-axis' }, number(max * tick / 4)));
    }
    rows.forEach(function (row, index) {
      var centre = left + step * (index + 0.5), barWidth = Math.min(24, step * .32);
      ['visitors','confirmed'].forEach(function (key, series) {
        if (!safeCount(row[key])) return;
        var h = row[key] / max * height;
        var bar = svgNode('rect', { x: centre + (series ? 2 : -barWidth - 2), y: bottom - Math.max(h, 1), width: barWidth, height: Math.max(h, 1), rx: Math.min(3, barWidth / 3), class: series ? 'wg-booking-bar' : 'wg-visitor-bar', opacity: row.partial ? '.65' : '1' });
        bar.appendChild(svgNode('title', {}, dateLabel(row.date, true) + ': ' + number(row[key]) + (series ? ' confirmed bookings' : ' visitors') + (row.partial ? ' (partial day)' : ''))); svg.appendChild(bar);
      });
      if (row.visitors === null) svg.appendChild(svgNode('text', { x: centre, y: bottom - 8, 'text-anchor': 'middle', class: 'wg-axis' }, '—'));
      if (rows.length === 7 || index % 5 === 0 || index === rows.length - 1) svg.appendChild(svgNode('text', { x: centre, y: 237, 'text-anchor': 'middle', class: 'wg-axis' }, dateLabel(row.date)));
    });
    return svg;
  }
  trigger.addEventListener('click', function () { if (!modal) build(); if (!modal.open) modal.showModal(); load(); });
  window.addEventListener('offline', function () { serial++; if (controller) controller.abort(); unavailable('You are offline. Reconnect to see the latest figures.'); });
  window.addEventListener('online', load);
  window.addEventListener('resize', function () { if (modal && modal.open && currentData && !modal.querySelector('.wg-content').hidden) render(currentData); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') load(); });
  setInterval(function () { if (document.visibilityState !== 'hidden') load(); }, 60000);
})();
