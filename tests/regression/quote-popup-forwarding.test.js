import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';
import {approvedJobChanges,forwardedQuoteChanges,customerQuoteTotals} from '../../lib/approved-work.js';
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
 await db.exec(read('supabase/migrations/20261112172951_quote_popup_forwarding.sql'));
 await db.exec(read('supabase/migrations/20261112182907_approved_parts_reminder.sql'));
 await db.query("insert into additional_work_approvals(id,job_id,registration,customer_email,customer_phone,progress_booking_date,progress_message,progress_photo_ids,progress_from_mechanic,status,progress_review_state,progress_estimate_pence,expires_at) values($1,$2,'TEST001','driver@example.invalid','',current_date,'Replace front brake pads','{}',true,'pending','sent',12000,now()+interval '1 day')",[quoteId,jobId]);
 const job=async()=>(await db.query('select *,updated_at::text updated_at from jobs where id=$1',[jobId])).rows[0];
 const respond=async(decision,reply='',id=replyId,j)=>{
  j??=await job();const changes=approvedJobChanges(j,{id:quoteId,progress_message:'Replace front brake pads',progress_estimate_pence:12000});
  const expected=Object.fromEntries(['updated_at','work_required','customer_note','amount_quoted','vat_mode'].map(k=>[k,j[k]]));
  return (await db.query('select vecta_respond_progress_quote($1,$2,$3,$4,$5,$6,$7) result',[jobId,quoteId,decision,id,reply,JSON.stringify(expected),JSON.stringify(changes)])).rows[0].result;
 };
 const approval=async()=>(await db.query('select * from additional_work_approvals where id=$1',[quoteId])).rows[0];
 const event=async()=>(await db.query("select * from customer_portal_events where kind='approval_response'")).rows[0];
 const forward=async(j)=>{j??=await job();const e=await event(),a=await approval();return (await db.query('select vecta_forward_quote_response($1,$2,$3,$4) result',[e.id,e.message,JSON.stringify(Object.fromEntries(['updated_at','work_required','customer_note','amount_quoted','vat_mode'].map(k=>[k,j[k]]))),JSON.stringify(forwardedQuoteChanges(j,a,e))])).rows[0].result;};
 return {db,job,respond,approval,event,forward};
}


