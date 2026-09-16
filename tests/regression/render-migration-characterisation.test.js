import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function namedFunctionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('automatic Parts migration changes only eligible open jobs and persists once', async () => {
  const open = { id: 'open', status: 'booked', archived: false };
  const complete = { id: 'complete', status: 'completed', archived: false };
  const archived = { id: 'archived', status: 'booked', archived: true };
  const synced = [];
  let localSaves = 0;
  const context = {
    app: { jobs: [open, complete, archived] },
    remoteClient: {},
    ensureAutomaticPartsDefaults(job) {
      job.parts_status = 'Parts to order';
      return true;
    },
    saveLocal() { localSaves += 1; },
    upsertRemote(table, job) {
      synced.push([table, job.id]);
      return Promise.resolve();
    },
    console,
  };
  vm.runInNewContext(`${namedFunctionSource('hydrateAutomaticPartsDefaults')}; result = hydrateAutomaticPartsDefaults();`, context);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(context.result, 1);
  assert.equal(open.parts_status, 'Parts to order');
  assert.equal(complete.parts_status, undefined);
  assert.equal(archived.parts_status, undefined);
  assert.equal(localSaves, 1);
  assert.deepEqual(synced, [['jobs', 'open']]);
});

test('Vehicle Tax reconciliation advances a completed cycle once and persists once', () => {
  const plan = { currentDueDate: '2026-09-01', targetMonth: 9, status: 'Active', notes: '' };
  const vehicle = { id: 'v1', registration: 'AB12 CDE', status: 'Active', taxDueDate: '2026-09-01' };
  let fleetSaves = 0;
  const context = {
    fleetVehicles: [vehicle],
    taxPlanForVehicle: () => plan,
    taxDueDateForVehicle: () => plan.currentDueDate,
    taxCompletionForCycleV262: (_vehicle, due) => due === '2026-09-01' ? { booking_date: '2026-09-02' } : null,
    fleetAddMonthsFromDue: () => '2027-09-01',
    vehicleTaxJobDate: job => job.booking_date,
    saveFleet() { fleetSaves += 1; },
    console,
  };
  vm.runInNewContext(`${namedFunctionSource('reconcileCompletedVehicleTaxCyclesV262')}; first = reconcileCompletedVehicleTaxCyclesV262(); second = reconcileCompletedVehicleTaxCyclesV262();`, context);

  assert.equal(context.first, true);
  assert.equal(context.second, false);
  assert.equal(plan.currentDueDate, '2027-09-01');
  assert.equal(vehicle.taxDueDate, '2027-09-01');
  assert.equal(fleetSaves, 1);
});

