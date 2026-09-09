import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';
import generatorModule from '@babel/generator';
import traverseModule from '@babel/traverse';

const generate = generatorModule.default || generatorModule;
const traverse = traverseModule.default || traverseModule;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);

function functionSource(name) {
  for (const script of scripts) {
    const ast = parse(script, { sourceType: 'script', errorRecovery: false });
    let found = null;
    traverse(ast, {
      FunctionDeclaration(path) {
        if (!found && path.node.id?.name === name) found = path.node;
      }
    });
    if (found) return generate(found, { compact: false }).code;
  }
  throw new Error(`Function ${name} was not found in index.html`);
}

function contextWith(names, extras = {}) {
  const context = vm.createContext({ console, Date, JSON, Math, Number, String, Array, Object, RegExp, ...extras });
  for (const name of names) vm.runInContext(functionSource(name), context);
  return context;
}

{
  let saves = 0;
  let renders = 0;
  const app = { jobs: [] };
  const context = contextWith(
    ['fleetEomNextMonth', 'fleetEomBillingMonth', 'fleetEomHoldMarker', 'fleetEomBillMonthMarker', 'fleetEomIsHeld', 'fleetEomHoldJob'],
    {
      app,
      financeCompletedDate: job => job.completed_at,
      saveLocal: () => { saves += 1; },
      render: () => { renders += 1; },
      upsertRemote: async () => [{ id: 'job-1' }],
      alert: message => { throw new Error(message); }
    }
  );

  const legacy = { id: 'job-legacy', completed_at: '2026-08-11T17:00:00Z', customer_note: '[[EOM_HOLD:2026-08]]' };
  assert.equal(context.fleetEomBillingMonth(legacy), '2026-09');
  assert.equal(context.fleetEomIsHeld(legacy, '2026-08'), true);
  assert.equal(context.fleetEomIsHeld(legacy, '2026-09'), false);

  const job = { id: 'job-1', completed_at: '2026-08-11T17:00:00Z', customer_note: 'Customer note\n[[EOM_HOLD:2026-08]]' };
  app.jobs.push(job);
  assert.equal(await context.fleetEomHoldJob(job.id, '2026-09'), true);
  assert.match(job.customer_note, /\[\[EOM_BILL_MONTH:2026-10\]\]/);
  assert.doesNotMatch(job.customer_note, /EOM_HOLD/);
  assert.equal(context.fleetEomBillingMonth(job), '2026-10');
  assert.equal(saves, 1);
  assert.equal(renders, 1);
}

{
  const app = { settings: { invoicePrefix: 'VECTA' } };
  const context = contextWith(
    ['invoiceNumericPart', 'vectaNextInvoiceNumberFromRows', 'vectaConfirmInvoiceIdentity'],
    { app }
  );
  context.vectaCloudInvoiceRows = async () => [
    { id: 'a', job_id: null, invoice_number: 'VECTA-78748' },
    { id: 'b', job_id: 'job-b', invoice_number: 'VECTA-78750' }
  ];

  const newInvoice = { id: 'new', job_id: 'job-new', invoice_number: 'VECTA-78748' };
  await context.vectaConfirmInvoiceIdentity(newInvoice, true);
  assert.equal(newInvoice.invoice_number, 'VECTA-78751');

  await assert.rejects(
    () => context.vectaConfirmInvoiceIdentity({ id: 'other', job_id: 'job-b', invoice_number: 'VECTA-78751' }, true),
    /already has invoice VECTA-78750/
  );
}

{
  let persisted = 0;
  const app = { invoices: [{ id: 'inv-1', payment_method: '', updated_at: '' }] };
  const cloudRow = { id: 'inv-1', payment_method: 'bacs', updated_at: '2026-09-09T12:00:00Z' };
  const chain = {
    update: () => chain,
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: cloudRow, error: null })
  };
  const context = contextWith(['updateInvoicePaymentMethod'], {
    app,
    navigator: { onLine: true },
    remoteClient: { from: () => chain },
    vectaWithTimeout: value => Promise.resolve(value),
    persistInvoicePaymentMethod: async () => { persisted += 1; },
    saveLocal: () => {},
    render: () => {},
    alert: message => { throw new Error(message); }
  });
  assert.equal(await context.updateInvoicePaymentMethod('inv-1', 'bacs'), true);
  assert.equal(app.invoices[0].payment_method, 'bacs');
  assert.equal(persisted, 1);
}

assert.match(html, /status==='ready_to_invoice'&&!isJobInvoiced\(j\)/);
assert.match(
  html,
  /getElementById\('printInvoice'\)\.onclick=async function\(\)\{var savedOk=await saveInvoice\(inv\.id\);if\(savedOk===false\)return;/,
  'Print / PDF must confirm the invoice save before printing'
);
assert.match(
  html,
  /var savedOk=await v187BaseSaveInvoice\(id\);\s*if\(savedOk===false\)return false;/,
  'Invoice save wrappers must propagate a failed cloud confirmation'
);
console.log('Finance integrity regression tests passed.');
