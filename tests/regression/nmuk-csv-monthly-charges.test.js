import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(saved,today='2029-01-01'){
 if(saved&&saved.fleet_job_snapshot===undefined)saved.fleet_job_snapshot={version:1,rows:JSON.parse(JSON.stringify(rows))};
 let output='',warning='';
 const context={todayIso:()=>today,alert:text=>{warning=text},fleetNormaliseCustomer:x=>x,vectaActiveInvoices:()=>saved?[saved]:[],invoiceTotals:lines=>({subtotal:lines.reduce((s,l)=>s+Number(l.amount||0),0)}),fleetNmukIsInternalJob:j=>j.internal,fleetEomLineItems:j=>[{description:'Workshop work',price:j.price}],niceDate:x=>x,fleetEomRegistrationText:()=>'',fleetNmukTypeForJob:j=>j.nmuk_type||'',financeBaseJob:j=>j,normReg:x=>String(x||'').replace(/ /g,'').toUpperCase(),app:{jobs:[],jobCustomerMemory:{},settings:{}},window:{},Blob:class{constructor(parts){output=parts.join('')}},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},setTimeout:()=>{}};
 vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function financeOwnershipRegistration('),html.indexOf('function financeHistoricalNmukAllocation(')),context);
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
 const s=setup({invoice_number:'78763',fleet_customer:'NMUK',fleet_month:'2026-09',fleet_job_ids:['1','2'],fleet_job_snapshot:null,lines:[{amount:12770}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',rows);
 assert.equal(s.csv(),'');assert.match(s.warning(),/original issued spreadsheet/);
});
test('monthly entries use final date and their saved individual allocations',()=>{
 const extras=[{description:'Puncture repairs',amount:200,section:'internal'},{description:'Monthly work',amount:2220,section:'other'}];
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:12770,nmuk_monthly_extras:extras}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',rows);
 assert.match(s.csv(),/"=""30\/09""","","Internal","Puncture repairs","200.00"/);
 assert.match(s.csv(),/"=""30\/09""","","Other","Monthly work","2220.00"/);
});
test('month-end dates handle future months and leap years',()=>{
 for(const [month,end] of [['2026-10','31/10'],['2027-02','28/02'],['2028-02','29/02']]){
  const s=setup({fleet_customer:'NMUK',fleet_month:month,lines:[{amount:10360,nmuk_monthly_extras:[{description:'Monthly work',amount:10,section:'other'}]}]});
  s.context.fleetDownloadEomCsv('NMUK',month,rows);assert.ok(s.csv().includes('"=""'+end+'""","","Other","Monthly work","10.00"'));
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
 assert.match(s.csv(),/"=""31\/10""","","Internal","Fit new tyres","240.00"/);
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
 const frozen=jobs.map(job=>({job:{...job,price:10},amount:10,date:'2026-09-30'}));
 s.context.vectaActiveInvoices=()=>[{fleet_customer:'NMUK',fleet_month:'2026-09',fleet_job_snapshot:{version:1,rows:frozen},lines:[{amount:50,nmuk_monthly_extras:[]}]}];
 s.context.fleetDownloadEomCsv('NMUK','2026-09',frozen);
 assert.equal((s.csv().match(/"MVOS","Workshop work"/g)||[]).length,2);
 assert.match(s.csv(),/"Internal","Workshop work"/);
 assert.match(s.csv(),/"Pool","Workshop work"/);
 assert.match(s.csv(),/"Other","Workshop work"/);
 assert.match(s.csv(),/"Total:","50.00"/);
});

test('current month export includes monthly costs while finance category totals wait until month end',()=>{
 const s=setup(null,'2026-10-30'),c=s.context;
 c.fleetNmukMonthlyDrafts['2026-10']=[{description:'Puncture repairs',amount:200,section:'internal'},{description:'Fleet Maintenance work',amount:900,section:'other'}];
 assert.equal(c.fleetNmukMonthTotals(rows,'2026-10').total,10350);
 c.fleetDownloadEomCsv('NMUK','2026-10',rows);
 assert.match(s.csv(),/"Total:","11450.00"/);
 assert.match(s.csv(),/"Puncture repairs","200.00"/);
 assert.match(s.csv(),/"Fleet Maintenance work","900.00"/);
 assert.equal(c.fleetNmukMonthlyLines('2026-10')[0].amount,200);
 c.todayIso=()=> '2026-10-31';
 assert.equal(c.fleetNmukMonthTotals(rows,'2026-10').total,11450);
 c.fleetDownloadEomCsv('NMUK','2026-10',rows);
 assert.match(s.csv(),/"=""31\/10""","","Internal","Puncture repairs","200.00"/);
 assert.match(s.csv(),/"Total:","11450.00"/);
});

test('NMUK export combines all visits and line items for each normalised registration',()=>{
 const s=setup(null,'2026-10-13'),c=s.context;
 c.fleetEomRegistrationText=j=>j.registration||'No vehicle';
 c.fleetEomLineItems=j=>j.items;
 c.fleetNmukEomExportReport=()=>({total:200,internal:200,other:0,unallocated:0,extras:[]});
 const jobs=[
  {date:'2026-10-01',amount:120,job:{registration:'KX15 FWF',nmuk_type:'Internal',items:[{description:'Service',price:90},{description:'Wipers',price:30}]}},
  {date:'2026-10-09',amount:80,job:{registration:'kx15fwf',nmuk_type:'Internal',items:[{description:'Brakes, front',price:80}]}}
 ];
 c.fleetDownloadEomCsv('NMUK','2026-10',jobs);
 const lines=s.csv().split('\r\n');
 assert.equal(lines.length,5);
 assert.equal(lines[1],'"=""01/10; 09/10""","KX15 FWF","Internal","Service; Wipers; Brakes, front","200.00"');
 assert.ok(lines[2].endsWith('"Total:","200.00"'));
});

test('NMUK export keeps unrelated work without a registration on separate rows',()=>{
 const s=setup(null),c=s.context;
 c.fleetEomRegistrationText=j=>j.registration||'No vehicle';
 const result=c.fleetNmukCsvVehicleRows([{job:{price:10},amount:10,date:'2026-09-01'},{job:{registration:'No vehicle',price:20},amount:20,date:'2026-09-02'}]);
 assert.equal(result.length,2);
 assert.equal(result[0][4],'10.00');assert.equal(result[1][4],'20.00');
});

test('saved export uses frozen job prices and descriptions after later job edits',()=>{
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:10350,nmuk_monthly_extras:[]}]});
 s.context.fleetDownloadEomCsv('NMUK','2026-09',[{job:{id:'1',price:99999},amount:99999,date:'2026-10-10'}]);
 assert.match(s.csv(),/3040.00/);assert.match(s.csv(),/10350.00/);assert.doesNotMatch(s.csv(),/99999/);
});

