import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';
import {approvedJobChanges} from '../../lib/approved-work.js';
import {reviewQueue,workshopApprovalList} from '../../lib/progress-approvals.js';
import {portalSnapshot} from '../../lib/customer-portal.js';
const read=f=>readFileSync(f,'utf8'),migration='supabase/migrations/20261112163854_customer_quote_replies.sql';
const jobId='11111111-1111-4111-8111-111111111111',quoteId='22222222-2222-4222-8222-222222222222',replyId='33333333-3333-4333-8333-333333333333';
const tick=()=>new Promise(r=>setImmediate(r));
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table jobs(id uuid primary key,booking_date date,drop_time time,card_type text,status text,archived boolean default false,registration text,customer_email text,customer_phone text,customer_note text,job_type text,work_required text,amount_quoted numeric,vat_mode text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table website_booking_requests(id uuid primary key,job_id uuid,registration text,email text,status text,created_at timestamptz default now(),confirmed_date date,preferred_date_1 date,confirmed_time time,work_required text,customer_preferences jsonb);
 create table additional_work_approvals(id uuid primary key,job_id uuid,registration text,customer_email text,customer_phone text,progress_booking_date date,progress_message text,progress_photo_ids uuid[],progress_from_mechanic boolean,created_at timestamptz default now(),expires_at timestamptz,decided_at timestamptz,status text);
 create table job_workshop_photos(id uuid primary key,job_id uuid,ready boolean default false,deleted_at timestamptz);
 create table invoices(job_id uuid,fleet_job_ids jsonb,status text);
 create table nmuk_service_reminder_sends(id text primary key,job_id text,recipient text,status text,message_payload jsonb,sent_at timestamptz,created_at timestamptz default now());
 create table workshop_messages(id uuid primary key,job_id text,body text,recipient text,occurred_at timestamptz);
 create view workshop_message_history as select ''::text id,''::text job_id,''::text body,''::text status,''::text kind,''::text recipient,now() occurred_at where false;`);
 for(const f of ['20261106070818_workshop_review_estimates.sql','20261109170410_customer_message_approval_work.sql','20261110053559_customer_portal.sql','20261110133720_portal_null_booking_date.sql'])await db.exec(read('supabase/migrations/'+f));
 // Upgrade an existing installation, retaining previous messages and receipts.
 await db.query("insert into jobs(id,booking_date,drop_time,status,registration,customer_email,customer_phone,work_required,amount_quoted,vat_mode) values($1,current_date,'08:00','in_progress','TEST001','driver@example.invalid','','MOT',45,'no_vat')",[jobId]);
 await db.exec(read(migration));
 await db.query("insert into additional_work_approvals(id,job_id,registration,customer_email,customer_phone,progress_booking_date,progress_message,progress_photo_ids,progress_from_mechanic,status,progress_review_state,progress_estimate_pence,expires_at) values($1,$2,'TEST001','driver@example.invalid','',current_date,'Replace front brake pads','{}',true,'pending','sent',12000,now()+interval '1 day')",[quoteId,jobId]);
 const job=async()=>(await db.query('select *,updated_at::text updated_at from jobs where id=$1',[jobId])).rows[0];
 const respond=async(decision,reply='',id=replyId,j)=>{
  j??=await job();const changes=approvedJobChanges(j,{id:quoteId,progress_message:'Replace front brake pads',progress_estimate_pence:12000});
  const expected=Object.fromEntries(['updated_at','work_required','customer_note','amount_quoted','vat_mode'].map(k=>[k,j[k]]));
  return (await db.query('select vecta_respond_progress_quote($1,$2,$3,$4,$5,$6,$7) result',[jobId,quoteId,decision,id,reply,JSON.stringify(expected),JSON.stringify(changes)])).rows[0].result;
 };
 return {db,job,respond};
}

test('accept and refuse save the optional reply atomically; the mechanic receives neither until explicitly forwarded',async()=>{
 for(const decision of ['approved','declined']){
  const {db,job,respond}=await database();try{
   assert.equal((await respond(decision,'Please keep the old parts.')).code,200);
   const [event]=(await db.query("select * from customer_portal_events where kind='approval_response'")).rows;
   assert.equal(event.details.status,decision);assert.equal(event.details.customer_reply,'Please keep the old parts.');assert.equal(event.manager_alert,true);assert.equal(event.mechanic_at,null);
   assert.equal(Number((await job()).amount_quoted),decision==='approved'?165:45);
   assert.equal((await respond(decision,'Please keep the old parts.')).replayed,true);
   assert.equal((await respond(decision,'Different note')).code,409);
   assert.equal((await respond(decision==='approved'?'declined':'approved','Please keep the old parts.')).code,409);
   assert.equal((await db.query("select count(*)::int n from customer_portal_events where kind='approval_response'")).rows[0].n,1);
   const forward=async()=>(await db.query('select vecta_forward_portal_event($1,$2) result',[event.id,event.message])).rows[0].result;
   assert.equal((await forward()).code,200);assert.equal((await forward()).already_forwarded,true);
   assert.ok((await db.query('select mechanic_at from customer_portal_events where id=$1',[event.id])).rows[0].mechanic_at);
   assert.equal(Number((await job()).amount_quoted),decision==='approved'?165:45);
  }finally{await db.close();}
 }
});
test('message-only replies leave approval pending and pricing intact; replay and foreign contact guards hold',async()=>{
 const {db,job,respond}=await database();try{
  assert.equal((await respond(null,'Can this wait until next month?')).code,200);
  assert.equal((await respond(null,'Can this wait until next month?')).replayed,true);
  assert.equal((await respond(null,'Different message')).code,409);
  assert.equal((await db.query('select status from additional_work_approvals')).rows[0].status,'pending');assert.equal(Number((await job()).amount_quoted),45);
  const [event]=(await db.query("select * from customer_portal_events where actor='customer'")).rows;
  assert.equal(event.details.approval_id,quoteId);assert.equal(event.details.quote_description,'Replace front brake pads');assert.equal(event.mechanic_at,null);
  assert.equal((await respond(null,'')).code,400);assert.equal((await respond('approved','x'.repeat(3001))).code,400);
  await db.query("update jobs set customer_email='other@example.invalid'");assert.equal((await respond('approved','')).code,404);
  const perms=(await db.query("select has_function_privilege('anon','vecta_respond_progress_quote(uuid,uuid,text,uuid,text,jsonb,jsonb)','execute') a,has_function_privilege('authenticated','vecta_respond_progress_quote(uuid,uuid,text,uuid,text,jsonb,jsonb)','execute') b")).rows[0];assert.deepEqual(perms,{a:false,b:false});
 }finally{await db.close();}
});
test('failed job or reply writes roll back the entire decision and no notification event escapes',async()=>{
 const {db,job,respond}=await database();try{
  const stale=await job();await db.query("update jobs set work_required='MOT test'");assert.equal((await respond('approved','',replyId,stale)).code,409);
  await db.exec("alter table customer_portal_events add constraint test_reply_guard check (coalesce(details->>'customer_reply','')<>'fail')");
  await assert.rejects(respond('approved','fail'),/test_reply_guard/);
  assert.equal((await db.query('select status from additional_work_approvals')).rows[0].status,'pending');assert.equal(Number((await job()).amount_quoted),45);
  assert.equal((await db.query("select count(*)::int n from customer_portal_events where kind='approval_response'")).rows[0].n,0);
  await db.query("update additional_work_approvals set expires_at=now()-interval '1 day'");assert.equal((await respond('approved','')).code,410);
 }finally{await db.close();}
});
test('mechanic list and fallback queue withhold decisions before forwarding; forwarded reply is non-financial',async()=>{
 const job={id:jobId,registration:'TEST001',booking_date:'2026-11-12',customer_email:'driver@example.invalid',customer_phone:'',status:'in_progress'};
 const row={id:quoteId,job_id:jobId,registration:job.registration,customer_email:job.customer_email,customer_phone:'',progress_booking_date:job.booking_date,progress_message:'Replace pads',progress_photo_ids:[],progress_review_state:'sent',progress_from_mechanic:true,status:'declined',progress_estimate_pence:12000,decided_at:'2026-11-12T12:00:00Z',jobs:job};
 let forwarded=false;
 const db=async path=>path.startsWith('additional_work_approvals')?[row]:path.startsWith('customer_portal_events')?forwarded?[{id:replyId,created_at:'2026-11-12T12:00:00Z',kind:'approval_response',actor:'customer',message:'Replace pads',mechanic_at:'2026-11-12T13:00:00Z',details:{approval_id:quoteId,status:'declined',estimated_pence:12000,customer_reply:'I cannot afford £120 including VAT'}}]:[]:[];
 assert.equal((await workshopApprovalList(db,job,'mechanic')).approvals[0].status,'pending');assert.equal((await reviewQueue(db,'mechanic')).decisions.length,0);
 forwarded=true;assert.equal((await workshopApprovalList(db,job,'mechanic')).approvals[0].status,'declined');assert.equal((await reviewQueue(db,'mechanic')).decisions[0].status,'declined');
 const snapshot=await portalSnapshot(db,{job},{mechanic:true});assert.match(snapshot.events[0].reply,/cannot afford/);assert.doesNotMatch(JSON.stringify(snapshot),/120|estimated|VAT/);
});
function customer(){
 const {document}=parseHTML(read('public/track.html'));document.hidden=false;
 const el=id=>document.getElementById(id),dialog=el('approvalDialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 const calls=[],state={status:'pending',fail:false,hold:null};
 const fetch=async(_url,{body})=>{
  const b=JSON.parse(body);calls.push(b);
  if(b.action.startsWith('approval-')){
   if(state.hold&&b.action!=='approval-status')await state.hold;
   if(state.fail&&b.action!=='approval-status')return Response.json({error:'Connection lost'},{status:503});
   if(b.action==='approval-decide')state.status=b.decision;
   return Response.json({approval:{id:quoteId,message:'Brake pads <img src=x>',estimated_pence:12000,status:state.status,photo_ids:[]}});
  }
  return Response.json({registration:'TEST001',stage:'underway'});
 };
 vm.runInNewContext(read('public/js/vecta-progress.js'),{document,crypto,window:{addEventListener(){}},location:{search:'',hash:'#approval.'+quoteId+'.'+replyId},URLSearchParams,fetch,Intl,Date,AbortSignal,setTimeout(){},clearTimeout(){}});
 return {el,calls,state};
}
test('customer can message only, then accept or refuse with a note; empty text does not block a decision',async()=>{
 for(const decision of ['approved','declined']){
  const h=customer();await tick();h.el('messageQuote').onclick();assert.equal(h.el('quoteReplyFields').hidden,false);
  h.el('quoteReply').value='Can it be ready by 3?';await h.el('sendQuoteMessage').onclick();assert.equal(h.state.status,'pending');assert.equal(h.calls.filter(x=>x.action==='approval-message').length,1);
  assert.match(h.el('approvalStatus').textContent,/not accepted or refused/);
  h.el('messageQuote').onclick();h.el('quoteReply').value='Please keep old parts.';
  await h.el(decision==='approved'?'approveWork':'declineWork').onclick();
  const request=h.calls.find(x=>x.action==='approval-decide');assert.equal(request.reply,'Please keep old parts.');assert.equal(h.el('approvalPanel').dataset.signal,decision==='approved'?'green':'red');assert.equal(h.el('approvalButtons').hidden,true);assert.equal(h.el('approvalMessage').querySelector('img'),null);
 }
 const h=customer();await tick();await h.el('approveWork').onclick();assert.equal(h.calls.find(x=>x.action==='approval-decide').reply,'');
});
test('uncertain customer responses retain note and UUID, block duplicate taps, and cannot switch to a contrary decision',async()=>{
 const h=customer();await tick();h.el('quoteReply').value='Keep the old parts';h.state.fail=true;
 await h.el('approveWork').onclick();assert.equal(h.el('quoteReply').value,'Keep the old parts');assert.equal(h.el('quoteReply').readOnly,true);
 await h.el('declineWork').onclick();assert.equal(h.calls.filter(x=>x.action==='approval-decide').length,1);
 h.state.fail=false;let release;h.state.hold=new Promise(r=>release=r);const pending=h.el('retryApproval').onclick();await tick();await h.el('approveWork').onclick();release();await pending;
 const requests=h.calls.filter(x=>x.action==='approval-decide');assert.equal(requests.length,2);assert.equal(requests[0].reply_id,requests[1].reply_id);assert.equal(requests[0].reply,requests[1].reply);
});