test('render-only functions cannot invoke data migrations', () => {
  for (const name of ['render', 'fleetHtml', 'fleetMaintenanceHtml', 'partsOrderingHtml', 'taxDueVehicles30']) {
    const source = name === 'taxDueVehicles30'
      ? html.slice(html.indexOf('function taxDueVehicles30('), html.indexOf('function dueTaxRowsHtml('))
      : namedFunctionSource(name);
    assert.doesNotMatch(source, /hydrateAutomaticPartsDefaults\s*\(/, `${name} must not migrate Parts data`);
    assert.doesNotMatch(source, /reconcileCompletedVehicleTaxCyclesV262\s*\(/, `${name} must not migrate Vehicle Tax data`);
    assert.doesNotMatch(source, /\bsave(?:Local|Fleet|All)\s*\(/, `${name} must not save data`);
    assert.doesNotMatch(source, /\bupsertRemote\s*\(/, `${name} must not write cloud data`);
    assert.doesNotMatch(source, /fleet(?:ApplyMaintenanceTombstones|EnsureServicePlanTypes|AlignServiceDatesToMot|AssignPoolEmail)\s*\(/, `${name} must not normalise Fleet data`);
  }
});

test('data migrations run at explicit local, cloud and realtime ingress boundaries', () => {
  assert.match(html, /loadLocal\(\);[\s\S]*?vectaRunDataIngressMigrations\(\{reason:'local-startup',legacyStartup:true,parts:true,tax:true\}\)/);
  assert.equal((html.match(/reason:'local-startup'/g) || []).length, 1, 'local startup migrations must run exactly once');
  assert.match(html, /await vectaPrimeAuthoritativeDashboard\(\);[\s\S]*?await pullFleetCloudState\(\);\s*vectaRunDataIngressMigrations\(\{reason:'authoritative-dashboard',parts:true,tax:false\}\)/);
  assert.match(html, /vectaRunDataIngressMigrations\(\{reason:'cloud-pull',parts:true,tax:true\}\)/);
  assert.match(html, /vectaRunDataIngressMigrations\(\{reason:'realtime-row',parts:true,tax:false\}\)/);
});

test('Fleet snapshot and due-list features are owned by their canonical functions', () => {
  const snapshot = namedFunctionSource('applyFleetCloudSnapshot');
  const maintenance = namedFunctionSource('fleetMaintenanceHtml');
  assert.match(snapshot, /applyFleetEmailSentSnapshot\s*\(value\)/, 'cloud snapshots must retain email-sent state');
  assert.match(maintenance, /fleetListMode==='due30'\?'due30Columns'/, 'the due-30 table must retain its compact dedicated layout');
  assert.match(maintenance, /fleetListMode==='due30'\?'<span>Booking type<\/span><span>Booked<\/span><span>Email sent<\/span>'/, 'the due-30 table must retain the requested right-side headings');
  assert.match(maintenance, /fleetShortVehicle\(v\.model\)/, 'the due-30 vehicle column must show only the first model word');
  assert.match(maintenance, /fleetWorkDueGroupCell\(group\.items\)\+fleetBookingTypeGroupCell\(group\.items\)\+fleetBookedGroupCell\(group\.items\)\+fleetEmailSentCell\(group\)/, 'work due, booking type, booked date and email audit must retain dedicated ordered columns');
  assert.doesNotMatch(html, /fleetApplyCloudSnapshotBase|fleetMaintenanceHtmlV330Base/, 'Fleet behavior must not be installed through base-function wrappers');
});

test('On-Site Service rules are owned by the canonical gather and save paths', () => {
  assert.match(namedFunctionSource('gatherJob'), /v310Canonicalise\s*\(j\)/);
  assert.match(namedFunctionSource('saveJob'), /v310DuplicateFor\s*\(j,id\)/);
  assert.doesNotMatch(html, /v310OldGather|v310OldSaveJob|__v310Canonical|__v310NoDuplicates/);
});

test('legacy startup migrations run only after local data has loaded', () => {
  const coordinator = namedFunctionSource('vectaRunDataIngressMigrations');
  for (const name of [
    'fleetMigrateNmukInvoiceAddress',
    'migrateUnsafeAug25JobTombstones',
    'fleetImportHistoricalSeed',
    'fleetMigrateExplicitDeletedRegistrations',
    'applyVehicleAllocationSpreadsheetCorrections',
    'fleetMigrateCustomerAliases',
    'migrateLegacyServiceNamesOnce',
    'fleetRemoveTrackerCreatedNmukVehicles',
    'fleetMigratePreJuly2026Overdues',
    'fleetAlignServiceDatesToMot',
    'fleetMigrateInternalServiceRule',
    'migrateNmukVariousJobs',
  ]) {
    assert.match(coordinator, new RegExp(`${name}\\s*\\(`), `${name} must be owned by the ingress coordinator`);
    assert.doesNotMatch(html, new RegExp(`^${name}\\(\\);`, 'm'), `${name} must not run during script evaluation`);
  }
  assert.doesNotMatch(namedFunctionSource('migrateNmukVariousJobs'), /\bsave\s*\(/, 'NMUK migration must use the canonical local save');
  assert.match(namedFunctionSource('migrateNmukVariousJobs'), /\bsaveLocal\s*\(/);
  assert.doesNotMatch(html, /^fleetEnsureServicePlanTypes\(\);fleetAssignPoolEmail\(\);/m, 'Fleet normalisation must not run during script evaluation');
  assert.match(namedFunctionSource('fleetMigrateCustomerAliases'), /fleetWpcProfileChanged/);
  assert.doesNotMatch(html, /^try\{localStorage\.removeItem\(VECTA_DELETED_JOB_IDS_KEY\)/m, 'job tombstones must not be erased during script evaluation');
  assert.match(namedFunctionSource('migrateUnsafeAug25JobTombstones'), /unsafe-job-tombstones-cleared:v355/);
});
