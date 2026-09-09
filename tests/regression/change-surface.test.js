import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('index.html'), 'utf8');

test('job and invoice lifecycle rules load from canonical rule files', () => {
  assert.match(source, /<script src="\/js\/vecta-job-rules\.js"><\/script>/);
  assert.match(source, /<script src="\/js\/vecta-invoice-rules\.js"><\/script>/);
  assert.match(source, /function vectaInvoiceIsVoid\(inv\)\{return window\.VectaInvoiceRules\.isVoid\(inv\)\}/);
  assert.match(source, /function vectaInvoiceCanRestore\(inv\)\{return window\.VectaInvoiceRules\.canRestore\(inv\)\}/);
});

test('critical lifecycle entry points each have one named definition', () => {
  const names = [
    'pullRemote',
    'upsertRemote',
    'deleteRemote',
    'deleteJobCompletely',
    'deleteInvoiceCompletely',
    'restoreVoidInvoice',
    'createJobFromWebsiteRequest',
    'deleteWebsiteRequestCompletely',
    'fleetRemoveVehicleCompletely'
  ];
  for (const name of names) {
    const matches = source.match(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g')) || [];
    assert.equal(matches.length, 1, `${name} must have one canonical definition`);
  }
});

test('no new hidden replacements are added to the current legacy extension surface', () => {
  const replacements = [...source.matchAll(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?function\s*\(/gm)]
    .map(match => match[1])
    .sort();
  assert.deepEqual(replacements, ['fleetBind', 'fleetEomHtml', 'openVehicleRecord', 'saveInvoice']);
});
