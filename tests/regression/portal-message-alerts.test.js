import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {PGlite} from '@electric-sql/pglite';
import {portalWrite,portalSnapshot} from '../../lib/customer-portal.js';
import {sendCustomerPortalAlerts,retryCustomerPortalAlerts,portalAlertReceipts} from '../../lib/portal-message-alerts.js';
import handler from '../../lib/job-progress-handler.js';
const jobId='11111111-1111-4111-8111-111111111111',eventId='22222222-2222-4222-8222-222222222222';
const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const job={id:jobId,registration:'ALERT01',booking_date:date,status:'booked',customer_name:'Sam Smith',customer_email:'sam@example.invalid',customer_phone:'07700 900123'};
function setup(t,preview=false){
 const vars={VERCEL_ENV:preview?'preview':'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example',VITE_SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'test-key',VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY:'test-key',RESEND_API_KEY:'test-email',WHATSAPP_ACCESS_TOKEN:'test-wa',WHATSAPP_PHONE_NUMBER_ID:'123456',WHATSAPP_APPROVAL_TEMPLATE:'approval_template',WHATSAPP_PORTAL_TEMPLATE:'portal_template',WHATSAPP_GRAPH_VERSION:'v23.0',VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'test-password'};
 const old=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]]));Object.assign(process.env,vars);
 const original=global.fetch;t.after(()=>{global.fetch=original;for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const s={job:{...job},events:[],alert:null,ledgers:new Map(),emails:[],whatsapps:[],preference:'WhatsApp'};
 s.enqueue=()=>{s.alert??={event_id:eventId,job_id:jobId,registration:job.registration,customer_email:job.customer_email,customer_phone:job.customer_phone,customer_name:job.customer_name,booking_date:date,created_at:new Date().toISOString(),email_status:'queued',whatsapp_status:'queued',attempts:0,next_attempt_at:new Date(0).toISOString(),lease_until:null};};
 const ledger=(params,opts,data)=>{
  const id=params.get('id')?.slice(3)||data?.id;
  const row=s.ledgers.get(id);
  if(opts.method==='POST'){if(row){if(opts.headers?.Prefer?.includes('ignore-duplicates'))return [];throw Object.assign(Error('duplicate'),{status:409});}s.ledgers.set(id,{...data,created_at:new Date().toISOString()});return [s.ledgers.get(id)];}
  if(opts.method==='PATCH'){if(!row||params.has('status')&&row.status!==params.get('status').slice(3))return [];Object.assign(row,data);return [row];}
  return row?[{...row}]:[];
 };
 s.db=async(path,opts={})=>{
  const u=new URL(path,'https://database.example'),p=u.searchParams,data=opts.body&&JSON.parse(opts.body);
  if(u.pathname==='/rpc/vecta_customer_portal_write'){
   const replayed=!!s.events.length;if(!replayed)s.events.push({id:data.p_id,job_id:data.p_job_id,actor:data.p_actor,kind:data.p_kind,message:data.p_message,details:{},created_at:new Date().toISOString(),seq:1});s.enqueue();return {code:200,event_id:data.p_id,replayed};
  }
  if(u.pathname==='/customer_portal_alerts'){
   if(!s.alert)return [];
   if(p.has('event_id')&&!p.get('event_id').includes(s.alert.event_id))return [];
   if(opts.method==='PATCH'){
    if(p.has('attempts')&&Number(p.get('attempts').slice(3))!==s.alert.attempts||p.has('lease_id')&&p.get('lease_id').slice(3)!==s.alert.lease_id)return [];
    if(p.has('or')&&s.alert.lease_until&&Date.parse(s.alert.lease_until)>Date.now())return [];
    if(s.failStatusSave&&data.email_status)throw Error('status record unavailable');
    Object.assign(s.alert,data);return [{...s.alert}];
   }
   return [{...s.alert}];
  }
  if(u.pathname==='/jobs')return [{...s.job}];
  if(u.pathname==='/nmuk_service_reminder_sends')return ledger(p,opts,data);
  if(u.pathname==='/workshop_settings')return [];
  if(u.pathname==='/website_booking_requests')return [{registration:s.job.registration,email:s.job.customer_email,phone:s.job.customer_phone,contact_preference:s.preference}];
  if(u.pathname==='/customer_portal_events')return s.events;
  if(u.pathname==='/additional_work_approvals')return [];
  throw Error('Unexpected database route '+u.pathname);
 };
 global.fetch=async(url,opts={})=>{
  const u=new URL(url),data=opts.body&&JSON.parse(opts.body);
  if(u.hostname==='api.resend.com'){assert.ok(s.alert,'message must be durably queued before delivery');s.emails.push(data);if(s.emailTimeout)throw Error('network timeout');return s.emailResponse||Response.json({id:'email-receipt'});}
  if(u.hostname==='graph.facebook.com'){assert.ok(s.alert);s.whatsapps.push(data);if(s.waTimeout)throw Error('network timeout');return s.waResponse||Response.json({messages:[{id:'wamid.receipt'}]});}
  assert.equal(u.pathname,'/rest/v1/nmuk_service_reminder_sends');
  try{return Response.json(ledger(u.searchParams,opts,data));}catch{return Response.json({error:'duplicate'},{status:409});}
 };
 return s;
}
test('each workshop reply is saved first and independently alerts email and WhatsApp once',async t=>{
 const s=setup(t),body={id:eventId,message:'Your car needs attention. Private details stay in the portal.'};
 for(let n=0;n<2;n++){
  const result=await portalWrite(s.db,{job:s.job},body,'workshop');assert.equal(result.ok,true);assert.deepEqual(result.alerts.channels,{email:'sent',whatsapp:'sent'});
 }
 assert.equal(s.events.length,1);assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,1);
 assert.match(s.emails[0].text,/new message in your Vecta customer portal that needs your attention/);assert.doesNotMatch(s.emails[0].text,/Private details/);
 const {document}=parseHTML(s.emails[0].html),link=document.querySelector('a');assert.equal(link.textContent,'HERE');assert.equal(new URL(link.href).pathname,'/track');
 assert.equal(s.whatsapps[0].template.name,'portal_template');assert.equal(s.whatsapps[0].template.components[1].parameters[0].text,new URL(link.href).hash.slice(1));
 assert.ok(s.ledgers.has('portal-email:'+eventId));assert.ok(s.ledgers.has('portal-wa:'+eventId));
});
test('a rejected email does not prevent WhatsApp; retry only resends the failed channel',async t=>{
 const s=setup(t);s.enqueue();s.emailResponse=Response.json({message:'Domain not verified'},{status:403});
 assert.deepEqual((await sendCustomerPortalAlerts(s.db,eventId)).channels,{email:'failed',whatsapp:'sent'});
 s.emailResponse=null;
 assert.deepEqual((await sendCustomerPortalAlerts(s.db,eventId,{retry:true})).channels,{email:'sent',whatsapp:'sent'});
 assert.equal(s.emails.length,2);assert.equal(s.whatsapps.length,1);
});
test('timeouts and simultaneous retries never resend an uncertain or accepted notification',async t=>{
 const s=setup(t);s.enqueue();s.emailTimeout=s.waTimeout=true;
 await Promise.all([sendCustomerPortalAlerts(s.db,eventId),sendCustomerPortalAlerts(s.db,eventId)]);
 assert.deepEqual((await sendCustomerPortalAlerts(s.db,eventId,{retry:true})).channels,{email:'pending',whatsapp:'pending'});
 assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,1);
});
test('provider ledgers reconcile a lost status update without duplicating either alert',async t=>{
 const s=setup(t);s.enqueue();s.failStatusSave=true;
 await sendCustomerPortalAlerts(s.db,eventId);assert.equal(s.alert.email_status,'queued');
 s.alert.lease_until=new Date(0).toISOString();s.failStatusSave=false;
 await sendCustomerPortalAlerts(s.db,eventId,{retry:true});
 assert.equal(s.alert.email_status,'sent');assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,1);
});
test('missing portal template produces an explicit manual WhatsApp action, never a false sent status',async t=>{
 const s=setup(t);s.enqueue();delete process.env.WHATSAPP_PORTAL_TEMPLATE;
 const result=await sendCustomerPortalAlerts(s.db,eventId);assert.equal(result.channels.email,'sent');assert.equal(result.channels.whatsapp,'manual');assert.match(result.manual_url,/^https:\/\/wa.me\/447700900123\?text=/);assert.match(decodeURIComponent(result.manual_url),/needs your attention/);assert.equal(s.whatsapps.length,0);
 const [reopened]=await portalAlertReceipts(s.db,s.job,[{id:eventId,actor:'workshop',kind:'message'}]);assert.equal(reopened.manual_url,result.manual_url);
 s.preference='Email';assert.equal((await portalAlertReceipts(s.db,s.job,[{id:eventId,actor:'workshop',kind:'message'}]))[0].manual_url,undefined);
});
test('missing contacts, declined WhatsApp permission and Test are explicit, with no unintended sends',async t=>{
 const s=setup(t);s.enqueue();s.preference='Email';
 assert.equal((await sendCustomerPortalAlerts(s.db,eventId)).channels.whatsapp,'no_permission');assert.equal(s.whatsapps.length,0);
 s.job.customer_email=s.alert.customer_email='';s.job.customer_phone=s.alert.customer_phone='';s.alert.email_status=s.alert.whatsapp_status='queued';s.ledgers.clear();
 assert.deepEqual((await sendCustomerPortalAlerts(s.db,eventId,{retry:true})).channels,{email:'missing_contact',whatsapp:'missing_contact'});
});
test('Test suppresses both providers and real WhatsApp links',async t=>{
 const s=setup(t,true);s.enqueue();const result=await sendCustomerPortalAlerts(s.db,eventId);assert.deepEqual(result.channels,{email:'test',whatsapp:'test'});assert.equal(result.manual_url,undefined);assert.equal(s.emails.length+s.whatsapps.length,0);
});
test('contact replacement, wrong job IDs and cancelled bookings cannot send old customer alerts',async t=>{
 const s=setup(t);s.enqueue();
 await assert.rejects(sendCustomerPortalAlerts(s.db,eventId,{jobId:eventId}),/unavailable/);
 for(const changes of [{customer_email:'other@example.invalid'},{customer_phone:'07700 900999'},{registration:'OTHER'}]){Object.assign(s.job,job,changes);const r=await sendCustomerPortalAlerts(s.db,eventId,{retry:true});assert.equal(r.channels.email,'contact_changed');}
 Object.assign(s.job,job,{status:'cancelled'});assert.equal((await sendCustomerPortalAlerts(s.db,eventId)).channels.email,'closed');assert.equal(s.emails.length+s.whatsapps.length,0);
});
test('the scheduled retry recovers a saved message when its original request did not send alerts',async t=>{
 const s=setup(t);s.enqueue();await retryCustomerPortalAlerts(s.db);assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,1);
});
test('delivery receipts are restricted to the manager snapshot and retry requires manager sign-in',async t=>{
 const s=setup(t);s.enqueue();s.events=[{id:eventId,actor:'workshop',kind:'message',created_at:new Date().toISOString(),seq:1,details:{},message:'Update'}];
 assert.equal((await portalSnapshot(s.db,{job:s.job})).alerts,undefined);
 assert.equal((await portalSnapshot(s.db,{job:s.job},{staff:true,mechanic:true})).alerts,undefined);
 assert.equal((await portalSnapshot(s.db,{job:s.job},{staff:true})).alerts.length,1);
 const res={setHeader(){},status(n){this.code=n;return this;},json(){}};
 await handler({method:'POST',headers:{host:'planner.invalid','content-type':'application/json'},body:{action:'portal-alert-retry',job_id:jobId,event_id:eventId}},res);assert.equal(res.code,401);
});
test('database trigger queues only new workshop messages atomically and keeps the queue private',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create table jobs(id uuid primary key,registration text,customer_email text,customer_phone text,customer_name text,booking_date date);create table customer_portal_events(id uuid primary key,job_id uuid,registration text,customer_email text,kind text,actor text,created_at timestamptz default now());`);
  await db.query('insert into jobs values($1,$2,$3,$4,$5,$6)',[jobId,job.registration,job.customer_email,job.customer_phone,job.customer_name,date]);
  await db.exec(readFileSync('supabase/migrations/20261110065303_customer_portal_message_alerts.sql','utf8'));
  const insert=(id,kind,actor)=>db.query('insert into customer_portal_events(id,job_id,registration,customer_email,kind,actor) values($1,$2,$3,$4,$5,$6)',[id,jobId,job.registration,job.customer_email,kind,actor]);
  await insert(eventId,'message','workshop');
  await insert('33333333-3333-4333-8333-333333333333','message','customer');
  await insert('44444444-4444-4444-8444-444444444444','correspondence','workshop');
  await insert('55555555-5555-4555-8555-555555555555','approval_request','workshop');
  assert.equal((await db.query('select count(*)::int n from customer_portal_alerts')).rows[0].n,1);
  await db.exec('begin');await insert('66666666-6666-4666-8666-666666666666','message','workshop');await db.exec('rollback');assert.equal((await db.query('select count(*)::int n from customer_portal_alerts')).rows[0].n,1);
  const permissions=(await db.query("select has_table_privilege('anon','customer_portal_alerts','select') a,has_table_privilege('authenticated','customer_portal_alerts','insert') b,has_function_privilege('anon','vecta_queue_customer_portal_alert()','execute') c")).rows[0];assert.deepEqual(permissions,{a:false,b:false,c:false});
 }finally{await db.close();}
});
test('job card keeps manual alerts honest and retries an alert without reposting the message',async()=>{
 const {document}=parseHTML('<html><body><div id="job"><section class="jobWorkSection"></section></div></body></html>');document.hidden=false;
 const calls=[],receipt={event_id:eventId,channels:{email:'sent',whatsapp:'manual'},manual_url:'https://wa.me/447700900123?text=Portal%20message'};
 const window={addEventListener(){}};let id=0;
 const fetch=async(_url,options)=>{const b=JSON.parse(options.body);calls.push(b);return {ok:true,json:async()=>b.action==='portal-job'?{events:[],alerts:[]}:b.action==='approval-list'?{whatsapp:{phone:'447700900123',allowed:true,contact_binding:'test'}}:b.action==='portal-reply'?{ok:true,alerts:receipt}:{...receipt,channels:{email:'sent',whatsapp:'sent'},manual_url:undefined}};};
 vm.runInNewContext(readFileSync('public/js/vecta-portal-workshop.js','utf8'),{window,document,location:{search:''},navigator:{onLine:true},crypto:{randomUUID:()=>String(++id)},fetch,AbortSignal,URLSearchParams,Intl,Date,Event});
 window.VectaPortalWorkshop.mount(document.getElementById('job'),job,true);await new Promise(r=>setImmediate(r));
 const form=document.querySelector('form');form.querySelector('textarea').value='Hello';await form.onsubmit({preventDefault(){}});
 assert.match(form.textContent,/Message saved in the customer portal/);assert.match(form.textContent,/WhatsApp: tap to send/);assert.equal(form.querySelector('a').textContent,'Open WhatsApp and tap Send');
 const retry=[...form.querySelectorAll('button')].find(b=>b.textContent==='Check / retry alerts');await retry.onclick();assert.equal(calls.filter(b=>b.action==='portal-reply').length,1);assert.equal(calls.filter(b=>b.action==='portal-alert-retry').length,1);assert.equal(form.querySelector('a'),null);
});
