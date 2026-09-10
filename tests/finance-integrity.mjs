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

{
  const jobs = [
    { id: 'service-newer', registration: 'AXLE1', booking_date: '2026-09-04', completed_at: '2026-09-04T11:00:00Z', status: 'completed', job_type: 'On-Site Service' },
    { id: 'service-backdated', registration: 'AXLE 1', booking_date: '2026-09-01', completed_at: '2026-09-09T14:30:00Z', status: 'completed', job_type: 'On-Site Service' }
  ];
  const fleetPlans = [{ id: 'plan-124', vehicleId: 'INTERNAL|AXLE1', type: 'Internal Service', currentDueDate: '', targetMonth: 9, status: 'Active' }];
  const fleetVehicles = [{ id: 'INTERNAL|AXLE1', registration: 'AXLE 1', fleetGroup: 'Nissan Internal' }];
  const context = vm.createContext({
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    app: { jobs }, fleetPlans, fleetVehicles, fleetCompletions: []
  });
  context.window = context;
  context.v310Norm = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  context.v310Iso = value => String(value || '').slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || '';
  context.v310AddMonths = (value, months) => {
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
  };
  context.v310IsInternalOnsite = job => /on-site service/i.test(job.job_type);
  context.v310Deleted = () => false;
  context.v310FleetVehicle = registration => fleetVehicles.find(vehicle => context.v310Norm(vehicle.registration) === context.v310Norm(registration));
  vm.runInContext(functionSource('v310RepairInternalServicePlans'), context);

  assert.equal(context.v310RepairInternalServicePlans(), 3);
  assert.equal(fleetPlans[0].currentDueDate, '2027-09-04');
  assert.equal(fleetPlans[0].targetMonth, 9);
  assert.equal(context.fleetCompletions.length, 2);
  assert.deepEqual(
    Array.from(context.fleetCompletions, completion => completion.completedDate).sort(),
    ['2026-09-01', '2026-09-04']
  );

  fleetPlans[0].currentDueDate = '2027-10-01';
  context.v310RepairInternalServicePlans();
  assert.equal(fleetPlans[0].currentDueDate, '2027-10-01', 'a later manually scheduled service date must not be pulled backwards');
}

{
  const context = contextWith(['vectaInvoiceIsActive', 'vectaActiveInvoices'], {
    window: { VectaInvoiceRules: { isActive: () => true } },
    app: { invoices: [
      { id: 'local-copy', invoice_number: 'VECTA-78751', status: 'saved', updated_at: '2026-09-10T08:43:51Z' },
      { id: 'cloud-copy', invoice_number: 'vecta-78751', status: 'saved', updated_at: '2026-09-10T08:43:52Z' }
    ] }
  });
  const rows = context.vectaActiveInvoices();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'cloud-copy');
}

{
  const context = contextWith(['invoiceUsesNmukSender', 'invoiceSenderHtml'], {
    fleetNormaliseCustomer: value => String(value || '').trim().toUpperCase(),
    BRAND_LOGO_SRC: 'logo.png', app: { settings: { businessName: 'VECTA' } },
    esc: value => String(value || '')
  });
  const nmuk = context.invoiceSenderHtml({ customer_name: 'NMUK' }, true);
  assert.match(nmuk, /10 Hunter Close/);
  assert.match(nmuk, /shirken\.moore@talktalk\.net/);
  assert.doesNotMatch(context.invoiceSenderHtml({ customer_name: 'Retail customer' }, true), /10 Hunter Close/);
}

{
  const app = {
    jobs: [{ id: 'job-email', customer_email: 'customer@example.com', customer_name: 'Jane Smith' }],
    customers: []
  };
  const window = { location: { href: '' } };
  const context = contextWith(
    ['invoiceEmailRecipient', 'openInvoiceCustomerEmail'],
    {
      app,
      window,
      fleetEomCustomerEmail: () => '',
      fleetInvoiceFormatRegistration: value => String(value || '').toUpperCase(),
      appendVectaEmailSignature: body => `${body}\n\nVECTA Motors`,
      alert: message => { throw new Error(message); }
    }
  );
  const invoice = { job_id: 'job-email', customer_name: 'Jane Smith', vehicle: 'Nissan Juke', registration: 'AB12 CDE' };
  assert.equal(context.openInvoiceCustomerEmail(invoice), true);
  assert.match(window.location.href, /^mailto:customer%40example\.com\?/);
  assert.match(decodeURIComponent(window.location.href), /subject=Invoice for Nissan Juke · AB12 CDE/);
  assert.match(decodeURIComponent(window.location.href), /Dear Jane Smith,/);
  assert.match(decodeURIComponent(window.location.href), /We will send a payment link to your phone shortly\./);
}

assert.match(html, /status==='ready_to_invoice'&&!isJobInvoiced\(j\)/);
assert.match(
  html,
  /getElementById\('printInvoice'\)\.onclick=async function\(\)\{var savedOk=await saveInvoice\(inv\.id\);if\(savedOk===false\)return;/,
  'Print / PDF must confirm the invoice save before printing'
);
assert.match(
  html,
  /if\(savedInvoice\)\{printInvoice\(savedInvoice\);financialSection='main';view='planner';render\(\)\}/,
  'Printing an invoice must close the invoice workflow and return to the dashboard'
);
assert.match(html, /id="emailInvoice">Email to Customer<\/button>/);
assert.match(
  html,
  /getElementById\('emailInvoice'\)\.onclick=async function\(\).*var savedOk=await saveInvoice\(inv\.id\).*view='planner';render\(\);openInvoiceCustomerEmail\(savedInvoice\)/s,
  'Email to Customer must save, close and return to the dashboard before opening the email'
);
assert.match(
  html,
  /var savedSuccessfully=await saveInvoiceBase\(id\);\s*if\(savedSuccessfully===false\)return false;/,
  'Invoice save wrappers must propagate a failed cloud confirmation'
);
assert.match(html, /<span>Email sent<\/span><span>Work due<\/span>/, '30-day Fleet view must keep separate Email sent and Work due columns');
assert.match(html, /fleetEmailSentCell\(group\)\+fleetDueGroupCell\(group\.items\)/, '30-day rows must show both the checkbox and due work');
assert.doesNotMatch(html, /\(checked\?'Sent':'Not sent'\)/, 'Email sent column must not display Sent / Not sent wording');
console.log('Finance integrity regression tests passed.');
