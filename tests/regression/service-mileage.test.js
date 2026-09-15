import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('js/vecta-app.js', 'utf8');

test('a new service sheet never inherits job or MOT mileage', () => {
  assert.match(app, /class="editable ssMileageEntry" contenteditable="true"><\/span>/);
  assert.doesNotMatch(app, /class="editable ssMileageEntry" contenteditable="true">'\+esc\(j\.mileage\|\|''\)/);
});

test('saving requires a manually entered numeric current mileage', () => {
  assert.match(app, /function normaliseServiceMileage\(value\)/);
  assert.ok(app.includes("/^\\d{1,7}$/.test(mileage)"));
  assert.match(app, /Please enter the current vehicle mileage as numbers only before continuing\./);
  assert.match(app, /var mileageValue=requireServiceSheetMileage\(\);if\(!mileageValue\)return/);
  assert.match(app, /mileage:mileageValue/);
});

test('closing service paperwork enforces mileage before the stamp question', () => {
  assert.match(app, /function closeServicePreviewPrompt\(\)\{if\(!requireServiceSheetMileage\(\)\)return;if\(activeServiceKind==='service'&&!confirm\('Has the Service book been stamped\?'\)\)return;/);
});

test('service-book completion prompt uses selected job types, never work notes', () => {
  const start = app.indexOf('function isRoadGoingServiceJob(j)');
  const end = app.indexOf('function confirmServiceBookStampedBeforeComplete(j)', start);
  const implementation = app.slice(start, end);
  assert.match(implementation, /jobTypeValues\(j\)\.join\(' '\)/);
  assert.doesNotMatch(implementation, /work_required/);
});

test('previously saved service sheets retain their saved mileage', () => {
  assert.match(app, /document\.getElementById\('printSheet'\)\.innerHTML=upgradeSavedServiceSheet\(record\.html/);
  assert.match(app, /if\(await openLatestServiceSheet\(activeServiceRegistration,j,null,kind\)\)return/);
});
