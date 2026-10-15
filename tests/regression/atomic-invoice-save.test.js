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
 assert.match(source,/Saved invoice identity/);assert.doesNotMatch(source,/invoice_number\s*=/);
});
