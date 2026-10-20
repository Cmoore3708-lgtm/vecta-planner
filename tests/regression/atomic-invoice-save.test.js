import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const draft=()=>({id:'00000000-0000-4000-8000-000000000001',job_id:'',invoice_number:'LOCAL-00001',created_at:'old',updated_at:'old',invoice_date:'2026-10-15',status:'saved',mot_due:'',customer_address:'Test address',subtotal:100,vat:20,total:120,lines:[{description:'Synthetic work',amount:100,vat_mode:'ex_vat'}]});
function helper(){const root={};vm.runInNewContext(fs.readFileSync('public/js/vecta-invoice-save.js','utf8'),{window:root,AbortController,setTimeout,clearTimeout});return root.VectaInvoiceSave;}
function client(transform=invoice=>invoice){return {calls:[],rpc(name,args){this.calls.push({name,args});return {abortSignal:async()=>({data:{invoice:transform({...args.p_invoice,invoice_number:'VECTA-78751'}),created:true}})};}};}

test('new invoices use one transactional request with a stable id and no browser-picked number',async()=>{
 const c=client(),inv=draft(),before=JSON.stringify(inv),saved=await helper().create(c,inv,'VECTA');
 assert.equal(c.calls.length,1);assert.equal(c.calls[0].name,'vecta_create_invoice');
 const input=c.calls[0].args.p_invoice;assert.equal(input.id,inv.id);assert.equal(input.job_id,null);assert.equal(input.mot_due,null);assert.equal(input.invoice_number,undefined);assert.equal(input.created_at,undefined);assert.equal(input.updated_at,undefined);
 assert.equal(input.customer_address,'Test address');assert.equal(saved.invoice_number,'VECTA-78751');assert.equal(JSON.stringify(inv),before);
});
test('financial receipts check totals, identity, job and line contents before adopting the allocated number',async()=>{
 for(const change of [s=>({...s,id:'other'}),s=>({...s,job_id:'other'}),s=>({...s,total:121}),s=>({...s,vat:null}),s=>({...s,invoice_number:''}),s=>({...s,lines:[]})]){
  await assert.rejects(helper().create(client(change),draft(),'VECTA'),/receipt did not match/);
 }
 // JSONB reorders object keys without changing an invoice line.
 const saved=await helper().create(client(s=>({...s,lines:[{vat_mode:'ex_vat',amount:100,description:'Synthetic work'}]})),draft(),'VECTA');assert.equal(saved.total,120);
});
test('failed requests never fall back to blind upserts or change the stable draft',async()=>{
 const inv=draft(),before=JSON.stringify(inv);let fallback=0;
 const c={from(){fallback++;throw Error('must not upsert');},rpc(){return {abortSignal:async()=>({error:{code:'42883',message:'Migration not installed'}})}}};
 await assert.rejects(helper().create(c,inv,'VECTA'),e=>e.code==='42883');assert.equal(fallback,0);assert.equal(JSON.stringify(inv),before);
});
test('timed-out creation keeps the original identity for a deliberate retry',async()=>{
 const inv=draft();let aborted=false,seenId;
 const c={rpc(_name,args){seenId=args.p_invoice.id;return {abortSignal:signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}))};}};
 await assert.rejects(helper().create(c,inv,'VECTA',{timeoutMs:10}),/Keep this invoice open and retry/);
 assert.equal(aborted,true);assert.equal(inv.id,seenId);assert.equal(inv.invoice_number,'LOCAL-00001');
});
test('invalid totals and dates fail before any cloud write',async()=>{
 for(const patch of [{total:NaN},{subtotal:''},{invoice_date:''},{lines:null}]){
  const c=client();await assert.rejects(helper().create(c,{...draft(),...patch},'VECTA'));assert.equal(c.calls.length,0);
 }
});
test('the obsolete register download and client-side retry allocator are removed',()=>{
 assert.doesNotMatch(html,/function vectaCloudInvoiceRows|function vectaNextInvoiceNumberFromRows|function vectaConfirmInvoiceIdentity/);
 const start=html.indexOf('async function vectaSaveInvoiceRowConfirmed('),end=html.indexOf('\nfunction invoiceReturnAfterSave(',start),source=html.slice(start,end);
 assert.match(source,/if\(isNew\)[\s\S]*VectaInvoiceSave\.create/);assert.match(source,/Object\.assign\(inv,allocated\)/);
 assert.match(source,/VectaInvoiceSave\.edit/);assert.doesNotMatch(source,/invoice_number\s*=/);
});

