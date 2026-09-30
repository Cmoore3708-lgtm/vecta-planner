import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function fleetEomCustomerTotal('),html.indexOf('function fleetEomBaseHtml('));
function total(invoices,customer='NMUK',month='2026-09'){
 const ctx={fleetNormaliseCustomer:x=>x,vectaActiveInvoices:()=>invoices,fleetNmukMonthlyLines:()=>[{amount:1680}]};
 vm.createContext(ctx);vm.runInContext(source,ctx);
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
