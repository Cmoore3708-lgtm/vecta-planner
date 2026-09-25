import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('invoice archive refresh uses the paginated cloud reader', () => {
  const source = html.match(/async function refreshFinancialInvoiceListFromCloud\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(source, /vectaFetchAllRemoteRows\('invoices'\)/);
  assert.doesNotMatch(source, /\bfetchAllRows\(/);
});

test('active invoices block automatic job carry-over', () => {
  const source = html.match(/function shouldCarryOverJob\(j,today\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(source, /isJobInvoiced\(j\)/);
});