function paymentRow(){return {...draft(),invoice_number:'VECTA-78751',updated_at:'2026-10-15T10:00:00.000Z',payment_method:''};}
function paymentClient(initial,{beforeWrite,writeError}={}){
 let row=structuredClone(initial),writes=0;
 return {get row(){return row;},get writes(){return writes;},from(){
  let patch=null,filters=[];
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},update(v){patch=v;return q;},single(){return q;},maybeSingle(){return q;},async abortSignal(){
   if(!patch)return {data:structuredClone(row)};
   writes++;if(beforeWrite)row=beforeWrite(row);
   if(writeError)return {error:writeError};
   if(!filters.every(([k,v])=>row[k]===v))return {data:null};
   row={...row,...structuredClone(patch)};return {data:structuredClone(row)};
  }};return q;
 }};
}
test('payment changes preserve invoice amounts and work, adding only method and paid-date metadata',async()=>{
 const inv=paymentRow(),before=JSON.stringify(inv),c=paymentClient(inv);
 const saved=await helper().payment(c,inv,'bacs');
 assert.equal(saved.payment_method,'bacs');assert.match(saved.lines[0].invoice_paid_date,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(saved.lines[0].description,inv.lines[0].description);assert.equal(saved.total,120);assert.equal(JSON.stringify(inv),before);
 assert.ok(Date.parse(saved.updated_at)>Date.parse(inv.updated_at));
});
test('stale payment screens refuse to write newer invoice lines or payment changes',async()=>{
 for(const patch of [{updated_at:'2026-10-15T11:00:00Z'},{payment_method:'card'},{lines:[{description:'Newer repair',amount:300}]},{total:130}]){
  const inv=paymentRow(),c=paymentClient({...inv,...patch});
  await assert.rejects(helper().payment(c,inv,'cash'),/another device/);assert.equal(c.writes,0);
 }
});
test('a competing update between payment read and write wins without being overwritten',async()=>{
 const inv=paymentRow(),c=paymentClient(inv,{beforeWrite:r=>({...r,payment_method:'card',updated_at:'2026-10-15T11:00:00Z'})});
 await assert.rejects(helper().payment(c,inv,'bacs'),/another device/);assert.equal(c.row.payment_method,'card');
});
test('payment corrections preserve the original date, while clearing payment clears its date',async()=>{
 const inv=paymentRow();inv.payment_method='card';inv.lines[0].invoice_paid_date='2026-10-01';
 const corrected=await helper().payment(paymentClient(inv),inv,'cash');assert.equal(corrected.lines[0].invoice_paid_date,'2026-10-01');
 const cleared=await helper().payment(paymentClient(inv),inv,'');assert.equal(cleared.lines[0].invoice_paid_date,'');
});
test('payment errors and timeouts leave the original local invoice intact',async()=>{
 const inv=paymentRow(),before=JSON.stringify(inv),c=paymentClient(inv,{writeError:Error('network failed')});
 await assert.rejects(helper().payment(c,inv,'bacs'),/network failed/);assert.equal(JSON.stringify(inv),before);
 const hanging={from(){const q={select(){return q;},eq(){return q;},single(){return q;},abortSignal:()=>new Promise(()=>{})};return q;}};
 await assert.rejects(helper().payment(hanging,inv,'cash',{timeoutMs:10}),/could not be confirmed/);assert.equal(JSON.stringify(inv),before);
});

test('saved invoice edits filter the original version and preserve invoice identity',async()=>{
 const inv=paymentRow();inv.job_id='job-1';const c=paymentClient(inv);inv.lines[0].description='Revised work';
 const saved=await helper().edit(c,inv);assert.equal(saved.lines[0].description,'Revised work');assert.equal(saved.invoice_number,inv.invoice_number);assert.equal(saved.job_id,'job-1');
});
test('saved invoice edits refuse competing payment updates without overwriting them',async()=>{
 const inv=paymentRow();inv.job_id='job-1';const c=paymentClient(inv,{beforeWrite:r=>({...r,payment_method:'bacs',updated_at:'2026-10-15T11:00:00Z'})});
 await assert.rejects(helper().edit(c,inv),/another device/);assert.equal(c.row.payment_method,'bacs');
});
test('editor saves use the opening version and do not mutate invoice-list rows before confirmation',()=>{
 const open=html.slice(html.indexOf('function openInvoice(id,preset)'),html.indexOf('function invoiceTotals('));
 assert.match(open,/vectaInvoiceEditVersions\[String\(id\)\]=inv.updated_at/);
 assert.match(open,/var inv=source\?JSON.parse\(JSON.stringify\(source\)\)/);
 assert.match(open,/inv.updated_at=window.vectaInvoiceEditVersions\[String\(id\)\]/);
 const gather=open.slice(open.indexOf('function gatherInvoice('));assert.doesNotMatch(gather,/inv.updated_at=new Date/);
});

test('fleet creation transmits and verifies frozen job evidence in the actual RPC payload',async()=>{
 const inv={...draft(),fleet_job_ids:['job-a'],fleet_job_snapshot:{version:1,rows:[{job:{id:'job-a',work_required:'Service'},date:'2026-10-01',amount:100}]}};
 const c=client(),saved=await helper().create(c,inv,'VECTA');
 assert.deepEqual(JSON.parse(JSON.stringify(c.calls[0].args.p_invoice.fleet_job_snapshot)),inv.fleet_job_snapshot);
 assert.equal(saved.fleet_job_snapshot.rows[0].job.work_required,'Service');
 await assert.rejects(helper().create(client(row=>({...row,fleet_job_snapshot:null})),inv,'VECTA'),/receipt did not match/);
});
