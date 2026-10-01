import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(saved){
 let output='',warning='';
 const context={alert:text=>{warning=text},fleetNormaliseCustomer:x=>x,vectaActiveInvoices:()=>saved?[saved]:[],invoiceTotals:lines=>({subtotal:lines.reduce((s,l)=>s+Number(l.amount||0),0)}),fleetNmukIsInternalJob:j=>j.internal,fleetEomLineItems:j=>[{description:'Workshop work',price:j.price}],niceDate:x=>x,fleetEomRegistrationText:()=>'',fleetNmukTypeForJob:j=>j.nmuk_type||'',financeBaseJob:j=>j,normReg:x=>String(x||'').replace(/ /g,'').toUpperCase(),app:{jobs:[],jobCustomerMemory:{}},window:{},Blob:class{constructor(parts){output=parts.join('')}},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},setTimeout:()=>{}};
 vm.createContext(context);
 vm.runInContext(html.match(/function fleetNmukCsvTypeForJob\(job\)\{[\s\S]*?\n\}/)[0],context);
 vm.runInContext(html.slice(html.indexOf('function financeAuthoritativeNmukAllocation('),html.indexOf('function financeRawAllocationEvidence(')),context);
 vm.runInContext(html.slice(html.indexOf('var fleetNmukMonthlyDrafts={}'),html.indexOf('async function fleetEomInvoice(')),context);
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
 assert.equal(s.csv(),'');assert.match(s.warning(),/individual monthly charges/);
});
test('monthly entries use final date and their saved individual allocations',()=>{
 const extras=[{description:'Puncture repairs',amount:200,section:'internal'},{description:'Monthly work',amount:2220,section:'other'}];
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:12770,nmuk_monthly_extras:extras}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',rows);
 assert.match(s.csv(),/"2026-09-30","","Internal","Puncture repairs","200.00"/);
 assert.match(s.csv(),/"2026-09-30","","Other","Monthly work","2220.00"/);
});
test('month-end dates handle future months and leap years',()=>{
 for(const [month,end] of [['2026-10','2026-10-31'],['2027-02','2027-02-28'],['2028-02','2028-02-29']]){
  const s=setup({fleet_customer:'NMUK',fleet_month:month,lines:[{amount:10360,nmuk_monthly_extras:[{description:'Monthly work',amount:10,section:'other'}]}]});
  s.context.fleetDownloadEomCsv('NMUK',month,rows);assert.ok(s.csv().includes('"'+end+'","","Other","Monthly work","10.00"'));
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

test('new tyre charge is editable, counted under Internal and exported at month end',()=>{
 const s=setup(null),c=s.context;
 const defaults=c.fleetNmukMonthlyLines('2026-10');
 const tyres=defaults.find(x=>x.description==='Fit new tyres');
 assert.equal(tyres.amount,0);assert.equal(tyres.section,'internal');
 c.fleetNmukMonthlyDrafts['2026-10']=defaults.map(x=>x.description==='Fit new tyres'?{...x,amount:240}:x);
 const totals=c.fleetNmukMonthTotals(rows,'2026-10');
 assert.equal(totals.internal,3280);assert.equal(totals.other,8990);assert.equal(totals.total,12270);
 c.fleetDownloadEomCsv('NMUK','2026-10',rows);
 assert.match(s.csv(),/"2026-10-31","","Internal","Fit new tyres","240.00"/);
 assert.match(s.csv(),/"Total:","12270.00"/);
 assert.match(s.csv(),/"Internal Vehicles:","3280.00"/);
 assert.equal((s.csv().match(/Fit new tyres/g)||[]).length,1);
});

test('CSV uses saved MVOS subtype and job-customer memory, with Other for remaining work',()=>{
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:50,nmuk_monthly_extras:[]}]});
 s.context.app.jobCustomerMemory['remembered']={customer_account:'NMUK',nmuk_vehicle_type:'MVOS'};
 const jobs=[
 {id:'direct',registration:'OV75FNN',customer_account:'NMUK',nmuk_subtype:'MVOS'},
 {id:'remembered',registration:'OW72NMA'},
 {id:'internal',customer_account:'NMUK',nmuk_vehicle_type:'Internal'},
 {id:'pool',customer_account:'NMUK',nmuk_vehicle_type:'Pool'},
 {id:'other',customer_account:'NMUK',nmuk_vehicle_type:'Various'}
 ];
 s.context.fleetDownloadEomCsv('NMUK','2026-09',jobs.map(job=>({job:{...job,price:10},amount:10,date:'2026-09-30'})));
 assert.equal((s.csv().match(/"MVOS","Workshop work"/g)||[]).length,2);
 assert.match(s.csv(),/"Internal","Workshop work"/);
 assert.match(s.csv(),/"Pool","Workshop work"/);
 assert.match(s.csv(),/"Other","Workshop work"/);
 assert.match(s.csv(),/"Total:","50.00"/);
});
