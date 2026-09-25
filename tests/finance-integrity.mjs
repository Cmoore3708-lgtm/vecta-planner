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
assert.match(
  html,
  /if\(table==='invoices'\)[\s\S]*?data\.mot_due=null;[\s\S]*?data\.invoice_date=todayIso\(\);/,
  'Invoice saves must convert a blank optional MOT date to NULL and repair a blank invoice date'
);
assert.match(
  html,
  /if\(!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(String\(inv\.invoice_date\|\|''\)\)\)inv\.invoice_date=todayIso\(\);/,
  'The invoice editor must never submit an empty or malformed invoice date'
);
assert.match(html, /dueHeading=fleetListMode==='due30'\?'Work due'/, '30-day Fleet view must move Work due to the left');
assert.match(html, /fleetListMode==='due30'\?'<span>Booking type<\/span><span>✓<\/span><span>Booked<\/span><span>Email sent<\/span>':''/, '30-day Fleet view must keep separate Booking type, booked tick, Booked and Email sent columns');
assert.match(html, /fleetWorkDueGroupCell\(group\.items\)\+fleetBookingTypeGroupCell\(group\.items\)\+fleetBookedTickGroupCell\(group\.items\)\+fleetBookedGroupCell\(group\.items,v\)\+fleetEmailSentCell\(group\)/, '30-day rows must show Work due, booking type, booked tick, booked date and email audit in order');
assert.doesNotMatch(html, /\(checked\?'Sent':'Not sent'\)/, 'Email sent column must not display Sent / Not sent wording');

{
  // Removing a priced line must require an explicit decision before the job can save.
  const oldNote = '[[VECTA_PRIVATE_PRICING:' + encodeURIComponent(JSON.stringify([
    { description: 'Safety check', price: 90 },
    { description: 'Brake pads', price: 70 },
    { description: 'Brake caliper', price: 120 }
  ])) + ']]';
  const reducedNote = '[[VECTA_PRIVATE_PRICING:' + encodeURIComponent(JSON.stringify([
    { description: 'Safety check', price: 90 },
    { description: 'Brake pads', price: 70 }
  ])) + ']]';
  const original = { id: 'price-job', customer_note: oldNote, amount_quoted: 280, status: 'booked' };
  const app = { jobs: [original] };
  let prompted = 0;
  const context = contextWith(['privatePricingItemsFromNote', 'saveJob'], {
    app,
    window: {},
    document: { getElementById: () => null },
    gatherJob: () => Object.assign(original, { customer_note: reducedNote, amount_quoted: 160 }),
    confirm: () => { prompted += 1; return false; },
    alert: () => {}
  });
  assert.equal(await context.saveJob('price-job'), false);
  assert.equal(prompted, 1);
  assert.equal(original.amount_quoted, 280);
  assert.equal(original.customer_note, oldNote);
}

{
  // A cloud read-back with fewer priced items must not count as a successful save.
  const job = { id: 'price-job', status: 'booked', technician: 'Alfie', booking_date: '2026-09-25', amount_quoted: 280, customer_note: 'three priced lines' };
  const chain = { select: () => chain, eq: () => chain, single: async () => ({ data: { ...job, customer_note: 'two priced lines' }, error: null }) };
  const context = contextWith(['syncSavedJobBundleInBackground'], {
    remoteClient: { from: () => chain },
    navigator: { onLine: true },
    window: {},
    upsertRemote: async () => [{ id: job.id }],
    vectaWithTimeout: value => value,
    rememberJobCustomer: async () => {},
    vectaJobHasFinancialValue: () => true,
    vectaProtectJobSnapshot: async () => true,
    persistMainSettings: async () => true,
    updateConnectivityUI: () => {},
    setTimeout: () => {}
  });
  assert.equal(await context.syncSavedJobBundleInBackground(job, null, { updated_at: '' }), false);
}

