import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('function vectaRunDataIngressMigrations('),source=html.slice(start,html.indexOf('\nfunction calculatedPartsStatus(',start));
const names=['fleetMigrateNmukInvoiceAddress','migrateUnsafeAug25JobTombstones','fleetImportHistoricalSeed','fleetMigrateExplicitDeletedRegistrations','applyVehicleAllocationSpreadsheetCorrections','fleetMigrateCustomerAliases','migrateLegacyServiceNamesOnce','fleetRemoveTrackerCreatedNmukVehicles','fleetMigrateInternalServiceRule','migrateNmukVariousJobs'];
test('legacy upgrade order survives one failed repair without leaking into ordinary ingress',()=>{
 const calls=[],warnings=[],context={console:{warn:(...args)=>warnings.push(args)},fleetEnsureServicePlanTypes(){},fleetAlignServiceDatesToMot(){},fleetAssignPoolEmail(){},fleetMigratePreJuly2026Overdues:()=>({changed:false}),hydrateAutomaticPartsDefaults:()=>0,reconcileCompletedVehicleTaxCyclesV262:()=>false};
 for(const name of names)context[name]=()=>{calls.push(name);if(name==='migrateUnsafeAug25JobTombstones')throw Error('Damaged old device record');};
 vm.createContext(context);vm.runInContext(source,context);context.vectaRunDataIngressMigrations({reason:'local-startup',legacyStartup:true});
 assert.deepEqual(calls,names);assert.equal(warnings.length,1);assert.match(warnings[0][0],/job-tombstone cleanup skipped/);
 calls.length=0;for(const reason of ['cloud-pull','realtime-row','foreground-cloud-refresh'])context.vectaRunDataIngressMigrations({reason});assert.equal(calls.length,0);
});
