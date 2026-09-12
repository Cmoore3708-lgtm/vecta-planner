import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../../supabase/migrations/20260911124500_protect_completed_job_dates.sql', import.meta.url), 'utf8');

test('Financial exposes the permanent integrity screen', () => {
  assert.match(html, /id="financialIntegrityTab">Financial Integrity/);
  assert.match(html, /function financialIntegrityAudit\(\)/);
  assert.match(html, /function financialIntegrityHtml\(\)/);
  assert.match(html, /financialSection==='integrity'/);
});

test('integrity audit covers the core revenue failure modes', () => {
  for (const rule of [
    'Completion dates',
    'Completed job values',
    'Invoice essentials',
    'Invoice number uniqueness',
    'One invoice per job',
    'Invoice arithmetic',
    'MOT and Vehicle Tax VAT',
    'Fleet month-end coverage',
    'Duplicate completed jobs',
    'Financial allocation'
  ]) assert.ok(html.includes(rule), `missing integrity rule: ${rule}`);
  assert.match(html, /All financial checks passed/);
  assert.match(html, /system is not claiming the figures are complete/);
});

test('database safeguard rejects undated completed jobs', () => {
  assert.match(migration, /create trigger vecta_protect_completed_job_date/i);
  assert.match(migration, /raise exception 'A completed job must have a booking or completion date'/i);
  assert.match(migration, /before insert or update of status, booking_date, completed_at/i);
});

test("Today's tile uses exactly the same jobs as its drill-down", () => {
  assert.match(
    html,
    /todayTotal=invoiceFinanceJobs\('today'\)\.reduce\(function\(sum,j\)\{return sum\+financeRevenueExVatValue\(j\)\},0\)/
  );
  assert.doesNotMatch(
    html,
    /todayTotal=jobs\.filter\(function\(j\)\{return !financeIsUnallocated\(j\)&&financeDateForDailyView\(j\)===plannerDate\}/
  );
});

test('mobile startup renders before waiting for IndexedDB recovery', () => {
  const initStart = html.indexOf('function init(){safe(async function(){');
  const watchdog = html.indexOf('var vectaStartupWatchdog=setTimeout', initStart);
  const initialRender = html.indexOf('vectaSetStartupLoading(false);\n  render();', initStart);
  const backupRestore = html.indexOf('vectaWithTimeout(vectaRestoreLatestBackupIfNeeded()', initStart);
  assert.ok(initStart >= 0 && watchdog > initStart && initialRender > watchdog && backupRestore > initialRender);
  assert.doesNotMatch(html, /<body class="vectaStartupLoading">/);
  assert.match(html, /Backup storage took too long to open/);
  assert.match(html, /req\.onblocked=function\(\)\{fail\(new Error\('Backup storage is blocked by an older app window\.'\)\)\}/);
});

test('downloaded cloud jobs render without waiting for an IndexedDB backup', () => {
  assert.doesNotMatch(html, /await vectaCreateDailyBackup\(true,'cloud-synchronised'\)/);
  assert.match(html, /vectaCreateDailyBackup\(true,'cloud-synchronised'\)\.catch/);
});

test('mobile startup does not abandon cloud jobs behind a short duplicate ping', () => {
  assert.doesNotMatch(html, /var ping=await vectaWithTimeout\(remoteClient\.from\('jobs'\)/);
  assert.match(html, /vectaFetchAllRemoteRows\('jobs',25000\)/);
  assert.match(html, /vectaFetchAllRemoteRows\('tasks',25000\)/);
});

test('completed mobile startup cannot leave an invisible tap-blocking gate', () => {
  assert.match(html, /gate\.hidden=!on/);
  assert.match(html, /gate\.style\.pointerEvents=on\?'auto':'none'/);
  assert.match(html, /\},120000\);/);
});

test('mobile MOT cards show the actual MOT appointment time', () => {
  assert.match(html, /class="mobileMotAppointment">MOT /);
  assert.match(html, /hasMotJobType\(j\)&&motTimeFromJob\(j\)/);
});

test('service and safety paperwork cannot save without mileage', () => {
  const saveStart = html.indexOf('async function saveServiceSheet()');
  const saveEnd = html.indexOf('function loadSavedServiceSheet', saveStart);
  const saveFlow = html.slice(saveStart, saveEnd);
  assert.match(saveFlow, /mileageCheck=sheet\.querySelector\('\.ssMileageEntry'\)/);
  assert.match(saveFlow, /Please enter the vehicle mileage before saving the service sheet/);
  assert.ok(saveFlow.indexOf('mileageCheck=sheet.querySelector') < saveFlow.indexOf("storeServiceRecordLocal(record)"));
});

test('mobile invoice archive keeps every invoice on one compact screen-width row', () => {
  assert.match(html, /v346-mobile-mot-and-invoice-density/);
  assert.match(html, /\.invoiceArchiveRow\{grid-template-columns:60px 54px minmax\(38px,1fr\) 43px 48px 67px!important/);
  assert.match(html, /\.invoiceArchiveTable\{width:100%!important;min-width:0!important\}/);
});
