import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function financeWithReadCache('),html.indexOf('\nfunction fleetEomHtml(){',html.indexOf('function financeWithReadCache(')));
function fixture(){
  const names=['financeEffectiveJob','financeLegacyAllocation','financeAuthoritativeNmukAllocation','financeSavedInvoiceForJob','fleetCustomerForJob','fleetEomJobs','financeAllJobs','financeCompletedDate','financeRevenueExVatValue','financeDashboardCacheKey'];
  const counts={},originals={};
  for(const name of names){counts[name]=0;originals[name]=key=>{counts[name]++;return typeof key==='object'?key.value:key;};}
  const context=vm.createContext({...originals});vm.runInContext(source,context);
  return {context,counts,originals};
}
test('month-end repeated reads run once per key and fresh renders see edits',()=>{
  const {context:c,counts,originals}=fixture(),job={value:120};
  c.financeWithReadCache(()=>{
    for(let i=0;i<50;i++)for(const name of Object.keys(originals))assert.equal(c[name](job),120);
    const corrected={value:95};assert.equal(c.financeEffectiveJob(corrected),95);
    assert.equal(c.fleetEomJobs('2026-10'),'2026-10');assert.equal(c.fleetEomJobs('2026-11'),'2026-11');
  });
  for(const name of Object.keys(originals)){assert.equal(c[name],originals[name]);assert.equal(counts[name],name==='financeEffectiveJob'?2:name==='fleetEomJobs'?3:1);}
  job.value=240;
  c.financeWithReadCache(()=>assert.equal(c.financeSavedInvoiceForJob(job),240));
});
test('failed and nested month-end builds restore all financial resolvers',()=>{
  const {context:c,originals}=fixture();
  assert.throws(()=>c.financeWithReadCache(()=>{
    const outer=c.financeEffectiveJob;
    c.financeWithReadCache(()=>assert.equal(c.financeEffectiveJob({value:5}),5));
    assert.equal(c.financeEffectiveJob,outer);throw Error('render failure');
  }),/render failure/);
  for(const name of Object.keys(originals))assert.equal(c[name],originals[name]);
});
test('Financial shared reports retain identical totals while reusing reads across periods',()=>{
  const {context:c}=fixture();
  const jobs=Array.from({length:200},(_,i)=>({id:String(i),amount:i+1,completed_at:'2026-11-04'}));
  let keyReads=0,revenueReads=0,jobReads=0;
  Object.assign(c,{
    financeAllJobs:()=>{jobReads++;return jobs;},
    financeDashboardCacheKey:()=>{keyReads++;return JSON.stringify(jobs);},
    financeLegacyAllocation:()=>({type:'Staff'}),
    financeRevenueExVatValue:j=>{revenueReads++;return j.amount;},
    financeCompletedDate:j=>j.completed_at,
    financeDailyReferenceDate:()=> '2026-11-04',
    financeIsRecognisedJob:()=>true,
    isVehicleTaxJob:()=>false,
    financeInvoiceExVatValue:i=>i.subtotal,
    vectaActiveInvoices:()=>[],
    invoiceFinanceJobs:()=>c.financeAllJobs(),
    financeCanonicalCustomer:x=>x,
    iso:d=>d.toISOString().slice(0,10)
  });
  vm.runInContext(html.slice(html.indexOf('function financeNmukInvoiceAdjustments('),html.indexOf('function invoiceFinancialSummary(')),c);
  const periods=['today','week','month','fy','future','range:2026-01-01:2026-12-31'];
  const render=()=>JSON.stringify(periods.map(p=>c.financeSharedReport(p)));
  const baseline=render();
  c.financeSharedReports={key:'',reports:{}};keyReads=0;revenueReads=0;jobReads=0;
  assert.equal(c.financeWithReadCache(render),baseline);
  assert.equal(keyReads,1,'serialize the cache signature once per render');
  assert.equal(jobReads,1,'collect effective jobs once across all reporting periods');
  assert.equal(revenueReads,jobs.length,'value each job once across all reporting periods');
  jobs[0].amount=500;
  const updated=c.financeWithReadCache(()=>c.financeSharedReport('month'));
  assert.equal(updated.total,20599,'the next render sees edited job values');
});
