import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../../service-worker.js',import.meta.url),'utf8');
const publicWorker=fs.readFileSync(new URL('../../public/service-worker.js',import.meta.url),'utf8');
const vercel=fs.readFileSync(new URL('../../vercel.json',import.meta.url),'utf8');

function hasAll(source,patterns){
  for(const pattern of patterns)assert.match(source,pattern);
}

test('primary navigation retains every production workspace',()=>{
  hasAll(html,[
    /\['planner','Dashboard'\]/,
    /\['fleet','Fleet Manager'\]/,
    /\['jobs','Jobs'\]/,
    /\['invoices','Financial'\]/,
    /\['invoiceArchive','Invoices/,
    /\['websiteRequests','Website Bookings/,
    /\['parts','Parts/,
    /\['settings','Settings'\]/
  ]);
});

test('planner retains its operational controls',()=>{
  hasAll(html,[
    /id="prevDay"/,
    /id="nextDay"/,
    /id="todayBtn"/,
    /id="newJobTop"/,
    /id="newTaskTop"/,
    /id="printBtn"/,
    /function bindDrag\(/,
    /function bindResize\(/,
    /function bindLane\(/,
    /function bindUnallocatedDrop\(/,
    /function bindTaskReturnDrop\(/
  ]);
});

test('jobs retain lifecycle, search and recovery views',()=>{
  hasAll(html,[
    /Today's Jobs/,
    /All Open Jobs/,
    /Ready to Invoice/,
    /Completed Jobs/,
    /Admin Jobs/,
    /Deleted Jobs/,
    /function saveJob\(/,
    /function deleteJobCompletely\(/,
    /function restoreSoftDeletedJob\(/
  ]);
});

test('Fleet retains all four maintenance domains and month-end invoicing',()=>{
  hasAll(html,[
    /MOTs due within 30 days/,
    /Tax due within 30 days/,
    /Services due within 30 days/,
    /Six-month safety checks due within 30 days/,
    /function fleetEomHtml\(/,
    /function fleetPrintCurrentView\(/,
    /function fleetAddVehicleModal\(/
  ]);
});

test('Financial and invoices retain integrity and payment controls',()=>{
  hasAll(html,[
    /function invoiceFinancialSummary\(/,
    /function financialIntegrityAudit\(/,
    /function openInvoiceFinanceReport\(/,
    /function openInvoiceForJob\(/,
    /function updateInvoicePaymentMethod\(/,
    /function deleteInvoiceCompletely\(/,
    /function restoreVoidInvoice\(/
  ]);
});

test('website bookings, parts and service paperwork remain present',()=>{
  hasAll(html,[
    /function createJobFromWebsiteRequest\(/,
    /function deleteWebsiteRequestCompletely\(/,
    /function partsOrderingHtml\(/,
    /function updatePartState\(/,
    /function saveServiceSheet\(/,
    /function openLatestServiceSheet\(/,
    /function printWhenImagesReady\(/
  ]);
});

test('offline safety mechanisms remain present',()=>{
  hasAll(html,[
    /VECTA_PENDING_SYNC_KEY/,
    /VECTA_SYNC_QUARANTINE_KEY/,
    /function flushPendingSync\(/,
    /function vectaCreateDailyBackup\(/,
    /function vectaRestoreLatestBackupIfNeeded\(/,
    /function vectaWriteTerminalJobState\(/
  ]);
});

test('service-worker source copies are identical',()=>{
  assert.equal(publicWorker,worker);
  assert.equal((html.match(/serviceWorker\.register\(/g)||[]).length,1);
  assert.equal((html.match(/addEventListener\('online'/g)||[]).length,1);
});

test('deployment retains booking route, London region and nightly Fleet refresh',()=>{
  const config=JSON.parse(vercel);
  assert.deepEqual(config.regions,['lhr1']);
  assert.ok(config.rewrites.some(row=>row.source==='/booking'&&row.destination==='/booking.html'));
  assert.ok(config.crons.some(row=>row.path==='/api/fleet-nightly-refresh'&&row.schedule==='30 22 * * *'));
});
