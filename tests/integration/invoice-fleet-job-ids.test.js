import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../public/js/vecta-invoice-save.js',import.meta.url),'utf8');
function load(){const root={};vm.runInNewContext(source,{window:root,AbortController,setTimeout,clearTimeout,console});return root.VectaInvoiceSave;}
const base={id:'00000000-0000-4000-8000-000000000001',job_id:'00000000-0000-4000-8000-000000000002',invoice_date:'2026-10-16',status:'saved',lines:[{type:'Work',description:'Repair',amount:10,vat_mode:'ex_vat'}],subtotal:10,vat:2,total:12,invoice_number:'VECTA-90001',updated_at:'2026-10-16T11:00:00Z'};
test('new standard invoice sends empty fleet_job_ids to the RPC',async()=>{
 let sent;
 const client={rpc(_name,args){sent=args.p_invoice;return {abortSignal(){return Promise.resolve({data:{invoice:{...sent,invoice_number:'VECTA-90001'}}})}}}};
 const saved=await load().create(client,{...base,fleet_job_ids:null},'VECTA');
 assert.deepEqual(sent.fleet_job_ids,[]);
 assert.equal(saved.total,12);
});
test('editing standard invoice sends empty fleet_job_ids rather than null',async()=>{
 let sent;
 const row={...base,fleet_job_ids:null};
 const query={update(payload){sent=payload;return this},eq(){return this},is(){return this},select(){return this},maybeSingle(){return this},abortSignal(){return Promise.resolve({data:{...row,...sent}})}};
 const client={from(name){assert.equal(name,'invoices');return query}};
 const saved=await load().edit(client,row);
 assert.deepEqual(sent.fleet_job_ids,[]);
 assert.equal(saved.total,12);
});
test('fleet invoices retain their linked job IDs',async()=>{
 let sent;
 const client={rpc(_name,args){sent=args.p_invoice;return {abortSignal(){return Promise.resolve({data:{invoice:{...sent,invoice_number:'VECTA-90001'}}})}}}};
 await load().create(client,{...base,fleet_job_ids:['fleet-job-1']},'VECTA');
 assert.deepEqual(sent.fleet_job_ids,['fleet-job-1']);
});