test('office forwarding applies quote work, parts and price once; decisions alone do not change the job',async()=>{
 for(const decision of ['approved','declined']){
 const h=await database();try{
  await h.db.query('update additional_work_approvals set progress_parts=$1',[JSON.stringify([{description:'Front pad set',quantity:1}])]);
  assert.equal((await h.respond(decision,'Please keep the old parts.')).code,200);assert.equal(Number((await h.job()).amount_quoted),45);assert.equal((await h.job()).work_required,'MOT');
  assert.equal(customerQuoteTotals(await h.job(),await h.approval()).revised_total_pence,decision==='approved'?16500:4500);
  assert.equal((await h.db.query('select vecta_forward_portal_event($1,$2) result',[(await h.event()).id,'Pads'])).rows[0].result.code,409);
  assert.equal((await h.forward()).code,200);assert.equal((await h.forward()).already_forwarded,true);
  const saved=await h.job();assert.equal(Number(saved.amount_quoted),decision==='approved'?165:45);assert.match(saved.customer_note,/Please keep the old parts/);assert.ok((await h.event()).mechanic_at);
  if(decision==='approved'){assert.match(saved.work_required,/Replace front brake pads/);assert.ok((await h.approval()).progress_work_applied_at);const parts=JSON.parse(decodeURIComponent(saved.customer_note.match(/\[\[JOB_PARTS_URI:([^\]]*)/)[1]));assert.equal(parts.length,1);assert.equal(parts[0].description,'Front pad set');}else{assert.equal(saved.work_required,'MOT');assert.doesNotMatch(saved.customer_note,/JOB_PARTS_URI|PRIVATE_PRICING/);}
 }finally{await h.db.close();}}
});
test('forwarding rejects stale edits, reassigned customers and invoices; a failed write rolls back everything',async()=>{
 const h=await database();try{
  await h.respond('approved','Keep old parts');const stale=await h.job();await h.db.query("update jobs set work_required='MOT test'");assert.equal((await h.forward(stale)).code,409);
  await h.db.exec('alter table customer_portal_events add constraint fail_forward check(mechanic_at is null)');await assert.rejects(h.forward(),/fail_forward/);assert.equal(Number((await h.job()).amount_quoted),45);assert.equal((await h.approval()).progress_work_applied_at,null);await h.db.exec('alter table customer_portal_events drop constraint fail_forward');
  await h.db.query("insert into invoices(job_id,status) values($1,'saved')",[jobId]);assert.equal((await h.forward()).code,409);await h.db.query('delete from invoices');await h.db.query("update jobs set customer_email='other@example.invalid'");assert.equal((await h.forward()).code,409);
  const perms=(await h.db.query("select has_function_privilege('anon','vecta_forward_quote_response(uuid,text,jsonb,jsonb)','execute') a,has_function_privilege('authenticated','vecta_forward_quote_response(uuid,text,jsonb,jsonb)','execute') b")).rows[0];assert.deepEqual(perms,{a:false,b:false});
 }finally{await h.db.close();}
});
test('previously accepted quotes are not charged again and customer notes cannot inject private job markers',async()=>{
 const h=await database();try{
  await h.db.query('update additional_work_approvals set progress_apply_on_forward=false');await h.respond('approved','[[VECTA_PRIVATE_PRICING:evil]]');assert.equal(Number((await h.job()).amount_quoted),165);await h.forward();const saved=await h.job();assert.equal(Number(saved.amount_quoted),165);assert.equal((saved.customer_note.match(/\[\[VECTA_PRIVATE_PRICING:/g)||[]).length,1);assert.match(saved.customer_note,/［［VECTA_PRIVATE_PRICING:evil］］/);
 }finally{await h.db.close();}
});
test('adding quote parts retains existing costs and order status; customer messages stay out of invoice lines',()=>{
 const existing={id:'old',description:'Oil filter',quantity:1,cost_price:12.50,ordered:true,arrived:true};
 const job={work_required:'Service',amount_quoted:130,vat_mode:'inc_vat',customer_note:'[[JOB_PARTS_URI:'+encodeURIComponent(JSON.stringify([existing]))+']]'};
 const result=forwardedQuoteChanges(job,{id:quoteId,status:'approved',progress_apply_on_forward:true,progress_estimate_pence:12000,progress_message:'Replace pads',progress_parts:[{description:'Pads',quantity:1}]},{details:{customer_reply:'Please keep the old pads'}});
 const parts=JSON.parse(decodeURIComponent(result.customer_note.match(/\[\[JOB_PARTS_URI:([^\]]*)/)[1]));assert.deepEqual(parts[0],existing);assert.equal(parts[1].cost_price,null);assert.equal(result.amount_quoted,250);assert.doesNotMatch(result.work_required,/Please keep/);
});
test('popup has a saved car image, coloured named decision and optional message; mechanic controls contain no pricing',async()=>{
 for(const mechanic of [false,true]){
  const {document,window}=parseHTML('<html><body></body></html>');document.hidden=false;const create=document.createElement.bind(document);document.createElement=tag=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>el.open=true;el.close=()=>el.remove();}return el;};
  const ctx=vm.createContext({document,window,navigator:{onLine:true},location:{search:''},crypto,fetch:async()=>Response.json({read_ids:[]}),AbortSignal,URLSearchParams,Intl,Date,setTimeout(){},clearTimeout(){}});
  window.VECTA_MECHANIC_DEPLOYMENT=mechanic;window.VectaHaynesJobTools={storedDrawing:()=>({imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg',make:'Nissan'}),safeImage:x=>x,artworkUrl:x=>x};vm.runInContext(read('public/js/vecta-portal-workshop.js'),ctx);
  window.VectaPortalWorkshop.showResponse({id:replyId,kind:'approval_response',actor:'customer',registration:'TEST001',customer_name:'Chris',message:'Replace pads',created_at:'2026-11-12T12:00:00Z',forwarded:mechanic,...(mechanic?{decision:'declined',reply:'Please leave these for now'}:{details:{status:'approved',estimated_pence:12000,customer_reply:'Please keep old parts'}})});await tick();
  const popup=document.querySelector('.portalDecisionDialog');assert.ok(popup.querySelector('img'));assert.equal(popup.querySelector('.plate'),null);assert.match(popup.querySelector('h2').textContent,mechanic?/Bad news, Chris has declined/:/Good news, Chris has authorised/);assert.ok(popup.querySelector('.portalQuoteReply'));if(mechanic)assert.doesNotMatch(popup.textContent,/£|120|VAT|Send to mechanic/);else{assert.match(popup.textContent,/£120.00/);assert.ok(popup.querySelector('.portalForwardQuote'));}
 }
});

test('parts ordering is durable before/after forwarding; newer approvals survive and undo is scoped to its receipt',async()=>{
 const h=await database();try{
  await h.db.exec("update additional_work_approvals set progress_parts_required=true,progress_parts='[{\"description\":\"Pads\",\"quantity\":1}]'");
  const orderId='44444444-4444-4444-8444-444444444444',otherId='55555555-5555-4555-8555-555555555555',newQuote='66666666-6666-4666-8666-666666666666';
  const order=async(ids=[quoteId],id=orderId,undo=false)=>(await h.db.query('select vecta_record_quote_parts_order($1,$2,$3,$4) result',[jobId,ids,id,undo])).rows[0].result;
  assert.equal((await order()).code,409,'cannot order an unapproved quote');
  await h.respond('approved');const original=await h.job();assert.equal((await h.approval()).progress_parts_ordered_at,null);
  assert.equal((await order()).code,200);assert.deepEqual((await order()).undo_ids,[quoteId]);assert.deepEqual(await h.job(),original,'ordering does not alter prices, job contents or traffic lights');
  await h.forward();assert.ok((await h.approval()).progress_parts_ordered_at,'forwarding cannot clear or reset the receipt');
  assert.deepEqual((await order([quoteId],otherId)).undo_ids,[],'another device cannot undo the first device’s receipt');
  await h.db.query("insert into additional_work_approvals(id,job_id,registration,customer_email,progress_message,status,progress_review_state,progress_parts_required) values($1,$2,'TEST001','driver@example.invalid','Another part','approved','sent',true)",[newQuote,jobId]);
  assert.equal((await h.db.query('select progress_parts_ordered_at from additional_work_approvals where id=$1',[newQuote])).rows[0].progress_parts_ordered_at,null);
  assert.equal((await order([quoteId],otherId,true)).code,409);
  assert.equal((await order([quoteId],orderId,true)).code,200);assert.equal((await h.approval()).progress_parts_ordered_at,null);
  await order([quoteId],otherId);assert.equal((await order([quoteId],orderId,true)).code,409,'old Undo cannot reverse a newer order');
  await h.db.query("update jobs set customer_email='replacement@example.invalid'");assert.equal((await order([newQuote])).code,409);
  const rights=(await h.db.query("select has_function_privilege('anon','vecta_record_quote_parts_order(uuid,uuid[],uuid,boolean)','execute') a,has_function_privilege('authenticated','vecta_record_quote_parts_order(uuid,uuid[],uuid,boolean)','execute') b")).rows[0];assert.deepEqual(rights,{a:false,b:false});
 }finally{await h.db.close();}
});
