import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function namedFunctionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('VAT calculations preserve inclusive, exclusive and no-VAT totals', () => {
  const context = { app: { settings: { vatRate: 20 } } };
  vm.runInNewContext(`${namedFunctionSource('invoiceTotals')};
    inclusive = invoiceTotals([{amount:120,vat_mode:'inc_vat'}]);
    exclusive = invoiceTotals([{amount:100,vat_mode:'ex_vat'}]);
    none = invoiceTotals([{amount:100,vat_mode:'no_vat'}]);`, context);
  assert.equal(context.inclusive.total, 120);
  assert.equal(context.inclusive.subtotal, 100);
  assert.equal(context.inclusive.vat, 20);
  assert.equal(context.exclusive.subtotal, 100);
  assert.equal(context.exclusive.vat, 20);
  assert.equal(context.exclusive.total, 120);
  assert.equal(context.none.subtotal, 100);
  assert.equal(context.none.vat, 0);
  assert.equal(context.none.total, 100);
});

test('invoice numbers come from the highest active register number', () => {
  const context = { app: { settings: { invoicePrefix: 'VECTA' }, invoices: [
    {invoice_number:'VECTA-78748'}, {invoice_number:'VECTA-78751'}, {invoice_number:'bad'}
  ] } };
  vm.runInNewContext(`${namedFunctionSource('invoiceNumericPart')};${namedFunctionSource('nextInvoiceSequence')};${namedFunctionSource('nextInvoiceNumberText')}; result=nextInvoiceNumberText();`, context);
  assert.equal(context.result, 'VECTA-78752');
});

test('ordinary invoice finalisation is cloud-confirmed before local state changes', () => {
  const save = namedFunctionSource('saveInvoiceBase');
  assert.ok(save.indexOf('await vectaSaveInvoiceRowConfirmed') < save.indexOf('app.invoices.push'), 'cloud confirmation must precede local insertion');
  assert.match(save, /same job already has invoice|second invoice cannot be created/i);
  assert.match(save, /linkedJob\.status='completed';linkedJob\.archived=true/);
  assert.match(save, /vectaWriteTerminalJobState\(linkedJob,'completed'/);
  assert.match(namedFunctionSource('vectaSaveInvoiceRowConfirmed'), /sameNumber[\s\S]*?sameJob[\s\S]*?sameTotal/);
});

test('print and email actions save first and abort when confirmation fails', () => {
  const open = namedFunctionSource('openInvoice');
  assert.match(open, /printInvoice'\)\.onclick=async function\(\)\{var savedOk=await saveInvoice\(inv\.id\);if\(savedOk===false\)return/);
  assert.match(open, /emailInvoice'\)\.onclick=async function\(\)[\s\S]*?savedOk=await saveInvoice\(inv\.id\);if\(savedOk===false\)return/);
  assert.match(open, /openInvoiceCustomerEmail\(savedInvoice\)/);
  assert.doesNotMatch(html, /openInvoiceV329Base|openInvoice\s*=\s*function\(id,preset\)/);
});

test('cancellation and restore retain completed jobs and completion dates', () => {
  const cancel = namedFunctionSource('deleteInvoiceCompletely');
  const restore = namedFunctionSource('restoreVoidInvoice');
  assert.match(cancel, /inv\.status='void'/);
  assert.match(cancel, /linkedJob\.status='completed';linkedJob\.archived=true/);
  assert.doesNotMatch(cancel, /ready_to_invoice/);
  assert.match(cancel, /if\(!linkedJob\.completed_at\)/);
  assert.match(restore, /inv\.status='saved'/);
  assert.match(restore, /job\.status='completed';job\.archived=true/);
  assert.match(restore, /if\(!job\.completed_at\)/);
});
