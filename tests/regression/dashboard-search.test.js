import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('dashboard search popup exists before application startup binds the search box', () => {
  const popup = '<div id="globalSearchPopup" class="globalSearchPopup" aria-hidden="true"></div>';
  const popupIndex = html.indexOf(popup);
  const mainScriptIndex = html.indexOf('<script>', html.indexOf('<body>'));
  const initIndex = html.indexOf('init();');

  assert.notEqual(popupIndex, -1, 'search popup must exist');
  assert.ok(popupIndex < mainScriptIndex, 'search popup must be parsed before the main application script runs');
  assert.ok(mainScriptIndex < initIndex, 'test must identify the startup script');
  assert.equal(html.split('id="globalSearchPopup"').length - 1, 1, 'search popup id must be unique');
});

test('dashboard search remains wired to every supported record type', () => {
  assert.match(html, /bindPlannerGlobalSearch\(\)/);
  assert.match(html, /data-core-search-vehicle/);
  assert.match(html, /data-core-search-person/);
  assert.match(html, /data-core-search-job/);
  assert.match(html, /data-core-search-invoice/);
  assert.match(html, /plannerSearchCompact\(q\)/, 'registration searches must ignore spaces');
  assert.match(html, /plannerSearchPhone\(q\)/, 'phone searches must ignore formatting');
});

test('desktop task panel leaves enough width for the Anyone planner lane', () => {
  assert.match(html, /\.plannerLayout\.v233Planner\{[^}]*grid-template-columns:minmax\(0,1fr\) 210px!important/);
  assert.match(html, /\.v233Planner \.plannerGrid\{[^}]*min-width:560px!important/);
  assert.match(html, /grid-template-columns:58px minmax\(165px,1fr\) minmax\(165px,1fr\) minmax\(140px,\.78fr\)!important/);
});