{
  // Completed cards whose planner date was cleared must retain the cloud completion date.
  const job = { id: 'completed-job', status: 'completed', technician: 'Unallocated', booking_date: null, completed_at: null, amount_quoted: 820, customer_note: 'price' };
  const app = { jobs: [{ ...job }] };
  let wrote = null, saves = 0;
  let reads = 0;
  const chain = { select: () => chain, eq: () => chain, single: async () => {
    reads += 1;
    return reads === 1
      ? { data: { completed_at: '2026-09-15T15:54:54.734Z', booking_date: null }, error: null }
      : { data: { ...job, completed_at: '2026-09-15T15:54:54.734Z' }, error: null };
  } };
  const context = contextWith(['syncSavedJobBundleInBackground'], {
    app, remoteClient: { from: () => chain }, navigator: { onLine: true }, window: {},
    upsertRemote: async (table, row) => { if (table === 'jobs') wrote = { ...row }; return [{ id: row.id }]; },
    vectaWithTimeout: value => value, vectaGuardJobUpsert: async () => ({ allow: true }), vectaWriteTerminalJobState: async () => true,
    vectaProtectJobSnapshot: async () => true, vectaJobHasFinancialValue: () => true,
    rememberJobCustomer: async () => {}, persistMainSettings: async () => true,
    updateConnectivityUI: () => {}, saveLocal: () => { saves += 1; }, setTimeout: () => {}
  });
  assert.equal(await context.syncSavedJobBundleInBackground(job, null, { updated_at: '' }), true);
  assert.equal(wrote.completed_at, '2026-09-15T15:54:54.734Z');
  assert.equal(app.jobs[0].completed_at, wrote.completed_at);
  assert.equal(saves, 1);
}

{
  // A timestamp-only cloud write must not block a deliberate edit, but a changed price must.
  const old = { id: 'valid-uuid', updated_at: '2026-09-25T12:00:00Z', registration: 'AB12CDE',
    status: 'booked', booking_date: '2026-09-25', drop_time: '08:00', amount_quoted: 90,
    customer_note: 'priced line', work_required: 'Service' };
  const remote = { ...old, updated_at: '2026-09-25T12:05:00Z', drop_time: '08:00:00' };
  const chain = { select: () => chain, eq: () => chain, limit: async () => ({ data: [remote], error: null }) };
  let adopted = 0;
  const context = contextWith(['vectaGuardJobUpsert'], {
    remoteClient: { from: () => chain }, isUuid: () => true, fromRemote: x => x,
    jobCompletionEvidence: () => false, vectaJobHasFinancialValue: () => true,
    vectaUndoStamp: () => 0, vectaAdoptRemoteJob: () => { adopted += 1; }
  });
  const edited = { ...old, updated_at: '2026-09-25T12:06:00Z', work_required: 'Service and check brakes' };
  assert.equal((await context.vectaGuardJobUpsert(edited, { expectedRemoteUpdatedAt: old.updated_at, expectedRemoteRow: old })).allow, true);
  remote.amount_quoted = 120;
  assert.equal((await context.vectaGuardJobUpsert(edited, { expectedRemoteUpdatedAt: old.updated_at, expectedRemoteRow: old })).allow, false);
  assert.equal(adopted, 1);
}

{
  // A real work-complete marker wins over a synthetic future planner completion date.
  const context = contextWith(['vectaAlignActualCompletion', 'financeCompletedDate'], {
    vectaWorkCompletedAt: () => '2026-09-25T13:54:20.561Z',
    vectaCompletionStampIsSynthetic: value => String(value).includes('17:00:00'),
    financeIsRecognisedJob: () => true
  });
  const job = { status: 'completed', completed_at: '2026-09-30T17:00:00.000Z', booking_date: '2026-09-30' };
  assert.equal(context.financeCompletedDate(job), '2026-09-25');
  context.vectaAlignActualCompletion(job);
  assert.equal(job.completed_at, '2026-09-25T13:54:20.561Z');
}

assert.ok(html.includes('completionPreflight=await vectaGuardJobUpsert') && html.indexOf('completionPreflight=await vectaGuardJobUpsert') < html.indexOf("await vectaWriteTerminalJobState(j,'completed'"), 'completion conflicts must stop before the durable completion ledger is written');

console.log('Finance integrity regression tests passed.');