test('NMUK single October dates are literal DD/MM text for Excel',()=>{
 const s=setup(null),c=s.context;
 c.fleetNmukEomExportReport=()=>({total:30,internal:0,other:30,unallocated:0,extras:[]});
 c.fleetDownloadEomCsv('NMUK','2026-10',[1,9,14].map(day=>({date:'2026-10-'+String(day).padStart(2,'0'),amount:10,job:{price:10}})));
 for(const date of ['01/10','09/10','14/10'])assert.ok(s.csv().includes('"=""'+date+'"""'));
 assert.match(s.csv(),/"Total:","30.00"/);
});

 test('direct download restores saved monthly edits without opening Preview',()=>{
 const s=setup(null,'2026-10-30'),c=s.context;
 c.app.settings.nmukPreviewDrafts={'2026-10':[{description:'Saved maintenance',amount:450,section:'other'}]};
 c.fleetDownloadEomCsv('NMUK','2026-10',rows);
 assert.match(s.csv(),/"Saved maintenance","450.00"/);
 assert.match(s.csv(),/"Total:","10800.00"/);
 assert.match(s.csv(),/"MVOS and other work:","7760.00"/);
 assert.equal(c.fleetEomCustomerTotal('NMUK','2026-10',rows),10350);
 });
 test('issued invoice charges stay frozen before month end despite saved draft changes',()=>{
 const s=setup({fleet_customer:'NMUK',fleet_month:'2026-10',lines:[{amount:10450,nmuk_monthly_extras:[{description:'Issued maintenance',amount:100,section:'other'}]}]},'2026-10-30');
 s.context.app.settings.nmukPreviewDrafts={'2026-10':[{description:'Later edit',amount:900,section:'other'}]};
 s.context.fleetDownloadEomCsv('NMUK','2026-10',rows);
 assert.match(s.csv(),/"Issued maintenance","100.00"/);
 assert.match(s.csv(),/"Total:","10450.00"/);
 assert.doesNotMatch(s.csv(),/Later edit/);
 });
