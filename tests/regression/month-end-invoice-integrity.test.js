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
