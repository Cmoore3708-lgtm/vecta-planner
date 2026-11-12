import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {markPortalRead,markBookingRead} from '../../lib/workshop-read-state.js';
import {portalQueue,portalSnapshot} from '../../lib/customer-portal.js';
import handler from '../../lib/job-progress-handler.js';

const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',jobId='33333333-3333-4333-8333-333333333333';
const job={id:jobId,registration:'TEST001',customer_email:'test@example.invalid',booking_date:'2026-11-20',status:'booked'};
function database(){
 const events=[first,second].map((id,i)=>({id,job_id:jobId,registration:job.registration,customer_email:job.customer_email,seq:i+1,kind:'message',actor:'customer',message:'Message '+i,created_at:'2026-11-12T12:00:00Z',mechanic_at:i?'2026-11-12T12:01:00Z':null,manager_alert:true}));
 const requests=[{id:first,job_id:jobId,status:'awaiting_review',confirmed_time:'09:00',reserved_hours:1,reviewed_at:null}],calls=[];
 const db=async(path,options={})=>{
  const url=new URL(path,'https://test.invalid'),p=url.searchParams,body=options.body&&JSON.parse(options.body);calls.push({url,body,method:options.method});
  const source=url.pathname==='/customer_portal_events'?events:url.pathname==='/website_booking_requests'?requests:url.pathname==='/jobs'?[job]:[];
  const rows=source.filter(row=>[...p].every(([k,v])=>['select','order','limit','or'].includes(k)||v.startsWith('in.')?['select','order','limit','or'].includes(k)||v.slice(4,-1).split(',').includes(row[k]):v==='is.null'?row[k]==null:v==='not.is.null'?row[k]!=null:v.startsWith('eq.')?String(row[k])===v.slice(3):true));
  if(options.method==='PATCH')for(const row of rows)Object.assign(row,body);
  return structuredClone(rows);
 };
 return {db,events,requests,calls};
}

test('only acknowledged UUIDs change; repeats are idempotent and manager/mechanic receipts are independent',async()=>{
 const h=database();
 assert.deepEqual(await markPortalRead(h.db,'manager',[first]),{read_ids:[first]});
 const stamp=h.events[0].manager_read_at;
 await Promise.all([markPortalRead(h.db,'manager',[first]),markPortalRead(h.db,'manager',[first])]);
 assert.equal(h.events[0].manager_read_at,stamp);assert.equal(h.events[1].manager_read_at,undefined);
 assert.deepEqual(await markPortalRead(h.db,'mechanic',[first,second]),{read_ids:[second]});
 assert.equal(h.events[0].mechanic_read_at,undefined);assert.ok(h.events[1].mechanic_read_at);assert.equal(h.events[1].manager_read_at,undefined);
 for(const call of h.calls.filter(c=>c.method==='PATCH'))assert.equal(Object.keys(call.body).length,1);
 h.events[1].actor='workshop';assert.deepEqual(await markPortalRead(h.db,'manager',[second]),{read_ids:[]});
});
test('a server receipt appears on other workshop devices but is not exposed to the customer',async()=>{
 const h=database();await markPortalRead(h.db,'manager',[first]);
 const pc=await portalQueue(h.db),phone=await portalQueue(h.db);
 assert.equal(pc.events[0].read_at,phone.events[0].read_at);assert.ok(phone.events[0].read_at);assert.equal(phone.events[1].read_at,null);
 const customer=await portalSnapshot(h.db,{job});assert.equal('read_at' in customer.events[0],false);
 const mechanic=await portalSnapshot(h.db,{job},{staff:true,mechanic:true});assert.equal(mechanic.events.length,1);assert.equal(mechanic.events[0].read_at,null);
});
test('opening a booking writes only reviewed_at and never accepts or reschedules it',async()=>{
 const h=database(),before=structuredClone(h.requests[0]);
 await markBookingRead(h.db,'manager',{job_id:jobId});const stamp=h.requests[0].reviewed_at;assert.ok(stamp);
 await markBookingRead(h.db,'manager',{request_id:first});assert.equal(h.requests[0].reviewed_at,stamp);
 assert.deepEqual({...h.requests[0],reviewed_at:null},before);
 for(const call of h.calls.filter(c=>c.method==='PATCH'))assert.deepEqual(Object.keys(call.body),['reviewed_at']);
});
test('invalid IDs, oversized batches and unauthorised roles cannot write receipts',async()=>{
 const db=()=>{throw Error('Database must not be touched');};
 for(const ids of [[],['invalid'],[first,')'],Array(101).fill(first)])await assert.rejects(markPortalRead(db,'manager',ids),/valid messages/);
 await assert.rejects(markPortalRead(db,'customer',[first]),/sign-in/);
 await assert.rejects(markBookingRead(db,'mechanic',{request_id:first}),/Workshop Pro/);
 await assert.rejects(markBookingRead(db,'manager',{request_id:'invalid'}),/website booking/);
});
test('receipt endpoints require workshop authentication and reject cross-site writes',async t=>{
 const previous={VECTA_MAIN_USER:process.env.VECTA_MAIN_USER,VECTA_MAIN_PASSWORD:process.env.VECTA_MAIN_PASSWORD};Object.assign(process.env,{VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'test-password'});
 t.after(()=>{for(const [k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 for(const action of ['portal-read','booking-read'])for(const cross of [false,true]){
  const res={setHeader(){},status(code){this.code=code;return this;},json(){}};
  await handler({method:'POST',headers:{host:'planner.invalid','content-type':'application/json',...(cross?{origin:'https://other.invalid'}:{})},body:{action,event_ids:[first],request_id:first}},res);
  assert.equal(res.code,cross?403:401);
 }
});
test('the additive migration preserves old bookings and keeps unread defaults and permissions',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create table customer_portal_events(id uuid primary key,actor text,message text);alter table customer_portal_events enable row level security;create table website_booking_requests(id uuid primary key,status text);alter table website_booking_requests enable row level security;`);
  await db.query('insert into customer_portal_events values($1,$2,$3)',[first,'customer','Keep this message']);
  await db.query('insert into website_booking_requests values($1,$2)',[first,'awaiting_review']);
  const sql=readFileSync('supabase/migrations/20261112152341_shared_alert_read_state.sql','utf8');await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query('select * from customer_portal_events')).rows,[{id:first,actor:'customer',message:'Keep this message',manager_read_at:null,mechanic_read_at:null}]);
  assert.deepEqual((await db.query('select * from website_booking_requests')).rows,[{id:first,status:'awaiting_review',reviewed_at:null}]);
  assert.equal((await db.query("select has_table_privilege('anon','customer_portal_events','update') a")).rows[0].a,false);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='customer_portal_events'")).rows[0].relrowsecurity,true);
 }finally{await db.close();}
});
