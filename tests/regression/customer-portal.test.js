import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {bookingRules,portalAccess,portalSnapshot,portalQueue} from '../../lib/customer-portal.js';
import {issueProgressToken,requestTrackingPath,progressSecret} from '../../lib/job-progress.js';
import {confirmationContent} from '../../lib/portal-email.js';
import {customerApproval} from '../../lib/progress-approvals.js';
const migration=readFileSync('supabase/migrations/20261110053559_customer_portal.sql','utf8');
const dateAuditFix=readFileSync('supabase/migrations/20261110133720_portal_null_booking_date.sql','utf8');
const id='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',event='33333333-3333-4333-8333-333333333333';
const job={id,booking_date:'2026-11-12',drop_time:'08:00',registration:'TEST001',customer_email:'driver@example.invalid',status:'booked',work_required:'MOT'};
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table jobs(id uuid primary key,booking_date date,drop_time time,card_type text,status text,archived boolean default false,registration text,customer_email text,customer_note text,work_required text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table website_booking_requests(id uuid primary key,job_id uuid,registration text,email text,status text,created_at timestamptz default now(),confirmed_date date,preferred_date_1 date,confirmed_time time,work_required text,customer_preferences jsonb);
 create table additional_work_approvals(id uuid primary key,job_id uuid,registration text,customer_email text,progress_message text,progress_review_state text,progress_estimate_pence int,progress_from_mechanic boolean,created_at timestamptz default now(),decided_at timestamptz,status text);
 create table invoices(job_id uuid,fleet_job_ids jsonb,status text);
 create table nmuk_service_reminder_sends(id text primary key,job_id text,recipient text,status text,message_payload jsonb,sent_at timestamptz,created_at timestamptz default now());
 create table workshop_messages(id uuid primary key,job_id text,body text,recipient text,occurred_at timestamptz);
 create view workshop_message_history as select ''::text id,''::text job_id,''::text body,''::text status,''::text kind,''::text recipient,now() occurred_at where false;`);
 await db.exec(migration);
 await db.exec(dateAuditFix);
 await db.query("insert into jobs(id,booking_date,drop_time,status,registration,customer_email,work_required) values($1,current_date+3,'08:00','booked','TEST001','driver@example.invalid','MOT')",[id]);
 await db.query("insert into website_booking_requests(id,job_id,registration,email,status,confirmed_date,confirmed_time,work_required) values($1,$2,'TEST001','driver@example.invalid','booked',current_date+3,'08:00','MOT')",[rid,id]);
 return db;
}
async function write(db,kind='message',message='Please call me',eid=event,details={}){
 const [record]=(await db.query('select booking_date::text from jobs where id=$1',[id])).rows;
 return (await db.query('select vecta_customer_portal_write($1,$2,$3,$4,$5,$6,$7,$8) result',[id,rid,eid,'customer',kind,message,JSON.stringify(details),JSON.stringify({registration:'TEST001',email:'driver@example.invalid',booking_date:record.booking_date})])).rows[0].result;
}
test('portal messages are atomic, replay-safe, bounded and private; original booking cannot be overwritten',async()=>{
 const db=await database();try{
  const original=(await db.query('select portal_original from jobs')).rows[0].portal_original;
  assert.equal((await write(db)).code,200);assert.equal((await write(db)).replayed,true);assert.equal((await write(db,'message','Different text')).code,409);
  assert.equal((await db.query('select * from customer_portal_events')).rows.length,1);
  assert.equal((await write(db,'message','','33333333-3333-4333-8333-333333333334')).code,400);
  await db.query("update jobs set booking_date=current_date+7,work_required='MOT and service',portal_original='{}' where id=$1",[id]);
  assert.deepEqual((await db.query('select portal_original from jobs')).rows[0].portal_original,original);
  assert.equal((await db.query("select count(*)::int n from customer_portal_events where kind='booking_update'")).rows[0].n,1);
  const perms=(await db.query("select has_table_privilege('anon','customer_portal_events','select') a,has_table_privilege('authenticated','customer_portal_events','insert') b,has_function_privilege('anon','vecta_customer_portal_write(uuid,uuid,uuid,text,text,text,jsonb,jsonb)','execute') c")).rows[0];assert.deepEqual(perms,{a:false,b:false,c:false});
 }finally{await db.close();}
});
test('cancellation requires a reason, closes request and job together, rejects less than 24h and invoices',async()=>{
 const db=await database();try{
  assert.equal((await write(db,'cancelled','')).code,400);
  await db.query("update jobs set booking_date=(clock_timestamp() at time zone 'Europe/London')::date where id=$1",[id]);
  assert.equal((await write(db,'cancelled','Plans changed')).code,409);
  await db.query('update jobs set booking_date=current_date+3 where id=$1',[id]);
  await db.query("insert into invoices(job_id,status) values($1,'saved')",[id]);
  assert.equal((await write(db,'cancelled','Plans changed')).code,409);await db.exec('delete from invoices');
  assert.equal((await write(db,'cancelled','Plans changed')).code,200);
  assert.equal((await db.query('select status,archived from jobs')).rows[0].status,'cancelled');assert.equal((await db.query('select status from website_booking_requests')).rows[0].status,'cancelled');
  assert.equal((await write(db,'cancelled','Plans changed')).replayed,true);
 }finally{await db.close();}
});
test('ready-to-invoice saves when the planner date is cleared, preserving the original booking',async()=>{
 const db=await database();try{
  const original=(await db.query('select portal_original from jobs where id=$1',[id])).rows[0].portal_original;
  await db.query("update jobs set booking_date=null,status='ready_to_invoice' where id=$1",[id]);
  const saved=(await db.query('select booking_date,status,portal_original from jobs where id=$1',[id])).rows[0];
  assert.equal(saved.status,'ready_to_invoice');assert.equal(saved.booking_date,null);assert.deepEqual(saved.portal_original,original);
  const events=(await db.query('select kind,actor,message,details from customer_portal_events where job_id=$1',[id])).rows;
  assert.deepEqual(events,[{kind:'booking_update',actor:'workshop',message:'Workshop progress updated.',details:{booking_date:null,work_required:'MOT',status:'ready_to_invoice'}}]);
  await db.query("update jobs set booking_date=null,status='ready_to_invoice' where id=$1",[id]);
  assert.equal((await db.query('select count(*)::int n from customer_portal_events where job_id=$1',[id])).rows[0].n,1);
 }finally{await db.close();}
});
test('portal audit handles clearing, restoring and changing dates and edits on undated jobs',async()=>{
 const db=await database();try{
  await db.query('update jobs set booking_date=null where id=$1',[id]);
  await db.query("update jobs set work_required='MOT and service' where id=$1",[id]);
  await db.query("update jobs set booking_date='2026-11-20' where id=$1",[id]);
  await db.query("update jobs set booking_date='2026-11-21' where id=$1",[id]);
  await db.query("update jobs set status='in_progress' where id=$1",[id]);
  assert.deepEqual((await db.query('select message from customer_portal_events where job_id=$1 order by seq',[id])).rows.map(x=>x.message),[
   'Booking date cleared.','Booked work updated.','Booking date updated to 20/11/2026.','Booking date updated to 21/11/2026.','Workshop progress updated.'
  ]);
  const access=(await db.query("select has_function_privilege('anon','vecta_portal_job_audit()','execute') a,has_function_privilege('authenticated','vecta_portal_job_audit()','execute') b")).rows[0];
  assert.deepEqual(access,{a:false,b:false});
 }finally{await db.close();}
});
test('preferences persist for both records and forwarding is idempotent without changing financial data',async()=>{
 const db=await database();try{
  const prefs={version:1,parts:'oem',serious_repairs:'change_parts'};
  assert.equal((await write(db,'preferences','Pre-authorised',event,{preferences:prefs})).code,200);
  const saved=(await db.query('select * from jobs')).rows[0];assert.deepEqual(globalThis.VectaBookingRules.customerPreferences(saved),prefs);assert.equal(saved.work_required,'MOT');
  const forward=async()=>(await db.query('select vecta_forward_portal_event($1,$2) result',[event,'Pre-authorised'])).rows[0].result;
  assert.equal((await forward()).code,200);assert.equal((await forward()).already_forwarded,true);
  assert.equal((await db.query('select count(*)::int n from customer_portal_events where mechanic_at is not null')).rows[0].n,1);
 }finally{await db.close();}
});
test('only approvals originating with mechanics automatically alert mechanics; all decisions alert the owner',async()=>{
 const db=await database();try{
  for(const [i,from,status]of [[1,true,'approved'],[2,false,'approved'],[3,true,'declined']]){
   await db.query("insert into additional_work_approvals(id,job_id,registration,customer_email,progress_message,progress_review_state,progress_estimate_pence,progress_from_mechanic,status,decided_at) values($1,$2,'TEST001','driver@example.invalid','Brake pads','sent',12000,$3,$4,now())",[`44444444-4444-4444-8444-44444444444${i}`,id,from,status]);
  }
  const rows=(await db.query("select * from customer_portal_events where kind='approval_response'")).rows;
  assert.equal(rows.length,3);assert.equal(rows.filter(x=>x.manager_alert).length,3);assert.equal(rows.filter(x=>x.mechanic_at).length,1);
 }finally{await db.close();}
});
test('24-hour cutoff uses London daylight saving and exact appointment time; scenes are booking-day only',()=>{
 const context={job:{...job,booking_date:'2026-07-15'},request:{confirmed_time:'09:30:00'}};
 assert.equal(bookingRules(context,Date.parse('2026-07-14T08:30:00Z')).can_cancel,true);
 assert.equal(bookingRules(context,Date.parse('2026-07-14T08:30:01Z')).can_cancel,false);
 assert.equal(bookingRules(context,Date.parse('2026-07-14T09:00:00Z')).images_allowed,false);
 assert.equal(bookingRules(context,Date.parse('2026-07-15T09:00:00Z')).images_allowed,true);
 assert.equal(bookingRules(context,Date.parse('2026-07-16T09:00:00Z')).images_allowed,false);
});
test('confirmation is HTML with HERE button, optional inline image and an accessible text alternative',()=>{
 const content=confirmationContent({...job,vehicle:'Nissan Qashqai',amount_quoted:45,vat_mode:'no_vat'},'https://www.vectamotors.co.uk/track#private','base64image');
 assert.match(content.html,/>HERE<\/a>/);assert.match(content.html,/personalised customer portal/);assert.match(content.html,/cid:booking-vehicle/);assert.equal(content.attachments[0].content_id,'booking-vehicle');assert.match(content.text,/24 hours/);assert.match(content.text,/45.00 \(no VAT\)/);
 const {document}=parseHTML(content.html);const portalLink=[...document.querySelectorAll('a')].find(a=>a.textContent==='customer portal');assert.equal(portalLink?.getAttribute('href'),'https://www.vectamotors.co.uk/track#private');assert.match(content.text,/contact you via your customer portal for authorisation first/);
 const without=confirmationContent(job,'https://www.vectamotors.co.uk/track#private');assert.doesNotMatch(without.html,/cid:booking-vehicle/);assert.match(without.html,/cid:booking-logo/);assert.equal(without.attachments.length,1);assert.equal(without.attachments[0].content_id,'booking-logo');
});

test('workshop queues exclude reassigned customer records and mechanics receive decisions without prices',async()=>{
 const events=[{id:event,seq:1,job_id:id,registration:'TEST001',customer_email:'driver@example.invalid',actor:'customer',kind:'approval_response',message:'Replace two tyres for £120 or 120 pounds',details:{status:'approved',estimated_pence:12000},mechanic_at:'2026-11-10T09:00:00Z',created_at:'2026-11-10T09:00:00Z'},
 {id:rid,seq:2,job_id:rid,registration:'OLD001',customer_email:'old@example.invalid',actor:'customer',kind:'message',message:'Old private message',details:{},created_at:'2026-11-10T09:01:00Z'}];
 const db=async path=>{const u=new URL(path,'https://test.invalid');if(u.pathname==='/customer_portal_events'){assert.equal(u.searchParams.get('mechanic_at'),'not.is.null');return events;}if(u.pathname==='/jobs')return [job,{id:rid,registration:'NEW001',customer_email:'new@example.invalid'}];throw Error(path);};
 const result=await portalQueue(db,'mechanic');assert.equal(result.events.length,1);assert.equal(result.events[0].decision,'approved');assert.equal(result.events[0].details,undefined);assert.doesNotMatch(result.events[0].message,/120/);assert.match(result.events[0].message,/two tyres/);
});

test('owner popup forwards a saved message; mechanic popup displays green authorisation without owner controls',async()=>{
 for(const mechanic of [false,true]){
  const {document}=parseHTML('<html><body><main class="main"><header class="top"></header></main></body></html>');document.hidden=false;
  const events=[{id:event,job_id:id,registration:'TEST001',kind:'approval_response',actor:'customer',message:'Replace brake pads',created_at:'2026-11-10T09:00:00Z',...(mechanic?{decision:'approved',forwarded:true}:{details:{status:'approved',estimated_pence:12000}})}];
  const requests=[],timers=[],listeners=new Map();let refreshed=0;
  const window={VECTA_MECHANIC_DEPLOYMENT:mechanic,vectaRefreshPortalJobs:async()=>{refreshed++;},addEventListener:(n,fn)=>listeners.set(n,fn),dispatchEvent:e=>listeners.get(e.type)?.()};
  const context={window,document,location:{search:''},navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},Intl,Date,Event,URLSearchParams,AbortSignal,setInterval:fn=>timers.push(fn),fetch:async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return {ok:true,json:async()=>body.action==='portal-queue'?{events}:{ok:true}};}};
  vm.runInNewContext(readFileSync('public/js/vecta-portal-workshop.js','utf8'),context);await new Promise(r=>setImmediate(r));
  const popup=document.querySelector('.portalWorkshopPopup');assert.equal(popup.hidden,false);assert.match(popup.textContent,/Work authorised/);assert.equal(popup.querySelector('article').dataset.signal,'green');assert.equal(refreshed,1);
  const forward=[...popup.querySelectorAll('button')].find(b=>b.textContent==='Send to mechanic');
  if(mechanic){assert.equal(forward,undefined);assert.doesNotMatch(popup.textContent,/120/);}else{assert.ok(forward);await forward.onclick();assert.ok(requests.some(r=>r.action==='portal-forward'&&r.event_id===event));assert.equal(forward.textContent,'Sent to mechanic');}
 }
});

test('an approval portal can view another published request for the same customer, never another job; cancellation keeps its receipt only',async()=>{
 const nonce='55555555-5555-4555-8555-555555555555',token='approval.'+event+'.'+nonce,now=Date.parse('2026-11-10T09:00:00Z');
 const base={id:event,job_id:id,registration:job.registration,customer_email:job.customer_email,progress_booking_date:job.booking_date,progress_review_state:'sent',progress_message:'Brake pads',status:'pending',expires_at:'2099-01-01T00:00:00Z',token:'progress:'+nonce};
 let saved={...job},second={...base,id:rid,progress_message:'Wiper blades'};
 const db=async path=>{const u=new URL(path,'https://test.invalid');if(u.pathname==='/jobs')return [saved];if(u.pathname==='/website_booking_requests')return [];if(u.pathname==='/additional_work_approvals')return [u.searchParams.get('id')==='eq.'+event?base:second];throw Error(path);};
 assert.equal((await customerApproval(db,{action:'approval-status',token,approval_id:rid})).approval.message,'Wiper blades');
 second={...second,job_id:rid};await assert.rejects(customerApproval(db,{action:'approval-status',token,approval_id:rid}),/no longer available/);
 saved={...saved,status:'cancelled',archived:true};assert.equal((await portalAccess(db,token,now)).job.status,'cancelled');await assert.rejects(customerApproval(db,{action:'approval-decide',token,approval_id:event,decision:'approved'}),/no longer available/);
 saved={...saved,customer_email:'replacement@example.invalid'};await assert.rejects(portalAccess(db,token,now),/no longer available/);
});

test('approval controls and authorised work stay in dated conversation order, with no separate top banner',async()=>{
 const {document}=parseHTML(readFileSync('public/track.html','utf8'));document.hidden=false;
 const opened=[],timers=[];
 const requested={id:'request-event',seq:1,kind:'approval_request',actor:'workshop',message:'Replace front brake pads',created_at:'2026-11-10T09:00:00Z',details:{approval_id:event,status:'pending',estimated_pence:12000}};
 const approved={id:'decision-event',seq:3,kind:'approval_response',actor:'customer',message:requested.message,created_at:'2026-11-10T10:15:00Z',details:{approval_id:event,status:'approved',estimated_pence:12000}};
 const message={id:'message-event',seq:2,kind:'message',actor:'customer',message:'Please keep the old parts.',created_at:'2026-11-10T09:45:00Z',details:{}};
 let data={booking:{registration:'TEST001',booking_date:'2026-11-13',can_message:true,can_amend:true,can_cancel:true,cancellation_deadline:'2026-11-12T08:00:00Z'},preferences:null,original:{created_at:'2026-11-10T08:00:00Z',booking_date:'2026-11-13',work_required:'MOT'},events:[requested],approvals:[{id:event,message:requested.message,status:'pending'}]};
 const window={addEventListener(){},VectaProgressApproval:{open:id=>opened.push(id)}};
 vm.runInNewContext(readFileSync('public/js/vecta-customer-portal.js','utf8'),{document,window,location:{hash:'#private-link',search:''},Intl,Date,URLSearchParams,AbortSignal,clearTimeout(){},setTimeout:fn=>timers.push(fn),fetch:async()=>({ok:true,json:async()=>data})});
 await new Promise(r=>setImmediate(r));
 const history=document.getElementById('portalHistory'),top=document.getElementById('customerPortal');
 assert.equal(top.querySelector('.portalApproval'),null);assert.equal(document.getElementById('portalApprovals'),null);
 assert.equal(history.querySelector('button').textContent,'View request & respond');history.querySelector('button').onclick();assert.equal(opened.at(-1),event);
 data={...data,events:[approved,message,requested],approvals:[{...data.approvals[0],status:'approved'}]};await window.VectaCustomerPortal.refresh();
 assert.deepEqual([...history.children].map(c=>c.dataset.eventId),['request-event','message-event','decision-event']);
 const decision=history.lastElementChild;assert.equal(decision.dataset.signal,'green');assert.match(decision.textContent,/Authorised/);assert.equal(decision.querySelector('time').dateTime,approved.created_at);
 assert.equal(history.firstElementChild.querySelector('button'),null);assert.equal(decision.querySelector('button').textContent,'View work details');assert.equal(top.querySelector('.portalApproval'),null);
 await window.VectaCustomerPortal.refresh();assert.equal(history.children.length,3,'refresh must not duplicate the authorisation');
});

test('a failed job-card refresh keeps the approval alert visible and retries until this device has the saved work',async()=>{
 const {document}=parseHTML('<html><body><main class="main"><header class="top"></header></main></body></html>');document.hidden=false;
 const events=[{id:event,job_id:id,registration:'TEST001',kind:'approval_response',actor:'customer',message:'Replace brake pads',created_at:'2026-11-10T09:00:00Z',decision:'approved',forwarded:true}];
 const timers=[];let refreshes=0;
 const window={VECTA_MECHANIC_DEPLOYMENT:true,addEventListener(){},vectaRefreshPortalJobs:async()=>{refreshes++;if(refreshes===1)throw Error('Offline');return refreshes>2;}};
 vm.runInNewContext(readFileSync('public/js/vecta-portal-workshop.js','utf8'),{window,document,location:{search:''},navigator:{onLine:true},localStorage:{getItem:()=>null},Intl,Date,Event,URLSearchParams,AbortSignal,setInterval:fn=>timers.push(fn),fetch:async()=>({ok:true,json:async()=>({events})})});
 await new Promise(r=>setImmediate(r));const popup=document.querySelector('.portalWorkshopPopup');assert.equal(popup.hidden,false);assert.match(popup.textContent,/Work authorised/);assert.match(popup.textContent,/Reconnecting/);
 await timers[0]();assert.equal(refreshes,2);assert.match(popup.textContent,/Reconnecting/,'an uninitialised database must also retry');
 await timers[0]();assert.equal(refreshes,3);assert.doesNotMatch(popup.textContent,/Reconnecting/);assert.match(popup.textContent,/Work authorised/);
 await timers[0]();assert.equal(refreshes,3,'successful refresh is not repeated without a new event');
});
