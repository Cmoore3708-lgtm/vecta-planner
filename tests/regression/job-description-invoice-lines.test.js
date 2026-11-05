import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=readFileSync('index.html','utf8');
function fn(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);return source.slice(start,source.indexOf('\nfunction ',start+1));}
function setup(source,job={}){
  const {document,window}=parseHTML('<html><body><textarea id="job_work_required"></textarea><div id="pricing"></div></body></html>');
  const c={document,window,PRIVATE_PRICING_PREFIX:'[[VECTA_PRIVATE_PRICING:',esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),privatePricingPresetItemsForTypes:()=>[],jobTypeLabel:()=> 'General',servicePricingAdvisorHtml:()=>'',bindJobPartsEditor(){},app:{jobs:[],settings:{vatRate:20}},savedInvoiceForJobId:()=>null,invoiceIsStaff:()=>true,invoiceMotTestLine:l=>l.description==='MOT test',invoiceLineWithMotVat:l=>l,jobVehicleDueData:()=>({}),knownRegistrationDetails:()=>({}),latestServiceMileage:()=>'',currentJobMileageUnknown:()=>false,confirmedJobMileage:()=>'',uid:()=> 'draft',nextInvoiceNumberText:()=> 'TEST',fleetInvoiceJobDate:()=> '2026-11-05',openInvoice:(_id,inv)=>c.invoice=inv};
  vm.createContext(c);
  for(const name of ['privatePricingItemsFromNote','stripPrivatePricingFromNote','noteWithPrivatePricing','privatePricingRowHtml','privatePricingSectionHtml','gatherPrivatePricingItems','syncPrivatePricingTotal','privatePricingWorkLines','syncWorkRequiredToPrivatePricing','fitPrivatePricingDescription','schedulePrivatePricingFit','privatePricingViewportResize','bindPrivatePricing','openInvoiceForJob','invoiceTotals'])vm.runInContext(fn(source,name),c);
  const work=document.getElementById('job_work_required');work.value=job.work_required||'';
  document.getElementById('pricing').innerHTML=c.privatePricingSectionHtml(job);c.bindPrivatePricing();
  const input=(node,value)=>{node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));};
  return {c,document,work,input,type:value=>input(work,value),rows:()=>Array.from(document.querySelectorAll('.privatePricingRow')),items:()=>JSON.parse(JSON.stringify(c.gatherPrivatePricingItems())),total:()=>document.getElementById('job_amount_quoted').value};
}
for(const [variant,source] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 test(variant+': typing and pasting produces one invoice row per nonblank line, without duplicate listeners',()=>{
  const h=setup(source);for(const value of ['F','Front','Front brakes','Front brakes\n','Front brakes\nR','Front brakes\nRear tyres'])h.type(value);
  h.type(' Front brakes \r\n\r\n Rear tyres\rMOT test\n');
  assert.deepEqual(h.items().map(x=>x.description),['Front brakes','Rear tyres','MOT test']);
  assert.equal(h.total(),'','typing alone must not invent a quote');
  h.c.bindPrivatePricing();h.work.dispatchEvent(new h.c.window.Event('change'));
  assert.equal(h.rows().length,3);assert.ok(h.rows().every(r=>r.querySelector('.privatePriceAmount').value===''));
 });
 test(variant+': edits, insertions and reordering keep each price with its work',()=>{
  const h=setup(source);h.type('Front brakes\nRear tyres');
  h.input(h.rows()[0].querySelector('.privatePriceAmount'),'120');h.input(h.rows()[1].querySelector('.privatePriceAmount'),'80');
  h.type('Front pads and discs\nRear tyres');h.type('MOT test\nFront pads and discs\nRear tyres');h.type('Rear tyres\nMOT test\nFront pads and discs');
  assert.deepEqual(h.items().map(x=>[x.description,x.price]),[['Rear tyres',80],['MOT test',0],['Front pads and discs',120]]);assert.equal(h.total(),'200.00');
 });
 test(variant+': manual wording and independent charges survive edits and save/reopen',()=>{
  let h=setup(source);h.type('Check front brakes');h.input(h.rows()[0].querySelector('.privatePriceDescription'),'Replace front brake pads');h.input(h.rows()[0].querySelector('.privatePriceAmount'),'95');
  h.type('Check front brakes and discs\nMOT test');
  const job={id:'job',work_required:h.work.value,amount_quoted:95,customer_note:h.c.noteWithPrivatePricing('Keep existing note',h.c.gatherPrivatePricingItems())};
  h=setup(source,job);h.type('Check front brakes and discs carefully\nMOT test\nFit wipers');
  assert.equal(h.items()[0].description,'Replace front brake pads');assert.equal(h.items()[0].price,95);assert.equal(h.rows().length,3);assert.equal(h.total(),'95.00');
  h.c.app.jobs=[{...job,customer_note:h.c.noteWithPrivatePricing(job.customer_note,h.c.gatherPrivatePricingItems())}];h.c.openInvoiceForJob('job');
  assert.deepEqual(JSON.parse(JSON.stringify(h.c.invoice.lines)).map(x=>[x.description,x.amount,x.vat_mode]),[['Replace front brake pads',95,'inc_vat'],['MOT test',0,'no_vat'],['Fit wipers',0,'inc_vat']]);assert.equal(h.c.invoiceTotals(h.c.invoice.lines).total,95);
 });
 test(variant+': removing work cannot silently discard a charge; restoring it does not duplicate it',()=>{
  const h=setup(source);h.type('Brakes\nWipers\nMOT');h.input(h.rows()[0].querySelector('.privatePriceAmount'),'120');h.type('MOT');
  assert.deepEqual(h.items().map(x=>[x.description,x.price]),[['MOT',0],['Brakes',120]]);assert.equal(h.total(),'120.00');
  h.type('Brakes\nMOT');assert.equal(h.rows().length,2);assert.equal(h.items()[0].price,120);
 });
 test(variant+': initial multiline descriptions split without multiplying the saved total',()=>{
  for(const amount_quoted of [0,180]){
   const h=setup(source,{work_required:'Full service\nMOT test\n\nWash',amount_quoted});
   assert.deepEqual(h.items().map(x=>[x.description,x.price]),[['Full service',amount_quoted],['MOT test',0],['Wash',0]]);assert.equal(Number(h.total()),amount_quoted);
  }
 });
 test(variant+': supplier and independent invoice entries remain intact when new work is typed',()=>{
  const seed=setup(source),job={work_required:'Full Service\nOil and filters',amount_quoted:180,customer_note:seed.c.noteWithPrivatePricing('',[{description:'Full Service — GSF',price:180,repair_quote:{id:'protected'}}])};
  const h=setup(source,job);h.type(job.work_required+'\nReplace wipers');
  assert.equal(h.rows().length,2);assert.ok(h.items().some(x=>x.description==='Full Service — GSF'&&x.price===180&&x.repair_quote.id==='protected'));assert.equal(h.total(),'180.00');
 });
 test(variant+': duplicate lines remain distinct and removing an invoice row stays respected',()=>{
  const h=setup(source);h.type('Inspect tyre\nInspect tyre');assert.equal(h.rows().length,2);
  h.rows()[0].querySelector('.privatePricingRemove').onclick();h.work.dispatchEvent(new h.c.window.Event('change'));assert.equal(h.rows().length,1);
  h.type('Inspect tyre\nInspect tyre\nCheck wheel');assert.equal(h.rows().length,2);
 });
}
