import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {approvedJobChanges,mechanicApprovalSummary} from '../../lib/approved-work.js';
import {reviewQueue,workshopApprovalList,stageFinding} from '../../lib/progress-approvals.js';
const read=f=>readFileSync(f,'utf8');
const jobId='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const approval={id,progress_message:'Replace front brake pads',progress_estimate_pence:12000};
const pricing=note=>JSON.parse(decodeURIComponent(note.match(/\[\[VECTA_PRIVATE_PRICING:([^\]]+)\]\]/)[1]));
const base={work_required:'Interim service',customer_note:'Keep old parts',amount_quoted:130,vat_mode:'inc_vat'};
test('accepted text-only work preserves existing charges, metadata and VAT; the invoice uses the added priced line',()=>{
 const updated=approvedJobChanges(base,approval),items=pricing(updated.customer_note);
 assert.equal(updated.work_required,'Interim service\nReplace front brake pads');assert.equal(updated.amount_quoted,250);
 assert.match(updated.customer_note,/Keep old parts/);assert.deepEqual(items.map(x=>x.price),[130,120]);
 const more=approvedJobChanges(updated,{...approval,id:'another',progress_message:'Rear pads',progress_estimate_pence:6000});
 assert.equal(more.amount_quoted,310);assert.equal(pricing(more.customer_note).length,3);
 assert.equal(approvedJobChanges({...base,vat_mode:'ex_vat'},approval).amount_quoted,230);
 const mot=approvedJobChanges({...base,work_required:'MOT',vat_mode:'no_vat',amount_quoted:45},approval);
 assert.equal(mot.vat_mode,'inc_vat');assert.equal(mot.amount_quoted,165);
 // Exercise the real invoice factory from the application, not a duplicate calculator.
 const source=read('index.html'),fn=source.match(/function openInvoiceForJob\(id\)\{[^\n]+/)[0];
 let created;
 const ctx={app:{jobs:[{...mot,id:jobId,registration:'TEST001'}],invoices:[]},savedInvoiceForJobId:()=>null,
  privatePricingItemsForJob:j=>pricing(j.customer_note),invoiceLineWithMotVat:l=>({...l,vat_mode:/^MOT$/.test(l.description)?'no_vat':l.vat_mode}),invoiceIsStaff:()=>true,invoiceMotTestLine:l=>/^MOT$/.test(l.description),
  fleetInvoiceJobDate:()=>'',jobVehicleDueData:()=>({}),knownRegistrationDetails:()=>({}),latestServiceMileage:()=>'',currentJobMileageUnknown:()=>false,confirmedJobMileage:()=>'',uid:()=>id,todayIso:()=>'',nextInvoiceNumberText:()=>'',
  invoiceTotals:lines=>({subtotal:0,vat:0,total:lines.reduce((n,l)=>n+l.amount,0)}),saveAll(){},openInvoice(){},upsertRemote:async()=>{},persistInvoices(){},persistJobCustomerMemory(){}};
 vm.runInNewContext(fn+';result=openInvoiceForJob("'+jobId+'");',ctx);
 created=ctx.app.invoices[0]||ctx.result;
 assert.deepEqual(Array.from(created.lines,x=>[x.description,x.amount,x.vat_mode]),[['MOT',45,'no_vat'],['Replace front brake pads',120,'inc_vat']]);
 assert.throws(()=>approvedJobChanges({...base,customer_note:'[[VECTA_PRIVATE_PRICING:broken]]'},approval),/pricing needs checking/);
});

test('mechanic API summaries are explicitly non-financial, including prices typed into the message',async()=>{
 const item={id,message:'Front pads for £120 including VAT',photo_ids:[],status:'approved',decided_at:'2026-11-09T09:00:00.000Z',estimated_pence:12000,channels:{email:'sent'},token:'secret'};
 const summary=mechanicApprovalSummary(item);assert.doesNotMatch(JSON.stringify(summary),/120|VAT|estimated|channels|secret/);
 const job={id:jobId,booking_date:'2026-11-09',registration:'TEST001',status:'in_progress',customer_email:'fixture@example.invalid',customer_phone:''};
 const row={...job,job_id:jobId,id,progress_from_mechanic:true,progress_booking_date:job.booking_date,progress_message:item.message,progress_photo_ids:[],progress_review_state:'sent',status:'approved',decided_at:item.decided_at,progress_estimate_pence:12000,jobs:job};
 let reads=0;const db=async()=>{reads++;return [row];};
 const list=await workshopApprovalList(db,job,'mechanic');assert.equal(reads,1);assert.doesNotMatch(JSON.stringify(list),/120|VAT|estimated|channels|whatsapp/);
 const queue=await reviewQueue(db,'mechanic');assert.equal(queue.findings.length,0);assert.equal(queue.decisions.length,1);assert.doesNotMatch(JSON.stringify(queue),/120|VAT|estimated|channels/);
});

test('database decision and invoice preparation are atomic, idempotent and reject stale or invoiced jobs',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table public.jobs(id uuid primary key,booking_date date,customer_email text,customer_phone text,registration text,archived boolean default false,card_type text,status text,customer_note text,job_type text,work_required text,amount_quoted numeric,vat_mode text,updated_at timestamptz);
   create table public.invoices(id uuid primary key,job_id uuid,fleet_job_ids jsonb,status text);
   create table public.additional_work_approvals(id uuid primary key,job_id uuid,progress_message text,progress_photo_ids uuid[],progress_booking_date date,customer_email text,customer_phone text,registration text,status text,expires_at timestamptz,decided_at timestamptz,created_at timestamptz default now());
   create table public.job_workshop_photos(id uuid primary key,job_id uuid,ready boolean default false,deleted_at timestamptz);`);
  await db.exec(read('supabase/migrations/20261106070818_workshop_review_estimates.sql'));
  await db.exec(read('supabase/migrations/20261109170410_customer_message_approval_work.sql'));
  await db.query("insert into jobs(id,booking_date,registration,status,customer_email,customer_phone,work_required,amount_quoted,vat_mode,updated_at) values($1,current_date,'TEST001','in_progress','fixture@example.invalid','','MOT',45,'no_vat',now())",[jobId]);
  const add=async key=>db.query("insert into additional_work_approvals(id,job_id,progress_message,progress_photo_ids,progress_booking_date,registration,customer_email,customer_phone,status,progress_review_state,progress_estimate_pence,expires_at) values($1,$2,'Replace front brake pads','{}',current_date,'TEST001','fixture@example.invalid','','pending','sent',12000,now()+interval '1 day')",[key,jobId]);
  await add(id);
  const job=async()=>(await db.query('select *,updated_at::text as updated_at from jobs where id=$1',[jobId])).rows[0];
  const state=async()=>(await db.query('select status from additional_work_approvals where id=$1',[id])).rows[0].status;
  const snapshot=j=>Object.fromEntries(['updated_at','work_required','customer_note','amount_quoted','vat_mode'].map(k=>[k,j[k]]));
  const call=async(decision,j,key=id,changes)=>{j??=await job();changes??=approvedJobChanges(j,approval);return (await db.query('select public.vecta_decide_progress_work($1,$2,$3,$4,$5) result',[jobId,key,decision,JSON.stringify(snapshot(j)),JSON.stringify(changes)])).rows[0].result;};
  const before=await job();
  // Mimic ISO Z timestamps returned by an API, rather than PostgreSQL formatting.
  before.updated_at=new Date(before.updated_at).toISOString();
  await db.query("update jobs set work_required='MOT test' where id=$1",[jobId]);
  assert.equal((await call('approved',before)).code,409);assert.equal(await state(),'pending');
  const current=await job();
  assert.equal((await call('approved',current)).code,200);assert.equal(await state(),'approved');
  assert.equal((await job()).work_required,'MOT test\nReplace front brake pads','approval must immediately add the authorised task to the saved job card');
  assert.equal(Number((await job()).amount_quoted),165);assert.equal(pricing((await job()).customer_note).length,2);
  assert.equal((await call('approved')).code,200);assert.equal(Number((await job()).amount_quoted),165,'retry cannot add another charge');
  assert.equal((await job()).work_required,'MOT test\nReplace front brake pads','retry cannot duplicate the authorised task');
  assert.equal((await call('declined')).code,409);
  const second='22222222-2222-4222-8222-222222222223';await add(second);
  assert.equal((await call('declined',await job(),second)).code,200);assert.equal(Number((await job()).amount_quoted),165);
  const third='22222222-2222-4222-8222-222222222224';await add(third);
  await db.query("insert into invoices(id,job_id,status) values($1,$2,'saved')",[id,jobId]);
  assert.equal((await call('approved',await job(),third)).code,409,'issued invoice cannot silently change');
  await db.query('delete from invoices');
  // Any failed job write rolls back the approval as well.
  await db.exec("alter table jobs add constraint test_price_guard check(amount_quoted<200)");
  await assert.rejects(call('approved',await job(),third),/test_price_guard/);
  assert.equal((await db.query('select status from additional_work_approvals where id=$1',[third])).rows[0].status,'pending');
  const perms=(await db.query("select has_function_privilege('anon','public.vecta_decide_progress_work(uuid,uuid,text,jsonb,jsonb)','execute') anon,has_function_privilege('authenticated','public.vecta_decide_progress_work(uuid,uuid,text,jsonb,jsonb)','execute') authenticated")).rows[0];
  assert.deepEqual(perms,{anon:false,authenticated:false});
 }finally{await db.close();}
});
