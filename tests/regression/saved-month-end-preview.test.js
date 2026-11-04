import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const monthly=[90,170,750,60,760,60,200].map((amount,i)=>({description:'Charge '+i,amount,section:'other',vat_mode:'ex_vat'}));
const frozen=[{amount:90,date:'2026-10-30',job:{id:'nmdr2',registration:'NMDR2',internal:true}},{amount:7085,date:'2026-10-30',job:{id:'other',registration:'OTHER'}}];
function savedInvoice(){return {id:'october',invoice_number:'VECTA-78801',fleet_customer:'NMUK',fleet_month:'2026-10',subtotal:9265,vat:1853,total:11118,lines:[{amount:9265,vat_mode:'ex_vat',nmuk_monthly_extras:monthly}],fleet_job_snapshot:{rows:frozen,subtotal:9265,total:11118}}}
function setup(saved){
 const buttons={eomPreviewFinalise:{},eomPreviewSave:{},eomPreviewSaveStatus:{}};
 const modal={innerHTML:'',classList:{add(){}},setAttribute(){},querySelectorAll(){return []},querySelector(selector){return this.innerHTML.includes('id="'+selector.slice(1)+'"')?buttons[selector.slice(1)]:null}};
 let opened='',approved=0;
 const c={app:{settings:{nmukPreviewDrafts:{'2026-10':[{amount:99999,description:'Later unsaved charges'}]}}},
  vectaActiveInvoices:()=>saved?[saved]:[],fleetNormaliseCustomer:x=>String(x||''),
  fleetNmukIsInternalJob:j=>!!j.internal,invoiceTotals:lines=>{const subtotal=lines.reduce((s,x)=>s+Number(x.amount||0),0);return {subtotal,vat:subtotal*.2,total:subtotal*1.2}},
  todayIso:()=> '2026-11-04',window:{},esc:x=>String(x),money:x=>'£'+Number(x).toFixed(2),
  fleetEomPreviewItemisedRowsHtml:r=>'<div data-test-job="'+r.job.id+'">'+r.job.registration+' £'+Number(r.amount).toFixed(2)+'</div>',
  document:{getElementById:id=>id==='jobModal'?modal:buttons[id]},closeModals(){},openInvoice:id=>{opened=id},
  fleetEomConfirmFinalise:()=>{approved++}};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('var fleetNmukMonthlyDrafts={}'),html.indexOf('async function fleetEomInvoice(')),c);
 vm.runInContext(html.slice(html.indexOf('function fleetEomSavedPreview('),html.indexOf('async function fleetEomConfirmFinalise(')),c);
 return {c,modal,buttons,opened:()=>opened,approved:()=>approved};
}
test('saved Preview ignores live job edits and charge drafts and matches the £9265 invoice',()=>{
 const invoice=savedInvoice(),original=JSON.stringify(invoice),s=setup(invoice);
 const later=[{...frozen[0],amount:135},frozen[1]];
 const figures=s.c.fleetEomPreviewFigures('NMUK','2026-10',later);
 assert.equal(figures.invoice.subtotal,9265);assert.equal(figures.invoice.vat,1853);assert.equal(figures.invoice.total,11118);
 assert.equal(figures.internal,90);assert.equal(figures.other,9175);
 s.c.fleetEomPreview('NMUK','2026-10',later);
 assert.match(s.modal.innerHTML,/NMDR2 £90.00/);assert.doesNotMatch(s.modal.innerHTML,/£135.00|99999/);
 assert.match(s.modal.innerHTML,/£9265.00/);assert.match(s.modal.innerHTML,/£1853.00/);assert.match(s.modal.innerHTML,/£11118.00/);
 assert.match(s.modal.innerHTML,/VECTA-78801/);assert.match(s.modal.innerHTML,/SAVED INVOICE BREAKDOWN/);
 assert.doesNotMatch(s.modal.innerHTML,/no invoice number has been allocated/);
 assert.equal(JSON.stringify(invoice),original);
});
test('saved monthly inputs are read-only and Open Invoice cannot allocate or email again',()=>{
 const s=setup(savedInvoice());s.c.fleetEomPreview('NMUK','2026-10',[]);
 assert.equal((s.modal.innerHTML.match(/readonly /g)||[]).length,14);
 assert.doesNotMatch(s.modal.innerHTML,/id="eomPreviewSave"/);
 assert.match(s.modal.innerHTML,/Open Invoice/);
 s.buttons.eomPreviewFinalise.onclick();assert.equal(s.opened(),'october');assert.equal(s.approved(),0);
});
test('an unsaved month remains editable and includes each monthly entry exactly once',()=>{
 const s=setup(null);s.c.app.settings.nmukPreviewDrafts['2026-10']=monthly;
 const live=[{...frozen[0],amount:135},frozen[1]];
 s.c.fleetEomPreview('NMUK','2026-10',live);
 assert.match(s.modal.innerHTML,/£9310.00/);assert.match(s.modal.innerHTML,/NMDR2 £135.00/);
 assert.match(s.modal.innerHTML,/id="eomPreviewSave"/);assert.match(s.modal.innerHTML,/Approve Invoice/);
 assert.doesNotMatch(s.modal.innerHTML,/readonly /);
 s.buttons.eomPreviewFinalise.onclick();assert.equal(s.approved(),1);
});
test('legacy saved invoices without job evidence open the saved invoice rather than invent a breakdown',()=>{
 const invoice=savedInvoice();delete invoice.fleet_job_snapshot;const s=setup(invoice);
 s.c.fleetEomPreview('NMUK','2026-10',frozen);
 assert.equal(s.opened(),'october');assert.equal(s.modal.innerHTML,'');
});
test('saved preview lookup isolates account and month',()=>{
 const s=setup(savedInvoice());assert.equal(s.c.fleetEomSavedPreview('NDS','2026-10'),null);
 assert.equal(s.c.fleetEomSavedPreview('NMUK','2026-11'),null);
});
