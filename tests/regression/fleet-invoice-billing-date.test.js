import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(){
 const written=[],opened=[];
 const c={Date,app:{invoices:[],settings:{}},todayIso:()=> '2026-11-04',window:{},
  vectaActiveInvoices:()=>[],vectaCheckFleetBilling:async()=>true,
  uid:()=> 'new-invoice',nextInvoiceNumberText:()=> 'VECTA-NEXT',
  fleetNormaliseCustomer:x=>x,fleetInvoiceCustomerProfile:()=>({}),
  fleetNmukMonthlyLines:()=>[{description:'Monthly charges',amount:20,vat_mode:'ex_vat'}],fleetNmukMonthlyCostsDue:()=>true,
  invoiceTotals:lines=>{const subtotal=lines.reduce((s,l)=>s+l.amount,0);return {subtotal,vat:subtotal*.2,total:subtotal*1.2}},
  vectaSaveInvoiceRowConfirmed:async inv=>written.push(JSON.parse(JSON.stringify(inv))),
  nextInvoiceSequence:()=>1,saveLocal(){},persistMainSettings:async()=>true,
  niceDate:x=>x,normReg:x=>x,fleetNmukTypeForJob:()=>'',invoiceDescriptionText:()=> 'Work',
  financeLegacyAllocation:j=>({type:j.account}),fleetEomBillingMonth:j=>j.billing_month||'',
  vehicleTaxSelectedMonth:'2026-10',vehicleTaxTotalsForMonth:()=>({uninvoiced:[{id:'tax-job',registration:'TEST',amount_quoted:200}]}),
  fleetInvoiceFormatRegistration:x=>x,vehicleTaxJobDate:()=> '2026-10-20',vehicleTaxAmount:()=>200,
  openInvoice:(_id,inv)=>opened.push(inv),alert:message=>{throw Error(message)}};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function fleetInvoiceMonthEndDate('),html.indexOf('function fleetNmukEomExportReport(')),c);
 vm.runInContext(html.slice(html.indexOf('function createVehicleTaxMonthInvoice('),html.indexOf('var activeSettingsCategory=')),c);
 return {c,written,opened};
}
const rows=[{date:'2026-10-20',amount:100,job:{id:'job-1',registration:'TEST'}}];
test('NMUK and contractor creation sends the selected billing month end to the save path',async()=>{
 for(const name of ['NMUK','NDS','WPC']){
  for(const [month,end] of [['2026-10','2026-10-31'],['2026-09','2026-09-30'],['2027-02','2027-02-28'],['2028-02','2028-02-29'],['2026-12','2026-12-31'],['2027-01','2027-01-31']]){
   const s=setup(),inv=await s.c.fleetEomInvoice(name,month,rows);
   assert.equal(inv.invoice_date,end);assert.equal(s.written[0].invoice_date,end);
   assert.equal(inv.fleet_month,month);assert.equal(s.written.length,1);
  }
 }
});
test('NMUK vehicle-tax invoice uses its chosen month rather than today',()=>{
 const s=setup();s.c.createVehicleTaxMonthInvoice();
 assert.equal(s.opened[0].invoice_date,'2026-10-31');
 assert.equal(s.opened[0].eom_month,'2026-10');
 assert.equal(s.opened[0].lines[0].vat_mode,'no_vat');
});
test('job invoices use authoritative NMUK/contractor billing month, with booking month for unfinished work',()=>{
 const s=setup();
 for(const account of ['NMUK','Contractor']){
  assert.equal(s.c.fleetInvoiceJobDate({account,billing_month:'2026-10',booking_date:'2026-11-04'}),'2026-10-31');
  assert.equal(s.c.fleetInvoiceJobDate({account,booking_date:'2028-02-10'}),'2028-02-29');
 }
 assert.equal(s.c.fleetInvoiceJobDate({account:'Staff',booking_date:'2026-10-20'}),'2026-11-04');
 assert.match(html,/invoice_date:fleetInvoiceJobDate\(j\),payment_method:'',lines:invoiceLines/);
});
test('invalid billing months fail before saving instead of falling back to today',async()=>{
 for(const month of ['',null,'2026-00','2026-13','October 2026']){
  const s=setup();await assert.rejects(s.c.fleetEomInvoice('NMUK',month,rows),/valid billing month/);
  assert.equal(s.written.length,0);
 }
});
test('opening an existing invoice does not silently rewrite its date',async()=>{
 const s=setup(),existing={id:'existing',fleet_customer:'NMUK',fleet_month:'2026-10',invoice_date:'2026-10-15'};
 s.c.vectaActiveInvoices=()=>[existing];
 assert.equal(await s.c.fleetEomInvoice('NMUK','2026-10',rows),existing);
 assert.equal(existing.invoice_date,'2026-10-15');assert.equal(s.written.length,0);
});
test('Staff invoicing retains its current-date behaviour',async()=>{
 const s=setup();const inv=await s.c.fleetEomInvoice('Staff','2026-10',rows);
 assert.equal(inv.invoice_date,'2026-11-04');
});
