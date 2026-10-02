import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function fleetEomCustomerTotal('),html.indexOf('function fleetEomBaseHtml('));
function total(invoices,customer='NMUK',month='2026-09',today='2026-09-30'){
 const ctx={todayIso:()=>today,invoiceTotals:lines=>({subtotal:lines.reduce((s,l)=>s+Number(l.amount||0),0)}),fleetNormaliseCustomer:x=>x,vectaActiveInvoices:()=>invoices,fleetNmukMonthlyLines:()=>[{amount:1680}]};
 vm.createContext(ctx);vm.runInContext(html.match(/function fleetNmukMonthlyCostsDue\(month\)\{[^\n]+/)[0],ctx);vm.runInContext(source,ctx);
 return ctx.fleetEomCustomerTotal(customer,month,[{amount:10350}]);
}
test('financial summary adds saved consolidated monthly extras exactly once',()=>{
 assert.equal(total([{fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:12770,nmuk_monthly_extras:[{amount:2420}]}]}]),12770);
});
test('legacy invoice extras and unsaved defaults are included',()=>{
 assert.equal(total([{fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:10350},{amount:2420,nmuk_monthly_extra:true}]}]),12770);
 assert.equal(total([]),12030);
});
test('saved zero extras, other customers and other months stay separate',()=>{
 assert.equal(total([{fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:10350,nmuk_monthly_extras:[]}]}]),10350);
 assert.equal(total([],'Staff'),10350);
 assert.equal(total([{fleet_customer:'NMUK',fleet_month:'2026-08',lines:[{nmuk_monthly_extras:[{amount:9999}]}]}]),12030);
});
test('all financial summary surfaces use the same total calculation',()=>{
 const base=html.slice(html.indexOf('function fleetEomBaseHtml('),html.indexOf('\n',html.indexOf('function fleetEomBaseHtml(')));
 assert.match(base,/total=fleetEomCustomerTotal\(customer,month,customerRows\)/);
 assert.match(base,/totalValue=customers.reduce/);
 assert.match(base,/ct=fleetEomCustomerTotal\(c,month,cr\)/);
});

test('saved invoice without monthly metadata uses actual subtotal',()=>{
 assert.equal(total([{fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:12770}]}]),12770);
 assert.equal(total([{fleet_customer:'NMUK',fleet_month:'2026-09',lines:[{amount:10350},{amount:2420}]}]),12770);
});
test('invoice save preserves consolidated monthly details',()=>{
 const gather=html.slice(html.indexOf('function gatherInvoice('),html.indexOf('\n',html.indexOf('function gatherInvoice(')));
 const original=[{amount:12770,nmuk_monthly_extras:[{amount:2420,section:'other'}]}];
 const tr={parentNode:{children:[]},querySelector:s=>s==='[data-line-desc]'?{value:'Fleet work',dataset:{}}:{value:s==='[data-line-vat]'?'ex_vat':'12770'}};
 tr.parentNode.children=[tr];
 const inv={id:'test',source:'fleet_eom',fleet_customer:'NMUK',invoice_date:'2026-09-30',lines:original};
 const ctx={app:{invoices:[inv]},document:{querySelector:()=>null,getElementById:()=>null,querySelectorAll:()=>[tr]},todayIso:()=> '2026-09-30',nextInvoiceNumberText:()=> '78763',invoiceTotals:()=>({subtotal:12770,vat:2554,total:15324})};
 vm.createContext(ctx);vm.runInContext(gather,ctx);ctx.gatherInvoice('test');
 assert.equal(inv.lines[0].nmuk_monthly_extras[0].amount,2420);
 assert.notEqual(inv.lines[0].nmuk_monthly_extras,original[0].nmuk_monthly_extras);
});

test('monthly costs enter running totals only on the final calendar date',()=>{
 for(const [month,last] of [['2026-10','31'],['2026-09','30'],['2027-02','28'],['2028-02','29']]){
  const before=month+'-'+String(Number(last)-1).padStart(2,'0'),end=month+'-'+last;
  const saved=[{fleet_customer:'NMUK',fleet_month:month,lines:[{amount:12770,nmuk_monthly_extras:[{amount:2420}]}]}];
  assert.equal(total([], 'NMUK',month,before),10350);
  assert.equal(total(saved,'NMUK',month,before),10350);
  assert.equal(total([], 'NMUK',month,end),12030);
  assert.equal(total(saved,'NMUK',month,end),12770);
 }
});
