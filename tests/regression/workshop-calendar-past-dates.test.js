import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('workshop calendar gives every past date a visible past-day class', () => {
  assert.match(html, /\(past\?'past ':''\)/);
  assert.match(html, /\.v243CalendarDay\.past\{background:#e5e7eb;/);
});

test('dashboard past dates remain selectable for historical viewing', () => {
  assert.match(html, /disabled=dashboardMode\?false:/);
  assert.match(html, /data-v243-calendar-day=/);
});
