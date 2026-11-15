import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {londonDay} from '../../lib/job-progress.js';
import {photoBinding} from '../../lib/job-workshop-photos.js';
import {sceneFingerprint} from '../../lib/progress-scene-model.js';
import {sendWorkshopStarted,retryWorkshopStarted,workshopStartedMessage,workshopImage,uploadWorkshopImage} from '../../lib/staff-workshop-whatsapp.js';
const id='11111111-1111-4111-8111-111111111111';
function setup(t){
 const now=Date.now(),date=londonDay(now);
 const vars={VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example',VITE_SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'test-only',WHATSAPP_ACCESS_TOKEN:'test-wa',WHATSAPP_PHONE_NUMBER_ID:'123456',WHATSAPP_WORKSHOP_STARTED_TEMPLATE:'vecta_workshop_started',WHATSAPP_WORKSHOP_STARTED_ENABLED:'1',WHATSAPP_GRAPH_VERSION:'v23.0',VECTA_PROGRESS_SCENES_ENABLED:'1'};
 const old=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]])),fetch=global.fetch;
 Object.assign(process.env,vars);t.after(()=>{global.fetch=fetch;for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const s={now,job:{id,registration:'TEST01',booking_date:date,status:'in_progress',customer_account:'STAFF',customer_email:'test@example.invalid',customer_phone:'07700 900123'},account:'STAFF',allowed:true,settings:[],sent:[],ledgers:new Map(),images:0,uploads:0};
 s.row={job_id:id,registration:s.job.registration,booking_date:date,customer_email:s.job.customer_email,customer_phone:s.job.customer_phone,created_at:new Date(now-1000).toISOString(),status:'queued',attempts:0,next_attempt_at:new Date(0).toISOString()};
 s.db=async(path,opts={})=>{
  const u=new URL(path,'https://database.example'),p=u.searchParams,b=opts.body&&JSON.parse(opts.body);
  if(u.pathname==='/staff_workshop_start_alerts'){
   if(!s.row)return [];
   if(opts.method==='PATCH'){
    if(p.has('attempts')&&Number(p.get('attempts').slice(3))!==s.row.attempts||p.has('lease_id')&&p.get('lease_id').slice(3)!==s.row.lease_id||p.has('or')&&Date.parse(s.row.lease_until)>now)return [];
    if(s.failSave&&b.status)throw Error('status save failed');
    Object.assign(s.row,b);
   }
   return [{...s.row}];
  }
  if(u.pathname==='/jobs')return s.job?[{...s.job}]:[];
  if(u.pathname==='/workshop_settings'){
   const key=p.get('id');
   if(key==='eq.jobcustomer:'+id)return s.account===null?[]:[{value:{customer_account:s.account}}];
   if(key==='eq.approval-whatsapp:'+id)return [{value:{phone:'447700900123',binding:photoBinding(s.job),allowed:s.allowed}}];
   if(opts.method==='POST'){s.settings.push(b);return [b];}
   return key?.startsWith('in.')?s.settings:s.settings.filter(r=>'eq.'+r.id===key);
  }
  if(u.pathname==='/website_booking_requests')return [];
  if(u.pathname==='/nmuk_service_reminder_sends'){
   const key=p.get('id')?.slice(3)||b?.id,row=s.ledgers.get(key);
   if(opts.method==='POST'){if(row)return [];s.ledgers.set(key,{...b});return [{...b}];}
   if(opts.method==='PATCH'){if(!row||p.has('status')&&p.get('status')!=='eq.'+row.status)return [];Object.assign(row,b);return [{...row}];}
   return row?[{...row}]:[];
  }
  throw Error('Unexpected DB call '+path);
 };
 global.fetch=async(url,opts)=>{assert.equal(new URL(url).hostname,'graph.facebook.com');s.sent.push(JSON.parse(opts.body));if(s.timeout)throw Error('timeout');return s.response||Response.json({messages:[{id:'wamid.test'}]});};
 s.options={now,imageFor:async()=>{s.images++;return s.noImage?null:{local:true};},upload:async()=>{s.uploads++;await s.onUpload?.();return '998877';}};
 s.send=()=>sendWorkshopStarted(s.db,id,s.options);
 return s;
}
test('Staff start sends the approved image template once with the exact message and private tracking link',async t=>{
 const s=setup(t);assert.equal(await s.send(),'sent');assert.equal(await s.send(),'sent');
 assert.equal(s.sent.length,1);assert.equal(s.uploads,1);
 assert.equal(s.sent[0].template.name,'vecta_workshop_started');assert.equal(s.sent[0].to,'447700900123');
 assert.deepEqual(s.sent[0].template.components[0],{type:'header',parameters:[{type:'image',image:{id:'998877'}}]});
 assert.ok(s.sent[0].template.components[1].parameters[0].text.length>50);
 const audit=s.ledgers.get('workshop-start-wa:'+id);
 assert.equal(audit.status,'sent');assert.ok(audit.message_payload.text.startsWith(workshopStartedMessage));
});
test('concurrent start and scheduled retry cannot send duplicates',async t=>{
 const s=setup(t);await Promise.all([s.send(),s.send(),s.send()]);assert.equal(s.sent.length,1);
});
test('only Staff qualifies; saved account classification takes priority',async t=>{
 const s=setup(t);
 for(const account of ['NMUK','NMUK INTERNAL','CONTRACTOR','WPC','']){
  s.account=account;s.job.customer_account=account;s.row.status='queued';s.row.next_attempt_at=new Date(0).toISOString();
  assert.equal(await s.send(),'not_staff');
 }
 s.account='NMUK';s.job.customer_account='STAFF';s.row.status='queued';s.row.next_attempt_at=new Date(0).toISOString();assert.equal(await s.send(),'not_staff');
 assert.equal(s.images+s.uploads+s.sent.length,0);
});
test('preview, disabled and unconfigured channels do no database, image or provider work',async t=>{
 const s=setup(t),db=()=>{throw Error('must not access DB');};
 process.env.WHATSAPP_WORKSHOP_STARTED_ENABLED='0';assert.equal(await sendWorkshopStarted(db,id),'not_configured');
 process.env.WHATSAPP_WORKSHOP_STARTED_ENABLED='1';delete process.env.WHATSAPP_ACCESS_TOKEN;assert.equal(await sendWorkshopStarted(db,id),'not_configured');
 process.env.WHATSAPP_ACCESS_TOKEN='test';process.env.VERCEL_ENV='preview';assert.equal(await sendWorkshopStarted(db,id),'not_configured');await retryWorkshopStarted(db);
 assert.equal(s.sent.length,0);
});
test('no permission, stale jobs, deleted records and changed contacts never prepare an image or send',async t=>{
 const cases=[['no_permission',s=>s.allowed=false],['missing_contact',s=>{s.job.customer_phone='';s.row.customer_phone='';}],['expired',s=>s.row.created_at=new Date(s.now-7200001).toISOString()],['closed',s=>s.job.status='ready_to_invoice'],['closed',s=>s.job.archived=true],['closed',s=>s.job.deleted=true],['closed',s=>s.job.completed_at=new Date().toISOString()],['contact_changed',s=>s.job.customer_phone='07700 900999'],['contact_changed',s=>s.job.registration='OTHER'],['contact_changed',s=>s.job.customer_email='other@example.invalid'],['contact_changed',s=>s.job=null]];
 for(const [expected,change]of cases)await t.test(expected,async t=>{const s=setup(t);change(s);assert.equal(await s.send(),expected);assert.equal(s.images+s.sent.length,0);});
});
test('missing images wait for retry; expired messages are retired',async t=>{
 const s=setup(t);s.noImage=true;assert.equal(await s.send(),'waiting_image');assert.equal(s.sent.length,0);
 s.row.next_attempt_at=new Date(0).toISOString();s.row.created_at=new Date(s.now-7200001).toISOString();assert.equal(await s.send(),'expired');
});
test('contact, consent and Staff classification are checked again after media upload',async t=>{
 for(const change of [s=>s.job.customer_phone='07700 900999',s=>s.allowed=false,s=>s.account='NMUK',s=>s.job.status='completed'])await t.test('changed during upload',async t=>{const s=setup(t);s.onUpload=()=>change(s);assert.notEqual(await s.send(),'sent');assert.equal(s.sent.length,0);});
});
test('provider timeout remains pending permanently instead of resending',async t=>{
 const s=setup(t);s.timeout=true;assert.equal(await s.send(),'pending');
 s.row.status='unavailable';s.row.next_attempt_at=new Date(0).toISOString();assert.equal(await s.send(),'pending');assert.equal(s.sent.length,1);
});
test('definite provider rejection may retry; a lost status write reconciles the existing receipt',async t=>{
 const s=setup(t);s.response=Response.json({error:{code:132000}},{status:400});assert.equal(await s.send(),'failed');
 s.response=null;s.row.next_attempt_at=new Date(0).toISOString();s.failSave=true;await assert.rejects(s.send(),/status save failed/);
 s.failSave=false;s.row.lease_until=null;s.row.next_attempt_at=new Date(0).toISOString();assert.equal(await s.send(),'sent');assert.equal(s.sent.length,2);
});
test('only identity-matched published scenes are reused; missing scenes request generation once',async t=>{
 const s=setup(t),identity={registration:'TEST01',make:'Nissan',model:'Qashqai',colour:'GREEN',image_url:'https://www.haynespro-assets.com/workshop/images/123.svg'};
 s.settings=[{id:'vehicle_identity:TEST01',value:{...identity,imageUrl:identity.image_url}}];
 assert.equal(await workshopImage(s.db,s.job,s.now),null);
 const key='a'.repeat(64),manifest={status:'ready',registration:'TEST01',identity,fingerprint:sceneFingerprint(identity),key,scenes:Object.fromEntries(['waiting','underway','ready'].map(stage=>[stage,'https://database.example/storage/v1/object/public/progress-scenes/'+key+'/'+stage+'.webp']))};
 s.settings.push({id:'progress_scenes_v1:TEST01',value:manifest});
 assert.deepEqual(await workshopImage(s.db,s.job,s.now),{url:manifest.scenes.underway});
 const trusted=manifest.scenes.underway;manifest.scenes.underway='https://untrusted.example/car.webp';
 assert.equal(await workshopImage(s.db,s.job,s.now),null);manifest.scenes.underway=trusted;
 manifest.identity={...identity,colour:'RED'};manifest.fingerprint='b'.repeat(64);
 assert.equal(await workshopImage(s.db,s.job,s.now),null);
 assert.equal(s.settings.filter(r=>r.id==='progress_scene_request_v1:TEST01').length,1);
});
test('media adapter sends JPEG bytes to Meta without sending a message',async t=>{
 const s=setup(t);let calls=0;
 global.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://graph.facebook.com/v23.0/123456/media');assert.equal(opts.body.get('file').type,'image/jpeg');assert.ok(opts.body.get('file').size<5000000);const bytes=new Uint8Array(await opts.body.get('file').arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[255,216,255]);return Response.json({id:'12345'});};
 assert.equal(await uploadWorkshopImage({local:true},{url:'https://graph.facebook.com/v23.0/123456/messages',token:'test'}),'12345');assert.equal(calls,1);assert.equal(s.sent.length,0);
});
test('database queue is atomic, private, Staff only, future transitions only and once per job',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create table jobs(id uuid primary key,registration text,customer_email text,customer_phone text,booking_date date,status text,archived boolean,customer_account text,card_type text);create table workshop_settings(id text primary key,value jsonb);`);
  const add=async(n,account='STAFF',status='booked',date=londonDay())=>{const jobId=n.toString().padStart(8,'0')+'-1111-4111-8111-111111111111';await db.query('insert into jobs values($1,$2,$3,$4,$5,$6,false,$7,\'job\')',[jobId,'TEST01','test@example.invalid','07700900123',date,status,account]);return jobId;};
  await add(1,'STAFF','in_progress');
  await db.exec(readFileSync('supabase/migrations/20261110204836_staff_workshop_started_whatsapp.sql','utf8'));
  assert.equal((await db.query('select count(*)::int n from staff_workshop_start_alerts')).rows[0].n,0);
  const staff=await add(2);await add(3,'NMUK');await add(4,'WPC');await add(5,'STAFF','quote');await add(6,'STAFF','booked','2020-01-01');
  const changed=await add(7,'STAFF'),metadataStaff=await add(8,'');
  await db.query('insert into workshop_settings values($1,$2),($3,$4)',['jobcustomer:'+changed,{customer_account:'NMUK'},'jobcustomer:'+metadataStaff,{customer_account:'STAFF'}]);
  await db.exec("update jobs set status='in_progress'");
  assert.deepEqual((await db.query('select job_id from staff_workshop_start_alerts order by job_id')).rows.map(r=>r.job_id),[staff,metadataStaff]);
  await db.query("update jobs set status='booked' where id=$1",[staff]);await db.query("update jobs set status='in_progress' where id=$1",[staff]);
  assert.equal((await db.query('select count(*)::int n from staff_workshop_start_alerts')).rows[0].n,2);
  const rolled=await add(9);await db.exec('begin');await db.query("update jobs set status='in_progress' where id=$1",[rolled]);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from staff_workshop_start_alerts')).rows[0].n,2);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from staff_workshop_start_alerts'),/permission denied/);await db.exec('reset role');}
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='staff_workshop_start_alerts'")).rows[0].relrowsecurity,true);
 }finally{await db.close();}
});
