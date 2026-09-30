import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function financeNmukInvoiceAdjustments('),html.indexOf('function invoiceFinancialSummary('));
function setup(extras=true){
 const jobs=[{id:'a',amount:2860,nmuk_vehicle_type:'Internal',completed_at:'2026-09-30'},{id:'b',amount:5685,nmuk_vehicle_type:'Pool',completed_at:'2026-09-30'},{id:'c',amount:1805,nmuk_vehicle_type:'MVOS',completed_at:'2026-09-30'}];
 const invoices=[{id:'invoice',fleet_customer:'NMUK',fleet_month:'2026-09',invoice_number:'78763',fleet_job_ids:['a','b','c'],subtotal:12770,lines:[{amount:12770,...(extras?{nmuk_monthly_extras:[{amount:200,section:'internal',description:'Puncture repairs'},{amount:2220,section:'other',description:'Other monthly charges'}]}:{})}]}];
 const ctx={financeAllJobs:()=>jobs,vectaActiveInvoices:()=>invoices,financeIsRecognisedJob:()=>true,isVehicleTaxJob:()=>false,financeInvoiceExVatValue:i=>i.subtotal,financeRevenueExVatValue:j=>j.amount,financeDailyReferenceDate:()=> '2026-09-30',iso:d=>d.toISOString().slice(0,10),financeDashboardCacheKey:()=>JSON.stringify(jobs),invoiceFinanceJobs:()=>jobs,financeLegacyAllocation:()=>({type:'NMUK'}),financeCanonicalCustomer:x=>x};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,jobs,invoices};
}
test('one shared report includes charges once and categories reconcile without changing job count',()=>{
 const {ctx}=setup();const r=ctx.financeSharedReport('month');
 assert.equal(r.total,12770);assert.equal(r.nmukTotal,12770);assert.equal(r.nmukCount,3);
 assert.equal(r.nmukTotals.Internal,3060);assert.equal(r.nmukTotals.MVOS,4025);assert.equal(r.nmukTotals.Pool,5685);
 assert.equal(ctx.financeSharedScopeTotal(r,'NMUK','Internal'),3060);
 assert.equal(ctx.financeSharedReport('month'),r);
 assert.equal(ctx.financeSharedReport('fy').total,12770);
});
test('saved invoice lacking extras reconciles without guessing allocation',()=>{
 const {ctx}=setup(false);const r=ctx.financeSharedReport('month');
 assert.equal(r.total,12770);assert.equal(r.nmukTotals.Various,2420);
 assert.equal(r.adjustments[0].description,'Saved monthly invoice adjustment');
});
test('already represented charges are not counted twice',()=>{
 const {ctx,jobs,invoices}=setup();jobs.push({id:'legacy',amount:2420,nmuk_vehicle_type:'Various'});
 invoices[0].fleet_job_ids.push('legacy');
 assert.equal(ctx.financeSharedReport('month').total,12770);
 assert.equal(ctx.financeSharedReport('month').adjustments.length,0);
});
test('cache refreshes after invoice edits and jobs changing',()=>{
 const {ctx,invoices,jobs}=setup();const first=ctx.financeSharedReport('month');
 invoices[0].subtotal=12870;const next=ctx.financeSharedReport('month');
 assert.notEqual(first,next);assert.equal(next.total,12870);
 jobs.push({id:'new',amount:100,nmuk_vehicle_type:'Pool'});
 assert.equal(ctx.financeSharedReport('month').total,12970);
});
test('draft, wrong account, missing jobs, date ranges and duplicate invoice snapshots',()=>{
 const {ctx,invoices}=setup();
 assert.equal(ctx.financeNmukInvoiceAdjustments('2026-04-01','2026-09-29').length,0);
 invoices.push({...invoices[0],id:'copy',updated_at:'2026-09-30'});
 assert.equal(ctx.financeSharedReport('month').total,12770);
 invoices.forEach(i=>i.status='draft');assert.equal(ctx.financeSharedReport('month').total,10350);
 invoices.forEach(i=>{i.status='saved';i.fleet_customer='Staff'});assert.equal(ctx.financeSharedReport('month').total,10350);
 invoices.forEach(i=>{i.fleet_customer='NMUK';i.fleet_job_ids.push('missing')});assert.equal(ctx.financeSharedReport('month').total,10350);
});
test('headline and breakdown consumers read shared data',()=>{
 const summary=html.split('\n').find(l=>l.startsWith('function invoiceFinancialSummary('));
 const report=html.split('\n').find(l=>l.startsWith('function openInvoiceFinanceReport('));
 const detail=html.split('\n').find(l=>l.startsWith('function openFinanceJobsDetail('));
 assert.match(summary,/fy:financeSharedReport\('fy'\).total/);
 assert.match(report,/nmukTotals=report.nmukTotals/);
 assert.match(detail,/financeSharedScopeTotal\(report,scope,name\)/);
 assert.match(detail,/report.adjustments.filter/);
});
