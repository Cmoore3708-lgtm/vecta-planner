import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function functionSource(name) {
  const start = html.indexOf(`${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('month-end invoices use the same confirmed cloud register as ordinary invoices', () => {
  const create = functionSource('fleetEomInvoice');
  const approve = functionSource('fleetEomConfirmFinalise');
  assert.match(html, /async function fleetEomInvoice\(/);
  assert.match(create, /await vectaSaveInvoiceRowConfirmed\(inv,isNew\)/);
  assert.doesNotMatch(create, /upsertRemote\('invoices'/);
  assert.ok(create.indexOf('await vectaSaveInvoiceRowConfirmed') < create.indexOf('app.invoices.push'), 'local invoice state must change only after cloud confirmation');
  assert.match(approve, /await fleetEomInvoice\(name,month,rows\)/);
  assert.match(approve, /has NOT been created/);
});


test('NMUK editable monthly charges replace legacy no-vehicle tracker summary rows', () => {
  const legacyFilter = functionSource('fleetEomLegacyMonthlyCharge');
  const eomJobs = functionSource('fleetEomJobs');
  assert.match(legacyFilter, /nmuk monthly tracker import/);
  assert.match(legacyFilter, /TRANSFER JOB SHEETS TO MONTHLY TRACKER/);
  assert.match(legacyFilter, /FLEET MAINTENANCE/);
  assert.match(legacyFilter, /WASH\\\/HOVER\\\/SAFETY CHECK/);
  assert.match(legacyFilter, /PRE MOT CHECK/);
  assert.match(legacyFilter, /PUNCTURE/);
  assert.match(legacyFilter, /FLAT BATTERY/);
  assert.match(eomJobs, /fleetEomLegacyMonthlyCharge/);
  assert.match(html, /function fleetNmukMonthlyLines\(month\)/);
});


test('NMUK monthly charges roll into invoice summary while spreadsheet keeps allocation', () => {
  const defaults = functionSource('fleetNmukMonthlyDefaults');
  const create = functionSource('fleetEomInvoice');
  const csv = functionSource('fleetDownloadEomCsv');
  assert.match(defaults, /Puncture repairs',amount:0,section:'internal'/);
  assert.match(defaults, /Flat battery',amount:0,section:'other'/);
  assert.match(create, /nmuk_monthly_extras:monthlyLines/);
  assert.match(create, /nmukTotal\+monthlyTotal/);
  assert.doesNotMatch(create, /\.concat\(monthlyLines\)/);
  const report = functionSource('fleetNmukEomExportReport');
  assert.match(csv, /fleetNmukEomExportReport\(month,rows\)/);
  assert.match(report, /nmuk_monthly_extras/);
  assert.match(report, /line\.section==='internal'/);
  assert.match(report, /other\+=Number\(line\.amount\|\|0\)/);
  assert.match(report, /fleetEomCustomerTotal\('NMUK',month,rows\)/);
});
