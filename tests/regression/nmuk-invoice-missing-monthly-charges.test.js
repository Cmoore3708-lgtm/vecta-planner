import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(){
 const c={fleetNmukMonthlyCostsDue:()=>true,fleetNmukMonthlyLines:()=>[{description:'Saved maintenance',amount:450,section:'other'}],invoiceTotals:lines=>({subtotal:lines[0].amount,vat:lines[0].amount*.2,total:lines[0].amount*1.2}),esc:x=>x,money:x=>'£'+x};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function fleetNmukInvoiceChargesDraft('),html.indexOf('function openInvoice(')),c);return c;
}
function invoice(){return {id:'existing',invoice_number:'78763',fleet_customer:'NMUK',fleet_month:'2026-10',lines:[{description:'Fleet work completed during October',amount:100,vat_mode:'ex_vat',nmuk_monthly_extras:[]}],fleet_job_snapshot:{rows:[{amount:100,job:{id:'job-1'}}],subtotal:100,total:120}}}
test('opening a jobs-only invoice prepares missing saved charges without mutating the issued record',()=>{
 const c=setup(),inv=invoice(),original=JSON.stringify(inv),draft=c.fleetNmukInvoiceChargesDraft(inv);
 assert.notEqual(draft,inv);assert.equal(JSON.stringify(inv),original);
 assert.equal(draft.id,inv.id);assert.equal(draft.invoice_number,'78763');
 assert.equal(draft.lines.length,1);assert.equal(draft.subtotal,550);assert.equal(draft.total,660);
 assert.equal(draft.fleet_job_snapshot.subtotal,550);
 assert.equal(draft.fleet_job_snapshot.invoice_lines[0].nmuk_monthly_extras[0].amount,450);
 assert.equal(c.fleetNmukInvoiceChargesDraft(draft),draft);
 assert.equal(draft.lines[0].description,inv.lines[0].description);
 assert.ok(!html.includes('function fleetNmukInvoiceChargesHtml('));
});
test('repair leaves paid invoices, unknown adjustments, legacy invoices and other customers untouched',()=>{
 const c=setup();
 for(const change of [i=>i.payment_method='Card',i=>i.status='paid',i=>i.paid_at='2026-11-01',i=>i.lines[0].amount=150,i=>delete i.fleet_job_snapshot,i=>i.fleet_customer='NDS',i=>i.lines[0].nmuk_monthly_extras=[{amount:10}],i=>i.lines.push({amount:10})]){
  const inv=invoice();change(inv);assert.equal(c.fleetNmukInvoiceChargesDraft(inv),inv);
 }
 c.fleetNmukMonthlyCostsDue=()=>false;const inv=invoice();assert.equal(c.fleetNmukInvoiceChargesDraft(inv),inv);
});
test('invoice save uses the prepared draft and persists the corrected frozen snapshot',()=>{
 assert.match(html,/function gatherInvoice\(id\)\{var source=\(typeof window!=='undefined'&&window\.vectaNmukInvoiceDrafts/);
 assert.match(html,/inv\.fleet_job_snapshot\.invoice_lines=JSON\.parse\(JSON\.stringify\(inv\.lines\)\)/);
});
