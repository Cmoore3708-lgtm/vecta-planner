import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {datasetNames,readHistoricalSource,auditHistoricalImports} from '../../scripts/audit-historical-imports.mjs';

const html=fs.readFileSync('index.html','utf8');
function importer(rows,jobs=[]){
 let saves=0;
 const context={app:{jobs},window:{CONTRACTOR_2026_JOBS:rows,CONTRACTOR_2026_NEW_VEHICLES:[]},fleetVehicles:[],fleetCompletions:[],
  normaliseContractorImportedJob:row=>({...row}),fleetVehicleForRegistration:()=>null,saveFleet(){saves++;},saveLocal(){saves++;}};
 const start=html.indexOf('function importContractor2026Spreadsheet(){'),end=html.indexOf('\nfunction fleetEnriched()',start);
 vm.runInNewContext(html.slice(start,end),context);
 return {run:context.importContractor2026Spreadsheet,jobs,saves:()=>saves};
}
function fixture(){return Object.fromEntries(datasetNames.map(name=>[name,name.endsWith('FINANCIAL_HISTORY')?{'2025':{daily:{'2025-01-01':100}}}:[]]));}

test('startup history import never overwrites saved price, instructions, completion or contact edits',()=>{
 const original={id:'legacy-1',amount_quoted:50,work_required:'Old instructions',status:'completed',completed_at:'2026-01-01',customer_phone:'old',booking_source:'Contractor spreadsheet import'};
 const edited={...original,amount_quoted:75,work_required:'Amended instructions',status:'ready_to_invoice',completed_at:null,customer_phone:'new'};
 const c=importer([original],[edited]);assert.equal(c.run(),0);assert.deepEqual(c.jobs,[edited]);assert.equal(c.saves(),0);assert.equal(edited.amount_quoted,75);
});
test('missing historical rows are imported once without mutating the source or duplicating IDs',()=>{
 const source={id:'legacy-1',amount_quoted:50};const c=importer([source,{...source,amount_quoted:99}]);
 assert.equal(c.run(),1);assert.equal(c.run(),0);assert.equal(c.jobs.length,1);assert.equal(c.jobs[0].amount_quoted,50);
 c.jobs[0].amount_quoted=60;assert.equal(source.amount_quoted,50);
});
test('retired background history sync cannot upload legacy rows',()=>{
 assert.doesNotMatch(html,/syncContractor2026SpreadsheetRemote/);
 const source=readHistoricalSource(html),report=auditHistoricalImports(source);
 assert.equal(report.sourceRecords,760);assert.equal(report.legacyIds,760);assert.equal(report.retirementReady,false);
 assert.equal(Object.keys(report.datasets).length,8);assert.ok(report.issues.length>=8);
 const baseline=JSON.parse(fs.readFileSync('tests/fixtures/historical-source-fingerprints.json','utf8'));
 for(const name of datasetNames){
  assert.equal(report.datasets[name].entries,baseline.datasets[name].entries,name+' record count changed');
  assert.equal(report.datasets[name].sha256,baseline.datasets[name].sha256,name+' historical source changed; reconcile before replacing the baseline');
 }
});
test('auditor reads JSON literals without executing page code or later assignments',()=>{
 const datasets=fixture();datasets.CONTRACTOR_2026_JOBS=[{id:'legacy-1',work_required:'A bracket ] and escaped " quote',amount_quoted:100}];
 const source=datasetNames.map(name=>'window.'+name+' = '+JSON.stringify(datasets[name])+';').join('\n')+'\nthrow Error("must never run");window.CONTRACTOR_2026_JOBS=[];';
 assert.deepEqual(readHistoricalSource(source),datasets);
 assert.throws(()=>readHistoricalSource('window.CONTRACTOR_2026_JOBS = [bad]'),/JSON|Unexpected/);
});
test('copy comparison detects changed amounts, dates, classifications, fleet or historical totals',()=>{
 const source=fixture();source.CONTRACTOR_2026_JOBS=[{id:'legacy-1',amount_quoted:100,booking_date:'2026-01-01',job_type:'Full Service'}];
 assert.equal(auditHistoricalImports(source,structuredClone(source)).protectedCopyMatches,true);
 for(const change of [copy=>{copy.CONTRACTOR_2026_JOBS[0].amount_quoted=101;},copy=>{copy.CONTRACTOR_2026_JOBS[0].booking_date='2026-01-02';},copy=>{copy.CONTRACTOR_2026_JOBS[0].job_type='Major Service';},copy=>{copy.INITIAL_FLEET_VEHICLES.push({id:'extra'});},copy=>{copy.NMUK_FINANCIAL_HISTORY['2025'].daily['2025-01-01']=101;}]){
  const copy=structuredClone(source);change(copy);const result=auditHistoricalImports(source,copy);assert.equal(result.protectedCopyMatches,false);assert.equal(result.retirementReady,false);
 }
});
test('identical copies do not falsely approve application/report reconciliation; duplicate IDs still fail',()=>{
 const source=fixture();source.CONTRACTOR_2026_JOBS=[{id:'legacy-1'},{id:'legacy-1'}];
 const result=auditHistoricalImports(source,source);assert.equal(result.protectedCopyMatches,false);assert.ok(result.issues.some(x=>x.includes('duplicate IDs')));assert.equal(result.retirementReady,false);
});
