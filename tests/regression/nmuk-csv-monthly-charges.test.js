import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(saved){
 let output='',warning='';
 const context={alert:text=>{warning=text},fleetNormaliseCustomer:x=>x,vectaActiveInvoices:()=>saved?[saved]:[],invoiceTotals:lines=>({subtotal:lines.reduce((s,l)=>s+Number(l.amount||0),0)}),fleetNmukMonthlyLines:()=>[],fleetNmukIsInternalJob:j=>j.internal,fleetEomLineItems:j=>[{description:'Workshop work',price:j.price}],niceDate:x=>x,fleetEomRegistrationText:()=>'',fleetNmukTypeForJob:()=>'',Blob:class{constructor(parts){output=parts.join('')}},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},setTimeout:()=>{}};
 vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function fleetNmukEomExportReport('),html.indexOf('function fleetEomPreviewInvoice(')),context);
 vm.runInContext(html.slice(html.indexOf('function fleetEomCustomerTotal('),html.indexOf('function fleetEomBaseHtml(')),context);
 return {context,csv:()=>output,warning:()=>warning};
}
const rows=[{job:{id:'1',internal:true,price:3040},amount:3040,date:'2026-09-01'},{job:{id:'2',price:7310},amount:7310,date:'2026-09-02'}];
test('CSV includes saved monthly charges once with correct Internal/MVOS totals',()=>{
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-09',fleet_job_ids:['1','2'],lines:[{amount:12770,nmuk_monthly_extras:[{description:'Puncture repairs',amount:200,section:'internal'},{description:'Monthly work',amount:2220,section:'other'}]}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',rows);
 assert.match(s.csv(),/"Puncture repairs","200.00"/);
 assert.match(s.csv(),/"Monthly work","2220.00"/);
 assert.match(s.csv(),/"Total:","12770.00"/);
 assert.match(s.csv(),/"Internal Vehicles:","3240.00"/);
 assert.match(s.csv(),/"MVOS and other work:","9530.00"/);
 assert.doesNotMatch(s.csv(),/allocation not recorded/);
});
test('legacy invoice without original breakdown blocks an invented single charge',()=>{
 const s=setup({invoice_number:'78763',fleet_customer:'NMUK',fleet_month:'2026-09',fleet_job_ids:['1','2'],lines:[{amount:12770}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',rows);
 assert.equal(s.csv(),'');assert.match(s.warning(),/six individual charges/);
});
test('monthly entries use final date and their saved individual allocations',()=>{
 const extras=[{description:'Puncture repairs',amount:200,section:'internal'},{description:'Monthly work',amount:2220,section:'other'}];
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:12770,nmuk_monthly_extras:extras}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',rows);
 assert.match(s.csv(),/"2026-09-30","","Internal","Puncture repairs","200.00"/);
 assert.match(s.csv(),/"2026-09-30","","MVOS and other work","Monthly work","2220.00"/);
});
test('month-end dates handle future months and leap years',()=>{
 for(const [month,end] of [['2026-10','2026-10-31'],['2027-02','2027-02-28'],['2028-02','2028-02-29']]){
  const s=setup({fleet_customer:'NMUK',fleet_month:month,lines:[{amount:10360,nmuk_monthly_extras:[{description:'Monthly work',amount:10,section:'other'}]}]});
  s.context.fleetDownloadEomCsv('NMUK',month,rows);assert.ok(s.csv().includes('"'+end+'","","MVOS and other work","Monthly work","10.00"'));
 }
});
test('export does not fabricate charges for a saved invoice with explicitly empty extras',()=>{
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:10350,nmuk_monthly_extras:[]}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',rows);
 assert.match(s.csv(),/"Total:","10350.00"/);assert.doesNotMatch(s.csv(),/adjustment|allocation not recorded/);
});
test('contractor export retains its job-only total',()=>{
 const s=setup(null);s.context.fleetDownloadEomCsv('E4','2026-09',rows);
 assert.match(s.csv(),/"Total:","10350.00"/);assert.doesNotMatch(s.csv(),/Internal Vehicles|Monthly charges/);
});
